package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"feedback-portal/internal/config"
	"feedback-portal/internal/db"
	"feedback-portal/internal/models"
	"feedback-portal/internal/repository"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/aws/aws-lambda-go/events"
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/google/uuid"
	awsutils "feedback-portal/internal/aws_utils"
)

var cfg config.Config

func init() {
	cfg = config.Load()
	db.Init(cfg.DBUrl)
}

func main() {
	lambda.Start(handleRequest)
}

func handleRequest(ctx context.Context, req events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	path := req.Path

	// Simple routing based on path
	if req.HTTPMethod == "POST" && path == "/feedback" {
		log.Printf("[GIN] routing to createFeedback")
		return createFeedback(ctx, req)
	}

	if req.HTTPMethod == "GET" && path == "/feedback" {
		log.Printf("[GIN] routing to listFeedbackByTenant")
		return listFeedbackByTenant(ctx, req)
	}

	// Extract ID from path like /feedback/123
	id := extractID(path)

	if req.HTTPMethod == "GET" && id != "" && path == "/feedback/"+id {
		return getFeedback(ctx, req)
	}

	// Check for status update FIRST (before general update)
	if req.HTTPMethod == "PUT" && strings.HasSuffix(path, "/status") {
		return updateFeedbackStatus(ctx, req)
	}

	if req.HTTPMethod == "PUT" && id != "" && path == "/feedback/"+id {
		return updateFeedback(ctx, req)
	}

	if req.HTTPMethod == "DELETE" && id != "" && path == "/feedback/"+id {
		return deleteFeedback(ctx, req)
	}

	if req.HTTPMethod == "GET" && strings.HasSuffix(path, "/comments") && len(path) > 20 {
		return listComments(ctx, req)
	}

	if req.HTTPMethod == "POST" && strings.HasSuffix(path, "/comments") && len(path) > 20 {
		return createComment(ctx, req)
	}

	if req.HTTPMethod == "DELETE" && path == "/comments/"+id && len(path) > 20 {
		return deleteComment(ctx, req)
	}

	if req.HTTPMethod == "POST" && strings.HasSuffix(path, "/vote") && len(path) > 20 {
		return addVote(ctx, req)
	}

	if req.HTTPMethod == "DELETE" && strings.HasSuffix(path, "/vote") && len(path) > 20 {
		return removeVote(ctx, req)
	}

	if req.HTTPMethod == "POST" && strings.HasPrefix(path, "/attachment/") {
		// Check if it's the confirm endpoint (existing presigned URL flow)
		if len(path) > 11 && path[11:] == "/confirm" {
			return confirmAttachment(ctx, req)
		}
		// Original flow: POST /attachment/{id} (direct upload through Lambda)
		return createAttachment(ctx, req)
	}

	if req.HTTPMethod == "GET" && strings.HasPrefix(path, "/attachment/") {
		// Check if presigned URL is requested via query parameter
		if _, ok := req.QueryStringParameters["presigned"]; ok {
			return getPresignedUploadURL(ctx, req)
		}
		// Original flow: GET /attachment/{id} (download URL placeholder)
		return getAttachmentDownloadURL(ctx, req)
	}

	// List attachments for a feedback
	if req.HTTPMethod == "GET" && strings.HasSuffix(path, "/attachments") {
		return listAttachments(ctx, req)
	}

	// Delete attachment (format: /attachment/{feedbackId}/{attachmentId})
	if req.HTTPMethod == "DELETE" && strings.HasPrefix(path, "/attachment/") {
		return deleteAttachment(ctx, req)
	}

	// Handle finalize endpoint: POST /feedback/{id}/finalize
	if req.HTTPMethod == "POST" && strings.Contains(path, "/finalize") {
		return finalizeFeedback(ctx, req)
	}

	return notFound()
}

func extractID(path string) string {
	parts := make([]string, 0)
	for _, part := range splitPath(path) {
		if part != "" {
			parts = append(parts, part)
		}
	}
	if len(parts) >= 2 {
		return parts[1]
	}
	return ""
}

func splitPath(path string) []string {
	return strings.FieldsFunc(path, func(r rune) bool {
		return r == '/'
	})
}

