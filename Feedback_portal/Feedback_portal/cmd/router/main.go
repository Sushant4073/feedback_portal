package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"strings"
	"time"

	awsutils "feedback-portal/internal/aws_utils"
	"feedback-portal/internal/config"
	"feedback-portal/internal/db"
	"feedback-portal/internal/models"
	"feedback-portal/internal/repository"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
)

var cfg config.Config

func init() {
	cfg = config.Load()
	db.Init(cfg.DBUrl)
}

func handler(ctx context.Context, event events.SQSEvent) error {

	for _, message := range event.Records {
		log.Println("Received SQS message")

		var e models.FeedbackEvent
		if err := json.Unmarshal([]byte(message.Body), &e); err != nil {
			log.Printf("Failed to parse event: %v, raw body: %s", err, message.Body)
			continue
		}

		log.Printf(
			"Processing event: %s, Category: %s, FeedbackID: %s, Tenant: %s",
			e.EventType,
			e.Feedback.Category,
			e.Feedback.ID,
			e.Metadata.TenantID,
		)

		// Route based on category
		switch e.Feedback.Category {

		case "DEFECT":
			log.Printf("Routing DEFECT to Jira integration - FeedbackID: %s", e.Feedback.ID)

			if err := routeToJira(e); err != nil {
				log.Printf("Error routing to Jira: %v", err)
			}

		case "FEATURE":
			log.Printf("Routing FEATURE to Jira integration - FeedbackID: %s", e.Feedback.ID)

			if err := routeToJira(e); err != nil {
				log.Printf("Error routing to Jira: %v", err)
			}

		case "ENHANCEMENT":
			log.Printf("Routing ENHANCEMENT to Jira integration - FeedbackID: %s", e.Feedback.ID)

			if err := routeToJira(e); err != nil {
				log.Printf("Error routing to Jira: %v", err)
			}

		default:
			log.Printf(
				"No routing for category: %s - FeedbackID: %s",
				e.Feedback.Category,
				e.Feedback.ID,
			)
		}
	}

	return nil
}

