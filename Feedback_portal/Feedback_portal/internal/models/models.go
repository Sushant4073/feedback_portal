package models

// Valid status transitions for flexible state machine (no restrictions)
// Common flows: OPEN → IN_PROGRESS → RESOLVED; RESOLVED can go back to OPEN

type Feedback struct {
	ID          string `json:"id"`
	TenantID    string `json:"tenant_id"`
	UserID      string `json:"user_id"`
	Title       string `json:"title"`
	Description string `json:"description"`
	Category    string `json:"category"` // DEFECT, FEATURE, ENHANCEMENT, OTHER
	Status      string `json:"status"`   // OPEN, IN_PROGRESS, RESOLVED, CLOSED
	VoteCount   int    `json:"vote_count"` // Aggregated vote count
	CommentCount int    `json:"comment_count"` // Aggregated comment count
	CreatedAt   string `json:"created_at,omitempty"`
	UpdatedAt   string `json:"updated_at,omitempty"`
	// JIRA integration fields (use pointers to handle NULL values from DB)
	JiraIssueID  *string `json:"jira_issue_id,omitempty"`
	JiraIssueURL *string `json:"jira_issue_url,omitempty"`
}

type Attachment struct {
	ID             string `json:"id"`
	FeedbackID     string `json:"feedback_id"`
	S3Key          string `json:"s3_key"`
	FileName       string `json:"file_name"`
	UploadedToJira bool   `json:"uploaded_to_jira"`
}

type Comment struct {
	ID         string `json:"id"`
	FeedbackID string `json:"feedback_id"`
	UserID     string `json:"user_id"`
	Content    string `json:"content"`
	CreatedAt  string `json:"created_at,omitempty"`
}

type Vote struct {
	ID         string `json:"id"`
	FeedbackID string `json:"feedback_id"`
	UserID     string `json:"user_id"`
	CreatedAt  string `json:"created_at,omitempty"`
}

type FeedbackEvent struct {
	EventType string       `json:"event_type"` // FEEDBACK_CREATED, FEEDBACK_UPDATED, COMMENT_ADDED, VOTE_ADDED
	Feedback  Feedback     `json:"feedback"`
	Metadata  EventMetadata `json:"metadata"`
}

type EventMetadata struct {
	TenantID  string `json:"tenant_id"`
	Timestamp string `json:"timestamp"`
	Source    string `json:"source"`
}