func notFound() (events.APIGatewayProxyResponse, error) {
	body, _ := json.Marshal(map[string]string{"error": "not found"})
	return events.APIGatewayProxyResponse{
		StatusCode: http.StatusNotFound,
		Body:       string(body),
	}, nil
}

func createFeedback(ctx context.Context, req events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	var f models.Feedback
	if err := json.Unmarshal([]byte(req.Body), &f); err != nil {
		body, _ := json.Marshal(map[string]string{"error": "invalid request body"})
		return events.APIGatewayProxyResponse{StatusCode: http.StatusBadRequest, Body: string(body)}, nil
	}

	f.ID = uuid.New().String()
	f.Status = "OPEN"
	f.VoteCount = 0
	f.CommentCount = 0

	if err := repository.CreateFeedback(f); err != nil {
		body, _ := json.Marshal(map[string]string{"error": err.Error()})
		return events.APIGatewayProxyResponse{StatusCode: http.StatusInternalServerError, Body: string(body)}, nil
	}

	// Don't publish FEEDBACK_CREATED event here
	// Instead, the UI will call finalizeFeedback after uploading all attachments
	// This ensures all attachments are ready before creating the Jira ticket

	body, _ := json.Marshal(f)
	return events.APIGatewayProxyResponse{
		StatusCode: http.StatusOK,
		Body:       string(body),
	}, nil
}

func getFeedback(ctx context.Context, req events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	id := extractID(req.Path)
	f, err := repository.GetFeedback(id)
	if err != nil {
		body, _ := json.Marshal(map[string]string{"error": "not found"})
		return events.APIGatewayProxyResponse{StatusCode: http.StatusNotFound, Body: string(body)}, nil
	}
	body, _ := json.Marshal(f)
	return events.APIGatewayProxyResponse{
		StatusCode: http.StatusOK,
		Body:       string(body),
	}, nil
}

func updateFeedback(ctx context.Context, req events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	id := extractID(req.Path)

	// Get existing feedback
	existing, err := repository.GetFeedback(id)
	if err != nil {
		body, _ := json.Marshal(map[string]string{"error": "feedback not found"})
		return events.APIGatewayProxyResponse{StatusCode: http.StatusNotFound, Body: string(body)}, nil
	}

	// Parse request body to get updated fields
	var updateData map[string]interface{}
	if err := json.Unmarshal([]byte(req.Body), &updateData); err != nil {
		body, _ := json.Marshal(map[string]string{"error": "invalid request body"})
		return events.APIGatewayProxyResponse{StatusCode: http.StatusBadRequest, Body: string(body)}, nil
	}

	// Update fields from request if provided
	if title, ok := updateData["title"].(string); ok {
		existing.Title = title
	}
	if description, ok := updateData["description"].(string); ok {
		existing.Description = description
	}
	if category, ok := updateData["category"].(string); ok {
		existing.Category = category
	}
	if status, ok := updateData["status"].(string); ok {
		existing.Status = status
	}

	// Update in database
	if err := repository.UpdateFeedback(existing); err != nil {
		body, _ := json.Marshal(map[string]string{"error": err.Error()})
		return events.APIGatewayProxyResponse{StatusCode: http.StatusInternalServerError, Body: string(body)}, nil
	}

	// Publish event (non-blocking)
	go func() {
		event := models.FeedbackEvent{
			EventType: "FEEDBACK_UPDATED",
			Feedback:  existing,
			Metadata: models.EventMetadata{
				TenantID:  existing.TenantID,
				Timestamp: utcNow(),
				Source:    "api",
			},
		}
		if err := awsutils.PublishFeedbackEvent(event, cfg); err != nil {
			log.Printf("Failed to publish FEEDBACK_UPDATED event: %v", err)
		}
	}()

	body, _ := json.Marshal(existing)
	return events.APIGatewayProxyResponse{
		StatusCode: http.StatusOK,
		Body:       string(body),
	}, nil
}

