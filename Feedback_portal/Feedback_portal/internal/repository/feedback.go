package repository

import (
	"database/sql"
	"feedback-portal/internal/db"
	"feedback-portal/internal/models"
	"time"
)

func CreateFeedback(f models.Feedback) error {
	query := `
	INSERT INTO feedback (id, tenant_id, user_id, title, description, category, status, vote_count, comment_count, created_at, updated_at)
	VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
	`
	now := time.Now()
	_, err := db.DB.Exec(query,
		f.ID, f.TenantID, f.UserID,
		f.Title, f.Description,
		f.Category, f.Status,
		f.VoteCount, f.CommentCount, now, now)
	return err
}

func GetFeedback(id string) (models.Feedback, error) {
	var f models.Feedback
	var createdAt, updatedAt time.Time
	var jiraIssueID, jiraIssueURL sql.NullString
	query := `
	SELECT id, tenant_id, user_id, title, description, category, status, vote_count,
		(SELECT COUNT(*) FROM comments WHERE comments.feedback_id = feedback.id) as comment_count,
		created_at, updated_at, jira_issue_id, jira_issue_url
	FROM feedback WHERE id=$1
	`
	err := db.DB.QueryRow(query, id).
		Scan(&f.ID, &f.TenantID, &f.UserID,
			&f.Title, &f.Description,
			&f.Category, &f.Status,
			&f.VoteCount, &f.CommentCount, &createdAt, &updatedAt,
			&jiraIssueID, &jiraIssueURL)
	if err == nil {
		f.CreatedAt = createdAt.Format(time.RFC3339)
		f.UpdatedAt = updatedAt.Format(time.RFC3339)
		// Convert sql.NullString to *string
		if jiraIssueID.Valid {
			f.JiraIssueID = &jiraIssueID.String
		}
		if jiraIssueURL.Valid {
			f.JiraIssueURL = &jiraIssueURL.String
		}
	}
	return f, err
}

func DeleteFeedback(id string) error {
	_, err := db.DB.Exec("DELETE FROM feedback WHERE id=$1", id)
	return err
}

func CreateAttachment(a models.Attachment) error {
	query := `
	INSERT INTO attachment (id, feedback_id, s3_key, file_name, uploaded_to_jira)
	VALUES ($1,$2,$3,$4,$5)
	`
	_, err := db.DB.Exec(query,
		a.ID, a.FeedbackID,
		a.S3Key, a.FileName,
		false, // Default to false when creating new attachment
	)
	return err
}