func routeToJira(e models.FeedbackEvent) error {

	if cfg.JiraBaseURL == "" || cfg.JiraAPIToken == "" || cfg.JiraProjectKey == "" {
		log.Printf(
			"JIRA not configured - skipping integration for FeedbackID: %s",
			e.Feedback.ID,
		)
		return fmt.Errorf("jira not configured")
	}

	feedbackID := e.Feedback.ID

	// Handle FEEDBACK_FINALIZED events - create Jira ticket with all attachments
	// This is the main event that triggers Jira ticket creation in the new flow
	if strings.Contains(e.EventType, "FINALIZED") {
		// Check if Jira mapping already exists (safety check)
		existingJiraID, _, _ := repository.GetJiraMapping(feedbackID)
		if existingJiraID != "" {
			log.Printf(
				"Jira issue %s already exists for FeedbackID: %s - uploading new attachments",
				existingJiraID,
				feedbackID,
			)
			// Upload any new attachments to existing Jira ticket
			if err := uploadAttachmentsToJira(feedbackID, existingJiraID, cfg); err != nil {
				log.Printf("Warning: Failed to upload attachments to Jira: %v", err)
			}
			return syncJiraStatus(feedbackID, existingJiraID, e)
		}

		// Create new Jira ticket
		log.Printf("Creating new Jira issue for FeedbackID: %s (FINALIZED event)", feedbackID)

		log.Printf(
			"Feedback Data - Title: '%s', Description: '%s', Category: '%s'",
			e.Feedback.Title,
			e.Feedback.Description,
			e.Feedback.Category,
		)

		jiraPayload := map[string]interface{}{
			"fields": map[string]interface{}{
				"project": map[string]string{
					"key": cfg.JiraProjectKey,
				},
				"summary":     e.Feedback.Title,
				"description": buildJiraDescription(e.Feedback),
				"issuetype": map[string]string{
					"name": getJiraIssueType(e.Feedback.Category),
				},
			},
		}

		jsonPayload, err := json.Marshal(jiraPayload)
		if err != nil {
			return fmt.Errorf("failed to marshal jira payload: %w", err)
		}

		client := &http.Client{
			Timeout: 30 * time.Second,
		}

		url := fmt.Sprintf("%s/rest/api/2/issue", cfg.JiraBaseURL)

		log.Printf("Jira API URL: %s", url)
		log.Printf("Jira API Request Payload: %s", string(jsonPayload))

		req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(jsonPayload))
		if err != nil {
			return fmt.Errorf("failed to create jira request: %w", err)
		}

		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Accept", "application/json")
		req.Header.Set("Authorization", "Bearer "+cfg.JiraAPIToken)

		resp, err := client.Do(req)
		if err != nil {
			return fmt.Errorf("failed to send jira request: %w", err)
		}
		defer func() { _ = resp.Body.Close() }()

		body, err := io.ReadAll(resp.Body)
		if err != nil {
			return fmt.Errorf("failed to read jira response: %w", err)
		}

		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			return fmt.Errorf(
				"jira api error (status %d): %s",
				resp.StatusCode,
				string(body),
			)
		}

		var jiraResponse map[string]interface{}

		if err := json.Unmarshal(body, &jiraResponse); err != nil {
			return fmt.Errorf("failed to parse jira response: %w", err)
		}

		issueKey, ok := jiraResponse["key"].(string)
		if !ok {
			return fmt.Errorf("no issue key in jira response")
		}

		jiraIssueURL := fmt.Sprintf("%s/browse/%s", cfg.JiraBaseURL, issueKey)

		// Store the Jira mapping
		if err := repository.UpdateJiraMapping(feedbackID, issueKey, jiraIssueURL); err != nil {
			log.Printf("Warning: Failed to store Jira mapping for %s: %v", feedbackID, err)
		}

		// Upload all attachments to Jira
		if err := uploadAttachmentsToJira(feedbackID, issueKey, cfg); err != nil {
			log.Printf("Warning: Failed to upload attachments to Jira: %v", err)
		}

		if err := syncJiraStatus(feedbackID, issueKey, e); err != nil {
			log.Printf("Warning: Failed to sync Jira status for %s: %v", feedbackID, err)
		}

		log.Printf(
			"Successfully created Jira issue %s for FeedbackID: %s",
			issueKey,
			feedbackID,
		)

		return nil
	}

	// Handle other event types (COMMENT_ADDED, VOTE_ADDED) - only sync if Jira ticket exists
	existingJiraID, _, err := repository.GetJiraMapping(feedbackID)
	if err == nil && existingJiraID != "" {
		log.Printf(
			"Jira issue %s exists for %s event - syncing status only",
			existingJiraID,
			e.EventType,
		)
		return syncJiraStatus(feedbackID, existingJiraID, e)
	}

	log.Printf(
		"No Jira ticket exists for %s event on FeedbackID: %s - skipping (Jira not created yet)",
		e.EventType,
		feedbackID,
	)
	return nil
}

func syncJiraStatus(feedbackID, jiraIssueID string, e models.FeedbackEvent) error {

	jiraStatus, err := getJiraStatus(e.Feedback.Status)
	if err != nil {
		log.Printf("No mapping for status %s: %v", e.Feedback.Status, err)
		return nil
	}

	transitionPayload := map[string]interface{}{
		"transition": map[string]string{
			"name": jiraStatus,
		},
	}

	jsonPayload, err := json.Marshal(transitionPayload)
	if err != nil {
		return fmt.Errorf("failed to marshal transition payload: %w", err)
	}

	client := &http.Client{Timeout: 30 * time.Second}

	url := fmt.Sprintf("%s/rest/api/2/issue/%s/transitions", cfg.JiraBaseURL, jiraIssueID)

	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(jsonPayload))
	if err != nil {
		return err
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+cfg.JiraAPIToken)

	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		log.Printf(
			"Failed to transition Jira issue (status %d): %s",
			resp.StatusCode,
			string(body),
		)
	}

	log.Printf(
		"Synced status %s -> Jira: %s for FeedbackID: %s",
		e.Feedback.Status,
		jiraStatus,
		feedbackID,
	)

	return nil
}

func buildJiraDescription(f models.Feedback) string {

	var desc strings.Builder

	if f.Description != "" {
		desc.WriteString(f.Description)
	}

	desc.WriteString("\n\n---\nFeedback Details:\n")

	if f.Category != "" {
		fmt.Fprintf(&desc, "Category: %s\n", f.Category)
	}

	if f.TenantID != "" {
		fmt.Fprintf(&desc, "Tenant: %s\n", f.TenantID)
	}

	if f.UserID != "" {
		fmt.Fprintf(&desc, "Submitted by: %s\n", f.UserID)
	}

	return desc.String()
}

func getJiraIssueType(category string) string {

	switch category {

	case "DEFECT":
		return "Bug"

	case "FEATURE":
		return "Story"

	case "ENHANCEMENT":
		return "Story"

	default:
		return "Task"
	}
}