func updateFeedbackStatus(ctx context.Context, req events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	id := extractID(req.Path)

	var reqBody struct {
		Status string `json:"status"`
	}
	if err := json.Unmarshal([]byte(req.Body), &reqBody); err != nil {
		body, _ := json.Marshal(map[string]string{"error": "invalid request body"})
		return events.APIGatewayProxyResponse{StatusCode: http.StatusBadRequest, Body: string(body)}, nil
	}

	f, err := repository.GetFeedback(id)
	if err != nil {
		body, _ := json.Marshal(map[string]string{"error": "feedback not found"})
		return events.APIGatewayProxyResponse{StatusCode: http.StatusNotFound, Body: string(body)}, nil
	}

	if err := repository.UpdateFeedbackStatus(id, reqBody.Status); err != nil {
		body, _ := json.Marshal(map[string]string{"error": err.Error()})
		return events.APIGatewayProxyResponse{StatusCode: http.StatusInternalServerError, Body: string(body)}, nil
	}

	f.Status = reqBody.Status
	f.UpdatedAt = utcNow()

	go func() {
		event := models.FeedbackEvent{
			EventType: "FEEDBACK_UPDATED",
			Feedback:  f,
			Metadata: models.EventMetadata{
				TenantID:  f.TenantID,
				Timestamp: utcNow(),
				Source:    "api",
			},
		}
		if err := awsutils.PublishFeedbackEvent(event, cfg); err != nil {
			log.Printf("Failed to publish FEEDBACK_UPDATED status event: %v", err)
		}
	}()

	body, _ := json.Marshal(f)
	return events.APIGatewayProxyResponse{
		StatusCode: http.StatusOK,
		Body:       string(body),
	}, nil
}

func listFeedbackByTenant(ctx context.Context, req events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	tenantID := req.QueryStringParameters["tenant_id"]
	if tenantID == "" {
		body, _ := json.Marshal(map[string]string{"error": "tenant_id query parameter required"})
		return events.APIGatewayProxyResponse{StatusCode: http.StatusBadRequest, Body: string(body)}, nil
	}

	status := req.QueryStringParameters["status"]
	category := req.QueryStringParameters["category"]
	userID := req.QueryStringParameters["user_id"]

	feedbacks, err := repository.ListFeedbackByTenant(tenantID)
	if err != nil {
		body, _ := json.Marshal(map[string]string{"error": err.Error()})
		return events.APIGatewayProxyResponse{StatusCode: http.StatusInternalServerError, Body: string(body)}, nil
	}

	var filtered []models.Feedback
	for _, f := range feedbacks {
		if status != "" && f.Status != status {
			continue
		}
		if category != "" && f.Category != category {
			continue
		}
		if userID != "" && f.UserID != userID {
			continue
		}
		filtered = append(filtered, f)
	}

	body, _ := json.Marshal(filtered)
	return events.APIGatewayProxyResponse{
		StatusCode: http.StatusOK,
		Body:       string(body),
	}, nil
}

func deleteFeedback(ctx context.Context, req events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	id := extractID(req.Path)
	repository.DeleteFeedback(id)
	body, _ := json.Marshal(map[string]string{"message": "deleted"})
	return events.APIGatewayProxyResponse{
		StatusCode: http.StatusOK,
			Body:       string(body),
	}, nil
}

func listComments(ctx context.Context, req events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	feedbackID := extractID(req.Path)
	comments, err := repository.ListComments(feedbackID)
	if err != nil {
		body, _ := json.Marshal(map[string]string{"error": "failed to list attachments"})
		return events.APIGatewayProxyResponse{StatusCode: http.StatusInternalServerError, Body: string(body)}, nil
	}
	body, _ := json.Marshal(comments)
	return events.APIGatewayProxyResponse{
		StatusCode: http.StatusOK,
			Body:       string(body),
	}, nil
}

