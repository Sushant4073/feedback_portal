#!/bin/bash
# deploy.sh - Deploy Feedback Portal Lambda to LocalStack

set -e

# Add Go to PATH
export PATH="/c/Program Files/Go/bin:$PATH"

echo "=== Deploying Feedback Portal to LocalStack ==="

# Create SQS queue and get its URL
echo "Creating SQS queue..."
SQS_URL=$(aws --endpoint-url=http://127.0.0.1:4566 sqs create-queue --queue-name feedback-events --query "QueueUrl" --output text 2>/dev/null)
echo "SQS Queue URL: $SQS_URL"

# === Deploy feedback-api lambda ===
echo ""
echo "=== Deploying feedback-api lambda ==="

echo "Building feedback-api..."
GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -o bootstrap cmd/api/main.go

echo "Packaging feedback-api..."
powershell Compress-Archive -Path bootstrap -DestinationPath api.zip -Force

echo "Deleting existing function (if any)..."
aws --endpoint-url=http://127.0.0.1:4566 lambda delete-function --function-name feedback-api 2>/dev/null || true

echo "Creating feedback-api function..."
aws --endpoint-url=http://127.0.0.1:4566 lambda create-function --function-name feedback-api --runtime provided.al2 --handler bootstrap --zip-file fileb://api.zip --role arn:aws:iam::000000000000:role/lambda-role

echo "Configuring feedback-api..."
aws --endpoint-url=http://127.0.0.1:4566 lambda update-function-configuration --function-name feedback-api --timeout 15 --memory-size 256 --environment "Variables={DB_URL=postgres://postgres:postgres@postgres:5432/feedback_db?sslmode=disable,AWS_REGION=us-west-2,AWS_ENDPOINT_URL=http://localstack-main:4566,AWS_ACCESS_KEY_ID=test,AWS_SECRET_ACCESS_KEY=test,S3_BUCKET=feedback-attachments,SQS_URL=$SQS_URL,AI_CATEGORIZER_URL=http://feedback-ollama:11434/v1/chat/completions,AI_CATEGORIZER_MODEL=llama3.1:8b}"

# === Deploy feedback-router lambda ===
echo ""
echo "=== Deploying feedback-router lambda ==="

echo "Building feedback-router..."
GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -o bootstrap cmd/router/main.go

echo "Packaging feedback-router..."
powershell Compress-Archive -Path bootstrap -DestinationPath router.zip -Force

echo "Deleting existing function (if any)..."
aws --endpoint-url=http://127.0.0.1:4566 lambda delete-function --function-name feedback-router 2>/dev/null || true

echo "Creating feedback-router function..."
aws --endpoint-url=http://127.0.0.1:4566 lambda create-function --function-name feedback-router --runtime provided.al2 --handler bootstrap --zip-file fileb://router.zip --role arn:aws:iam::000000000000:role/lambda-role

echo "Configuring feedback-router..."
aws --endpoint-url=http://127.0.0.1:4566 lambda update-function-configuration --function-name feedback-router --timeout 30 --memory-size 512 --environment "Variables={AWS_ENDPOINT_URL=http://localstack-main:4566,AWS_REGION=us-west-2,DB_URL=postgres://postgres:postgres@postgres:5432/feedback_db?sslmode=disable,S3_BUCKET=feedback-attachments,AI_CATEGORIZER_URL=http://feedback-ollama:11434/v1/chat/completions,AI_CATEGORIZER_MODEL=llama3.1:8b,AI_JIRA_DESCRIPTION_ENRICHMENT=true,JIRA_BASE_URL=${JIRA_BASE_URL},JIRA_PAT=${JIRA_PAT},JIRA_PROJECT_KEY=${JIRA_PROJECT_KEY}}"

# === Create S3 bucket ===
echo ""
echo "Creating S3 bucket..."
aws --endpoint-url=http://127.0.0.1:4566 s3 mb s3://feedback-attachments 2>/dev/null || true

# === Configure S3 CORS for presigned URL uploads ===
echo ""
echo "Configuring S3 CORS..."
aws --endpoint-url=http://127.0.0.1:4566 s3api put-bucket-cors \
    --bucket feedback-attachments \
    --cors-configuration '{
        "CORSRules": [
            {
                "AllowedHeaders": ["*"],
                "AllowedMethods": ["PUT", "GET", "POST", "DELETE"],
                "AllowedOrigins": ["*"],
                "ExposeHeaders": ["ETag"]
            }
        ]
    }' 2>/dev/null || echo "CORS already configured or not applicable"

# === Create SQS event source mapping ===
echo ""
echo "Creating SQS event source mapping..."
SQS_ARN="arn:aws:sqs:us-west-2:000000000000:feedback-events"

# Check if mapping exists and update it, or create new
EXISTING_UUID=$(aws --endpoint-url=http://127.0.0.1:4566 lambda list-event-source-mappings --function-name feedback-router --event-source-arn $SQS_ARN --query "EventSourceMappings[0].UUID" --output text 2>/dev/null)

if [ "$EXISTING_UUID" != "None" ] && [ ! -z "$EXISTING_UUID" ]; then
    echo "SQS mapping already exists ($EXISTING_UUID)"
else
    echo "Creating new mapping..."
    aws --endpoint-url=http://127.0.0.1:4566 lambda create-event-source-mapping --function-name feedback-router --event-source-arn $SQS_ARN --batch-size 10 --starting-position LATEST
fi

echo ""
echo "=== Deployment Complete ==="
echo ""
echo "Summary:"
echo "  - feedback-api lambda: deployed"
echo "  - feedback-router lambda: deployed"
echo "  - SQS queue: feedback-events ($SQS_URL)"
echo "  - S3 bucket: feedback-attachments"
echo ""
