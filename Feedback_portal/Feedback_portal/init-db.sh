#!/bin/bash
# Initialize the Feedback Portal database tables

# Container name (from docker-compose.yml)
DB_CONTAINER=${DB_CONTAINER:-feedback-postgres}

# PostgreSQL connection settings
DB_USER=${DB_USER:-postgres}
DB_PASSWORD=${DB_PASSWORD:-postgres}
DB_NAME=${DB_NAME:-feedback_db}

echo "Initializing database in container: $DB_CONTAINER..."

# Run the SQL directly in the PostgreSQL container
docker exec -i $DB_CONTAINER psql -U $DB_USER -d $DB_NAME << 'EOF'
-- Feedback table
CREATE TABLE IF NOT EXISTS feedback (
    id VARCHAR(36) PRIMARY KEY,
    tenant_id VARCHAR(255) NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(50),
    status VARCHAR(50),
    vote_count INTEGER DEFAULT 0,
    comment_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Comments table
CREATE TABLE IF NOT EXISTS comments (
    id VARCHAR(36) PRIMARY KEY,
    feedback_id VARCHAR(36) NOT NULL REFERENCES feedback(id) ON DELETE CASCADE,
    user_id VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Votes table with unique constraint (one vote per user per feedback)
CREATE TABLE IF NOT EXISTS votes (
    id VARCHAR(36) PRIMARY KEY,
    feedback_id VARCHAR(36) NOT NULL REFERENCES feedback(id) ON DELETE CASCADE,
    user_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(feedback_id, user_id)
);

-- Attachment table
CREATE TABLE IF NOT EXISTS attachment (
    id VARCHAR(36) PRIMARY KEY,
    feedback_id VARCHAR(36) NOT NULL,
    s3_key VARCHAR(500) NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    uploaded_to_jira BOOLEAN DEFAULT FALSE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_feedback_tenant ON feedback(tenant_id);
CREATE INDEX IF NOT EXISTS idx_comments_feedback ON comments(feedback_id);
CREATE INDEX IF NOT EXISTS idx_votes_feedback ON votes(feedback_id);
CREATE INDEX IF NOT EXISTS idx_feedback_jira_id ON feedback(jira_issue_id) WHERE jira_issue_id IS NOT NULL;

-- JIRA integration columns (added separately to handle existing databases)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'feedback' AND column_name = 'jira_issue_id'
    ) THEN
        ALTER TABLE feedback ADD COLUMN jira_issue_id VARCHAR(100);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'feedback' AND column_name = 'jira_issue_url'
    ) THEN
        ALTER TABLE feedback ADD COLUMN jira_issue_url TEXT;
    END IF;
END $$;

-- Add uploaded_to_jira column to attachment table (for existing databases)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'attachment' AND column_name = 'uploaded_to_jira'
    ) THEN
        ALTER TABLE attachment ADD COLUMN uploaded_to_jira BOOLEAN DEFAULT FALSE;
    END IF;
END $$;
EOF

echo "Database initialization complete!"