func createComment(ctx context.Context, req events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	feedbackID := extractID(req.Path)

	var reqBody struct {
		UserID  string `json:"user_id"`
		Content string `json:"content"`
	}
	if err := json.Unmarshal([]byte(req.Body), &reqBody); err != nil {
		body, _ := json.Marshal(map[string]string{"error": "invalid request body"})
		return events.APIGatewayProxyResponse{StatusCode: http.StatusBadRequest, Body: string(body)}, nil
	}

	if reqBody.UserID == "" || reqBody.Content == "" {
		body, _ := json.Marshal(map[string]string{"error": "user_id and content required"})
		return events.APIGatewayProxyResponse{StatusCode: http.StatusBadRequest, Body: string(body)}, nil
	}

	comment := models.Comment{
		ID:         uuid.New().String(),
		FeedbackID: feedbackID,
		UserID:     reqBody.UserID,
		Content:    reqBody.Content,
	}

	if err := repository.CreateComment(comment); err != nil {
		body, _ := json.Marshal(map[string]string{"error": "failed to create attachment record"})
		return events.APIGatewayProxyResponse{StatusCode: http.StatusInternalServerError, Body: string(body)}, nil
	}

	// Increment comment count
	repository.IncrementCommentCount(feedbackID)

	go func() {
		f, _ := repository.GetFeedback(feedbackID)
		event := models.FeedbackEvent{
			EventType: "COMMENT_ADDED",
			Feedback:  f,
			Metadata: models.EventMetadata{
				TenantID:  f.TenantID,
				Timestamp: utcNow(),
				Source:    "api",
			},
		}
		if err := awsutils.PublishFeedbackEvent(event, cfg); err != nil {
			log.Printf("Failed to publish COMMENT_ADDED event: %v", err)
		}
	}()

	body, _ := json.Marshal(comment)
	return events.APIGatewayProxyResponse{
		StatusCode: http.StatusCreated,
		Body:       string(body),
	}, nil
}

func deleteComment(ctx context.Context, req events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	id := extractID(req.Path)
	userID := req.QueryStringParameters["user_id"]

	if userID == "" {
		body, _ := json.Marshal(map[string]string{"error": "user_id required"})
		return events.APIGatewayProxyResponse{StatusCode: http.StatusBadRequest, Body: string(body)}, nil
	}

	// Get comment to find feedback_id before deleting
	comment, err := repository.GetComment(id)
	if err != nil {
		body, _ := json.Marshal(map[string]string{"error": "comment not found"})
		return events.APIGatewayProxyResponse{StatusCode: http.StatusNotFound, Body: string(body)}, nil
	}

	err = repository.DeleteComment(id, userID)
	if err != nil {
		body, _ := json.Marshal(map[string]string{"error": "comment not found or unauthorized"})
		return events.APIGatewayProxyResponse{StatusCode: http.StatusNotFound, Body: string(body)}, nil
	}

	// Decrement comment count
	repository.DecrementCommentCount(comment.FeedbackID)

	body, _ := json.Marshal(map[string]string{"message": "deleted"})
	return events.APIGatewayProxyResponse{
		StatusCode: http.StatusOK,
		Body:       string(body),
	}, nil
}

func addVote(ctx context.Context, req events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	feedbackID := extractID(req.Path)

	var reqBody struct {
		UserID string `json:"user_id"`
	}
	if err := json.Unmarshal([]byte(req.Body), &reqBody); err != nil {
		body, _ := json.Marshal(map[string]string{"error": "invalid request body"})
		return events.APIGatewayProxyResponse{StatusCode: http.StatusBadRequest, Body: string(body)}, nil
	}

	if reqBody.UserID == "" {
		body, _ := json.Marshal(map[string]string{"error": "user_id required"})
		return events.APIGatewayProxyResponse{StatusCode: http.StatusBadRequest, Body: string(body)}, nil
	}

	// Check if already voted
	hasVoted, _ := repository.HasUserVoted(feedbackID, reqBody.UserID)
	if hasVoted {
		// Toggle - remove vote
		repository.DeleteVote(feedbackID, reqBody.UserID)
		repository.DecrementVoteCount(feedbackID)
		body, _ := json.Marshal(map[string]string{"message": "vote removed"})
		return events.APIGatewayProxyResponse{
			StatusCode: http.StatusOK,
			Body:       string(body),
		}, nil
	}

	// Add vote
	vote := models.Vote{
		ID:         uuid.New().String(),
		FeedbackID: feedbackID,
		UserID:     reqBody.UserID,
	}
	repository.CreateVote(vote)
	repository.IncrementVoteCount(feedbackID)

	go func() {
		f, _ := repository.GetFeedback(feedbackID)
		event := models.FeedbackEvent{
			EventType: "VOTE_ADDED",
			Feedback:  f,
			Metadata: models.EventMetadata{
				TenantID:  f.TenantID,
				Timestamp: utcNow(),
				Source:    "api",
			},
		}
		if err := awsutils.PublishFeedbackEvent(event, cfg); err != nil {
			log.Printf("Failed to publish VOTE_ADDED event: %v", err)
		}
	}()

	body, _ := json.Marshal(map[string]string{"message": "voted"})
	return events.APIGatewayProxyResponse{
		StatusCode: http.StatusOK,
		Body:       string(body),
	}, nil
}