func getJiraStatus(status string) (string, error) {

	switch status {

	case "OPEN":
		return "To Do", nil

	case "IN_PROGRESS":
		return "In Progress", nil

	case "RESOLVED":
		return "Done", nil

	case "CLOSED":
		return "Closed", nil

	default:
		return "", fmt.Errorf("no mapping for status: %s", status)
	}
}

// uploadAttachmentsToJira downloads attachments from S3 and uploads them to Jira
func uploadAttachmentsToJira(feedbackID, jiraIssueKey string, cfg config.Config) error {
	// Get attachments for this feedback
	attachments, err := repository.ListAttachments(feedbackID)
	if err != nil {
		return fmt.Errorf("failed to list attachments: %w", err)
	}

	if len(attachments) == 0 {
		log.Printf("No attachments to upload for FeedbackID: %s", feedbackID)
		return nil
	}

	// Filter attachments that haven't been uploaded to Jira yet
	var pendingAttachments []models.Attachment
	for _, attachment := range attachments {
		if !attachment.UploadedToJira {
			pendingAttachments = append(pendingAttachments, attachment)
		}
	}

	if len(pendingAttachments) == 0 {
		log.Printf("All attachments already uploaded to Jira for FeedbackID: %s", feedbackID)
		return nil
	}

	log.Printf("Found %d new attachments to upload for FeedbackID: %s", len(pendingAttachments), feedbackID)

	// Create HTTP client for Jira API
	client := &http.Client{
		Timeout: 30 * time.Second,
	}

	// Download files from S3 and upload to Jira
	for _, attachment := range pendingAttachments {
		// Parse s3_key to extract tenantID and fileName
		// S3Key format: {tenantID}/{feedbackID}/{fileName}
		pathParts := strings.Split(attachment.S3Key, "/")
		if len(pathParts) < 3 {
			log.Printf("Invalid s3_key format for attachment %s: %s", attachment.FileName, attachment.S3Key)
			continue
		}

		tenantID := pathParts[0]
		fileName := pathParts[len(pathParts)-1]

		// Download file from S3
		fileData, err := awsutils.DownloadFile(tenantID, feedbackID, fileName, cfg)
		if err != nil {
			log.Printf("Warning: Failed to download file %s from S3: %v", attachment.FileName, err)
			continue
		}

		log.Printf("Successfully downloaded %s from S3 (%d bytes)", attachment.FileName, len(fileData))

		// Upload file to Jira using multipart form data
		if err := uploadFileToJira(client, jiraIssueKey, fileName, fileData, cfg); err != nil {
			log.Printf("Warning: Failed to upload file %s to Jira: %v", attachment.FileName, err)
			continue
		}

		log.Printf("Successfully uploaded %s to Jira issue %s", attachment.FileName, jiraIssueKey)

		// Mark attachment as uploaded to Jira
		if markErr := repository.MarkAttachmentUploadedToJira(attachment.ID); markErr != nil {
			log.Printf("Warning: Failed to mark attachment %s as uploaded to Jira: %v", attachment.FileName, markErr)
		}
	}

	log.Printf("Successfully uploaded %d attachments to Jira issue %s", len(pendingAttachments), jiraIssueKey)
	return nil
}

// uploadFileToJira uploads a file to a Jira issue
func uploadFileToJira(client *http.Client, jiraIssueKey, fileName string, fileData []byte, cfg config.Config) error {
	// Create multipart form data
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)

	part, err := writer.CreateFormFile("file", fileName)
	if err != nil {
		return fmt.Errorf("failed to create form file: %w", err)
	}

	if _, err := part.Write(fileData); err != nil {
		return fmt.Errorf("failed to write file data: %w", err)
	}

	if err := writer.Close(); err != nil {
		return fmt.Errorf("failed to close multipart writer: %w", err)
	}

	// Create the request
	url := fmt.Sprintf("%s/rest/api/2/issue/%s/attachments", cfg.JiraBaseURL, jiraIssueKey)
	req, err := http.NewRequest(http.MethodPost, url, body)
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+cfg.JiraAPIToken)
	req.Header.Set("X-Atlassian-Token", "no-check") // Required for Jira attachment uploads
	req.Header.Set("Content-Type", writer.FormDataContentType())

	// Send the request
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	// Read response body for error details
	respBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("jira upload failed (status %d): %s", resp.StatusCode, string(respBody))
	}

	return nil
}

func main() {
	lambda.Start(handler)
}