// Feedback operations
func ListFeedbackByTenant(tenantID string) ([]models.Feedback, error) {
	query := `
	SELECT id, tenant_id, user_id, title, description, category, status, vote_count,
		(SELECT COUNT(*) FROM comments WHERE comments.feedback_id = feedback.id) as comment_count,
		created_at, updated_at, jira_issue_id, jira_issue_url
	FROM feedback WHERE tenant_id=$1
	ORDER BY created_at DESC
	`
	rows, err := db.DB.Query(query, tenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var feedbacks []models.Feedback
	for rows.Next() {
		var f models.Feedback
		var createdAt, updatedAt time.Time
		var jiraIssueID, jiraIssueURL sql.NullString
		err := rows.Scan(
			&f.ID, &f.TenantID, &f.UserID,
			&f.Title, &f.Description,
			&f.Category, &f.Status,
			&f.VoteCount, &f.CommentCount, &createdAt, &updatedAt,
			&jiraIssueID, &jiraIssueURL)
		if err != nil {
			return nil, err
		}
		f.CreatedAt = createdAt.Format(time.RFC3339)
		f.UpdatedAt = updatedAt.Format(time.RFC3339)
		// Convert sql.NullString to *string
		if jiraIssueID.Valid {
			f.JiraIssueID = &jiraIssueID.String
		}
		if jiraIssueURL.Valid {
			f.JiraIssueURL = &jiraIssueURL.String
		}
		feedbacks = append(feedbacks, f)
	}
	return feedbacks, nil
}

func UpdateFeedbackStatus(id string, status string) error {
	query := `
	UPDATE feedback SET status=$1, updated_at=$2 WHERE id=$3
	`
	_, err := db.DB.Exec(query, status, time.Now(), id)
	return err
}

func UpdateFeedback(f models.Feedback) error {
	query := `
	UPDATE feedback SET
		title = $1,
		description = $2,
		category = $3,
		status = $4,
		updated_at = $5
	WHERE id = $6
	`
	_, err := db.DB.Exec(query,
		f.Title, f.Description, f.Category, f.Status, time.Now(), f.ID)
	return err
}

func IncrementVoteCount(id string) error {
	query := `
	UPDATE feedback SET vote_count = vote_count + 1, updated_at = $1 WHERE id=$2
	`
	_, err := db.DB.Exec(query, time.Now(), id)
	return err
}

func DecrementVoteCount(id string) error {
	query := `
	UPDATE feedback SET vote_count = GREATEST(vote_count - 1, 0), updated_at = $1 WHERE id=$2
	`
	_, err := db.DB.Exec(query, time.Now(), id)
	return err
}

func IncrementCommentCount(id string) error {
	query := `
	UPDATE feedback SET comment_count = comment_count + 1, updated_at = $1 WHERE id=$2
	`
	_, err := db.DB.Exec(query, time.Now(), id)
	return err
}

func DecrementCommentCount(id string) error {
	query := `
	UPDATE feedback SET comment_count = GREATEST(comment_count - 1, 0), updated_at = $1 WHERE id=$2
	`
	_, err := db.DB.Exec(query, time.Now(), id)
	return err
}

// Comment operations
func CreateComment(c models.Comment) error {
	query := `
	INSERT INTO comments (id, feedback_id, user_id, content, created_at)
	VALUES ($1,$2,$3,$4,$5)
	`
	_, err := db.DB.Exec(query,
		c.ID, c.FeedbackID, c.UserID, c.Content, time.Now())
	return err
}

func ListComments(feedbackID string) ([]models.Comment, error) {
	query := `
	SELECT id, feedback_id, user_id, content, created_at
	FROM comments WHERE feedback_id=$1 ORDER BY created_at ASC
	`
	rows, err := db.DB.Query(query, feedbackID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var comments []models.Comment
	for rows.Next() {
		var c models.Comment
		var createdAt time.Time
		err := rows.Scan(&c.ID, &c.FeedbackID, &c.UserID, &c.Content, &createdAt)
		if err != nil {
			return nil, err
		}
		c.CreatedAt = createdAt.Format(time.RFC3339)
		comments = append(comments, c)
	}
	return comments, nil
}

func DeleteComment(id string, userID string) error {
	_, err := db.DB.Exec("DELETE FROM comments WHERE id=$1 AND user_id=$2", id, userID)
	return err
}

func GetComment(id string) (models.Comment, error) {
	var c models.Comment
	var createdAt time.Time
	query := `
	SELECT id, feedback_id, user_id, content, created_at
	FROM comments WHERE id=$1
	`
	err := db.DB.QueryRow(query, id).Scan(&c.ID, &c.FeedbackID, &c.UserID, &c.Content, &createdAt)
	if err == nil {
		c.CreatedAt = createdAt.Format(time.RFC3339)
	}
	return c, err
}

// Vote operations
func CreateVote(v models.Vote) error {
	query := `
	INSERT INTO votes (id, feedback_id, user_id, created_at)
	VALUES ($1,$2,$3,$4)
	`
	_, err := db.DB.Exec(query,
		v.ID, v.FeedbackID, v.UserID, time.Now())
	return err
}

func DeleteVote(feedbackID string, userID string) error {
	_, err := db.DB.Exec("DELETE FROM votes WHERE feedback_id=$1 AND user_id=$2", feedbackID, userID)
	return err
}

func HasUserVoted(feedbackID string, userID string) (bool, error) {
	var exists bool
	query := "SELECT EXISTS(SELECT 1 FROM votes WHERE feedback_id=$1 AND user_id=$2)"
	err := db.DB.QueryRow(query, feedbackID, userID).Scan(&exists)
	return exists, err
}

// JIRA integration methods

// UpdateJiraMapping updates the JIRA issue ID and URL for a feedback
func UpdateJiraMapping(feedbackID, jiraIssueID, jiraIssueURL string) error {
	query := `
	UPDATE feedback SET jira_issue_id=$1, jira_issue_url=$2, updated_at=$3 WHERE id=$4
	`
	_, err := db.DB.Exec(query, jiraIssueID, jiraIssueURL, time.Now(), feedbackID)
	return err
}

// GetJiraMapping retrieves the JIRA issue ID and URL for a feedback
func GetJiraMapping(feedbackID string) (string, string, error) {
	query := `
	SELECT jira_issue_id, jira_issue_url FROM feedback WHERE id=$1
	`
	var jiraIssueID, jiraIssueURL sql.NullString
	err := db.DB.QueryRow(query, feedbackID).Scan(&jiraIssueID, &jiraIssueURL)
	// Return empty strings if NULL, otherwise return the value
	var issueID, issueURL string
	if jiraIssueID.Valid {
		issueID = jiraIssueID.String
	}
	if jiraIssueURL.Valid {
		issueURL = jiraIssueURL.String
	}
	return issueID, issueURL, err
}

// Attachment operations
func ListAttachments(feedbackID string) ([]models.Attachment, error) {
	query := `
	SELECT id, feedback_id, s3_key, file_name, uploaded_to_jira
	FROM attachment WHERE feedback_id=$1
	`
	rows, err := db.DB.Query(query, feedbackID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var attachments []models.Attachment
	for rows.Next() {
		var a models.Attachment
		err := rows.Scan(&a.ID, &a.FeedbackID, &a.S3Key, &a.FileName, &a.UploadedToJira)
		if err != nil {
			return nil, err
		}
		attachments = append(attachments, a)
	}
	return attachments, nil
}

func DeleteAttachment(id string) error {
	_, err := db.DB.Exec("DELETE FROM attachment WHERE id=$1", id)
	return err
}

// GetAttachment retrieves an attachment by its ID
func GetAttachment(id string) (models.Attachment, error) {
	var a models.Attachment
	query := `
	SELECT id, feedback_id, s3_key, file_name, uploaded_to_jira
	FROM attachment WHERE id=$1
	`
	err := db.DB.QueryRow(query, id).Scan(&a.ID, &a.FeedbackID, &a.S3Key, &a.FileName, &a.UploadedToJira)
	return a, err
}

// GetAttachmentByFeedbackID retrieves an attachment by its ID and validates it belongs to the given feedback
func GetAttachmentByFeedbackID(attachmentID, feedbackID string) (models.Attachment, error) {
	var a models.Attachment
	query := `
	SELECT id, feedback_id, s3_key, file_name, uploaded_to_jira
	FROM attachment WHERE id=$1 AND feedback_id=$2
	`
	err := db.DB.QueryRow(query, attachmentID, feedbackID).Scan(&a.ID, &a.FeedbackID, &a.S3Key, &a.FileName, &a.UploadedToJira)
	return a, err
}

// MarkAttachmentUploadedToJira marks an attachment as successfully uploaded to Jira
func MarkAttachmentUploadedToJira(attachmentID string) error {
	query := `
	UPDATE attachment SET uploaded_to_jira = TRUE WHERE id=$1
	`
	_, err := db.DB.Exec(query, attachmentID)
	return err
}