func removeVote(ctx context.Context, req events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	feedbackID := extractID(req.Path)

	var reqBody struct {
		UserID string `json:"user_id"`
	}
	if err := json.Unmarshal([]byte(req.Body), &reqBody); err != nil {
		body, _ := json.Marshal(map[string]string{"error": "invalid request body"})
		return events.APIGatewayProxyResponse{StatusCode: http.StatusBadRequest, Body: string(body)}, nil
	}

	if reqBody.UserID == "" {
		body, _ := json.Marshal(map[string]string{"error": "user_id required"})
		return events.APIGatewayProxyResponse{StatusCode: http.StatusBadRequest, Body: string(body)}, nil
	}

	repository.DeleteVote(feedbackID, reqBody.UserID)
	repository.DecrementVoteCount(feedbackID)

	body, _ := json.Marshal(map[string]string{"message": "vote removed"})
	return events.APIGatewayProxyResponse{
		StatusCode: http.StatusOK,
		Body:       string(body),
	}, nil
}

func createAttachment(ctx context.Context, req events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	parts := make([]string, 0)
	for _, part := range splitPath(req.Path) {
		if part != "" {
			parts = append(parts, part)
		}
	}
	if len(parts) < 2 {
		body, _ := json.Marshal(map[string]string{"error": "invalid path"})
		return events.APIGatewayProxyResponse{StatusCode: http.StatusBadRequest, Body: string(body)}, nil
	}

	feedbackID := parts[1]

	// Parse request body
	var reqBody struct {
		FileName string `json:"file_name"`
		FileData string `json:"file_data"` // base64 encoded file content
	}
	if err := json.Unmarshal([]byte(req.Body), &reqBody); err != nil {
		body, _ := json.Marshal(map[string]string{"error": "invalid request body"})
		return events.APIGatewayProxyResponse{StatusCode: http.StatusBadRequest, Body: string(body)}, nil
	}

	// Tenant ID from X-Tenant-ID header (check both uppercase and lowercase)
	tenantID := req.Headers["X-Tenant-ID"]
	if tenantID == "" {
		tenantID = req.Headers["x-tenant-id"]
	}
	if tenantID == "" {
		body, _ := json.Marshal(map[string]string{"error": "X-Tenant-ID header required"})
		return events.APIGatewayProxyResponse{StatusCode: http.StatusBadRequest, Body: string(body)}, nil
	}

	if reqBody.FileName == "" {
		body, _ := json.Marshal(map[string]string{"error": "file_name required"})
		return events.APIGatewayProxyResponse{
			StatusCode: http.StatusBadRequest,
			Body:       string(body),
		}, nil
	}

	// Decode base64 file data
	fileBytes, err := base64.StdEncoding.DecodeString(reqBody.FileData)
	if err != nil {
		body, _ := json.Marshal(map[string]string{"error": "invalid file data"})
		return events.APIGatewayProxyResponse{
			StatusCode: http.StatusBadRequest,
			Body:       string(body),
		}, nil
	}

	// Upload directly to S3
	s3Key := fmt.Sprintf("%s/%s/%s", tenantID, feedbackID, reqBody.FileName)
	if err := awsutils.UploadFile(tenantID, feedbackID, reqBody.FileName, fileBytes, cfg); err != nil {
		// Return the actual S3 error for debugging
		log.Printf("S3 upload error: %v", err)
		body, _ := json.Marshal(map[string]string{"error": fmt.Sprintf("failed to upload file to S3: %v", err)})
		return events.APIGatewayProxyResponse{
			StatusCode: http.StatusInternalServerError,
			Body:       string(body),
		}, nil
	}

	// Create attachment record in database
	a := models.Attachment{
		ID:         uuid.New().String(),
		FeedbackID: feedbackID,
		S3Key:      s3Key,
		FileName:   reqBody.FileName,
	}

	if err := repository.CreateAttachment(a); err != nil {
		body, _ := json.Marshal(map[string]string{"error": "failed to create attachment record"})
		return events.APIGatewayProxyResponse{
			StatusCode: http.StatusInternalServerError,
			Body:       string(body),
		}, nil
	}

	body, _ := json.Marshal(a)
	return events.APIGatewayProxyResponse{
		StatusCode: http.StatusOK,
		Body:       string(body),
	}, nil
}

func listAttachments(ctx context.Context, req events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	feedbackID := extractID(req.Path)
	if feedbackID == "" {
		body, _ := json.Marshal(map[string]string{"error": "feedback id required"})
		return events.APIGatewayProxyResponse{StatusCode: http.StatusBadRequest, Body: string(body)}, nil
	}

	attachments, err := repository.ListAttachments(feedbackID)
	if err != nil {
		body, _ := json.Marshal(map[string]string{"error": "failed to list attachments"})
		return events.APIGatewayProxyResponse{StatusCode: http.StatusInternalServerError, Body: string(body)}, nil
	}

	body, _ := json.Marshal(attachments)
	return events.APIGatewayProxyResponse{
		StatusCode: http.StatusOK,
			Body:       string(body),
	}, nil
}

func getAttachmentDownloadURL(ctx context.Context, req events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// Path format: /attachment/{attachmentId}
	parts := make([]string, 0)
	for _, part := range splitPath(req.Path) {
		if part != "" {
			parts = append(parts, part)
		}
	}

	if len(parts) < 2 {
		body, _ := json.Marshal(map[string]string{"error": "invalid path, expected /attachment/{attachmentId}"})
		return events.APIGatewayProxyResponse{StatusCode: http.StatusBadRequest, Body: string(body)}, nil
	}

	attachmentID := parts[1]

	// Get the attachment from database
	attachment, err := repository.GetAttachment(attachmentID)
	if err != nil {
		body, _ := json.Marshal(map[string]string{"error": "attachment not found"})
		return events.APIGatewayProxyResponse{StatusCode: http.StatusNotFound, Body: string(body)}, nil
	}

	// Parse s3_key to extract tenantID, feedbackID and fileName
	// S3Key format: {tenantID}/{feedbackID}/{fileName}
	pathParts := strings.Split(attachment.S3Key, "/")
	if len(pathParts) < 3 {
		body, _ := json.Marshal(map[string]string{"error": "invalid s3_key format"})
		return events.APIGatewayProxyResponse{StatusCode: http.StatusInternalServerError, Body: string(body)}, nil
	}

	tenantID := pathParts[0]
	feedbackID := pathParts[1]
	fileName := pathParts[len(pathParts)-1]

	// Generate presigned download URL
	downloadURL, err := awsutils.GetPresignedURL(tenantID, feedbackID, fileName, cfg)
	if err != nil {
		log.Printf("Failed to generate download URL: %v", err)
		body, _ := json.Marshal(map[string]string{"error": fmt.Sprintf("failed to generate download URL: %v", err)})
		return events.APIGatewayProxyResponse{StatusCode: http.StatusInternalServerError, Body: string(body)}, nil
	}

	body, _ := json.Marshal(map[string]string{"download_url": downloadURL})
	return events.APIGatewayProxyResponse{
		StatusCode: http.StatusOK,
		Body:       string(body),
	}, nil
}

func deleteAttachment(ctx context.Context, req events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// Path format: /attachment/{feedbackId}/{attachmentId}
	parts := make([]string, 0)
	for _, part := range splitPath(req.Path) {
		if part != "" {
			parts = append(parts, part)
		}
	}

	if len(parts) < 3 {
		body, _ := json.Marshal(map[string]string{"error": "invalid path, expected /attachment/{feedbackId}/{attachmentId}"})
		return events.APIGatewayProxyResponse{StatusCode: http.StatusBadRequest, Body: string(body)}, nil
	}

	feedbackID := parts[1]
	attachmentID := parts[2]

	// Get the attachment from database (validates it exists and belongs to this feedback)
	attachment, err := repository.GetAttachmentByFeedbackID(attachmentID, feedbackID)
	if err != nil {
		body, _ := json.Marshal(map[string]string{"error": "attachment not found"})
		return events.APIGatewayProxyResponse{StatusCode: http.StatusNotFound, Body: string(body)}, nil
	}

	// Parse s3_key to extract tenantID and fileName
	// S3Key format: {tenantID}/{feedbackID}/{fileName}
	pathParts := strings.Split(attachment.S3Key, "/")
	if len(pathParts) < 3 {
		body, _ := json.Marshal(map[string]string{"error": "invalid s3_key format"})
		return events.APIGatewayProxyResponse{StatusCode: http.StatusInternalServerError, Body: string(body)}, nil
	}

	tenantID := pathParts[0]
	fileName := pathParts[len(pathParts)-1] // Last part is the filename

	// Delete from S3
	if err := awsutils.DeleteAttachment(tenantID, feedbackID, fileName, cfg); err != nil {
		log.Printf("Failed to delete file from S3: %v", err)
		body, _ := json.Marshal(map[string]string{"error": fmt.Sprintf("failed to delete file from S3: %v", err)})
		return events.APIGatewayProxyResponse{StatusCode: http.StatusInternalServerError, Body: string(body)}, nil
	}

	// Delete database record
	if err := repository.DeleteAttachment(attachmentID); err != nil {
		log.Printf("Failed to delete attachment from database: %v", err)
		body, _ := json.Marshal(map[string]string{"error": "failed to delete attachment record"})
		return events.APIGatewayProxyResponse{StatusCode: http.StatusInternalServerError, Body: string(body)}, nil
	}

	body, _ := json.Marshal(map[string]string{"message": "deleted"})
	return events.APIGatewayProxyResponse{
		StatusCode: http.StatusOK,
		Body:       string(body),
	}, nil
}

func getPresignedUploadURL(ctx context.Context, req events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// Parse path: /attachment/{feedbackId}?presigned=true&fileName=xxx
	parts := make([]string, 0)
	for _, part := range splitPath(req.Path) {
		if part != "" {
			parts = append(parts, part)
		}
	}

	if len(parts) < 2 {
		body, _ := json.Marshal(map[string]string{"error": "invalid path, expected /attachment/{feedbackId}"})
		return events.APIGatewayProxyResponse{StatusCode: http.StatusBadRequest, Body: string(body)}, nil
	}

	feedbackID := parts[1]
	fileName := req.QueryStringParameters["fileName"]
	if fileName == "" {
		body, _ := json.Marshal(map[string]string{"error": "fileName query parameter required"})
		return events.APIGatewayProxyResponse{StatusCode: http.StatusBadRequest, Body: string(body)}, nil
	}

	// Get feedback to validate it exists
	feedback, err := repository.GetFeedback(feedbackID)
	if err != nil {
		body, _ := json.Marshal(map[string]string{"error": "feedback not found"})
		return events.APIGatewayProxyResponse{StatusCode: http.StatusNotFound, Body: string(body)}, nil
	}

	// Get tenant ID from header
	tenantID := req.Headers["X-Tenant-ID"]
	if tenantID == "" {
		tenantID = req.Headers["x-tenant-id"]
	}
	if tenantID == "" {
		// Use feedback's tenant ID as default
		tenantID = feedback.TenantID
	}

	// Generate presigned URL for upload
	presignedURL, err := awsutils.GetPresignedUploadURL(tenantID, feedbackID, fileName, cfg)
	if err != nil {
		log.Printf("Failed to generate presigned URL: %v", err)
		body, _ := json.Marshal(map[string]string{"error": fmt.Sprintf("failed to generate presigned URL: %v", err)})
		return events.APIGatewayProxyResponse{StatusCode: http.StatusInternalServerError, Body: string(body)}, nil
	}

	s3Key := fmt.Sprintf("%s/%s/%s", tenantID, feedbackID, fileName)

	body, _ := json.Marshal(map[string]interface{}{
		"upload_url": presignedURL,
		"s3_key":     s3Key,
		"file_name":  fileName,
	})
	return events.APIGatewayProxyResponse{
		StatusCode: http.StatusOK,
		Body:       string(body),
	}, nil
}

func confirmAttachment(ctx context.Context, req events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	var reqBody struct {
		FeedbackID string `json:"feedback_id"`
		S3Key      string `json:"s3_key"`
		FileName   string `json:"file_name"`
	}

	if err := json.Unmarshal([]byte(req.Body), &reqBody); err != nil {
		body, _ := json.Marshal(map[string]string{"error": "invalid request body"})
		return events.APIGatewayProxyResponse{StatusCode: http.StatusBadRequest, Body: string(body)}, nil
	}

	if reqBody.FeedbackID == "" || reqBody.S3Key == "" || reqBody.FileName == "" {
		body, _ := json.Marshal(map[string]string{"error": "feedback_id, s3_key, and file_name are required"})
		return events.APIGatewayProxyResponse{StatusCode: http.StatusBadRequest, Body: string(body)}, nil
	}

	// Validate feedback exists
	_, err := repository.GetFeedback(reqBody.FeedbackID)
	if err != nil {
		body, _ := json.Marshal(map[string]string{"error": "feedback not found"})
		return events.APIGatewayProxyResponse{StatusCode: http.StatusNotFound, Body: string(body)}, nil
	}

	// Create attachment record in database
	a := models.Attachment{
		ID:         uuid.New().String(),
			FeedbackID: reqBody.FeedbackID,
		S3Key:      reqBody.S3Key,
		FileName:   reqBody.FileName,
	}

	if err := repository.CreateAttachment(a); err != nil {
		log.Printf("Failed to create attachment record: %v", err)
		body, _ := json.Marshal(map[string]string{"error": "failed to create attachment record"})
		return events.APIGatewayProxyResponse{StatusCode: http.StatusInternalServerError, Body: string(body)}, nil
	}

	body, _ := json.Marshal(a)
	return events.APIGatewayProxyResponse{
		StatusCode: http.StatusOK,
		Body:       string(body),
	}, nil
}

func finalizeFeedback(ctx context.Context, req events.APIGatewayProxyRequest) (events.APIGatewayProxyResponse, error) {
	// Extract feedback ID from path: /feedback/{id}/finalize
	parts := make([]string, 0)
	for _, part := range splitPath(req.Path) {
		if part != "" {
			parts = append(parts, part)
		}
	}
	if len(parts) < 2 {
		body, _ := json.Marshal(map[string]string{"error": "invalid path, expected /feedback/{id}/finalize"})
		return events.APIGatewayProxyResponse{StatusCode: http.StatusBadRequest, Body: string(body)}, nil
	}

	feedbackID := parts[1]

	// Get feedback details
	f, err := repository.GetFeedback(feedbackID)
	if err != nil {
		body, _ := json.Marshal(map[string]string{"error": "feedback not found"})
		return events.APIGatewayProxyResponse{StatusCode: http.StatusNotFound, Body: string(body)}, nil
	}

	// Get all attachments for this feedback
	attachments, err := repository.ListAttachments(feedbackID)
	if err != nil {
		log.Printf("Failed to list attachments for finalize: %v", err)
		// Continue anyway, attachments are optional
	}

	// Build event with attachment information
	event := models.FeedbackEvent{
		EventType: "FEEDBACK_FINALIZED",
		Feedback:  f,
		Metadata: models.EventMetadata{
			TenantID:  f.TenantID,
			Timestamp: utcNow(),
			Source:    "api",
		},
	}

	// Add attachment information to the event
	attachmentData := make([]map[string]string, 0)
	for _, att := range attachments {
		attachmentData = append(attachmentData, map[string]string{
			"s3_key":    att.S3Key,
			"file_name": att.FileName,
		})
	}
	// Store attachment data in the feedback object for the router to use
	// We'll use a custom field that the router can deserialize
	eventTypeWithAttachments := fmt.Sprintf("FEEDBACK_FINALIZED:%d_attachments", len(attachments))
	event.EventType = eventTypeWithAttachments

	// Publish FEEDBACK_FINALIZED event
	if err := awsutils.PublishFeedbackEvent(event, cfg); err != nil {
		body, _ := json.Marshal(map[string]string{"error": fmt.Sprintf("failed to publish finalize event: %v", err)})
		return events.APIGatewayProxyResponse{StatusCode: http.StatusInternalServerError, Body: string(body)}, nil
	}

	log.Printf("Successfully finalized feedback %s with %d attachments for Jira integration", feedbackID, len(attachments))

	// Return success with attachment count
	body, _ := json.Marshal(map[string]interface{}{
		"message":        "Feedback finalized successfully. Jira ticket will be created.",
		"feedback_id":    feedbackID,
		"attachment_count": len(attachments),
	})
	return events.APIGatewayProxyResponse{
		StatusCode: http.StatusOK,
		Body:       string(body),
	}, nil
}

func utcNow() string {
	return time.Now().UTC().Format(time.RFC3339)
}
