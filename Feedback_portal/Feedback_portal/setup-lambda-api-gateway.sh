#!/bin/bash
# Setup API Gateway for Feedback Portal Lambda in LocalStack
# Run this from the project root directory

set -e

#echo "=== Setting up API Gateway for Feedback Portal Lambda ==="

# AWS LocalStack configuration
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
export AWS_DEFAULT_REGION=us-west-2
export AWS_ENDPOINT_URL=http://localhost:4566

# 1. Build and update Lambda function with new code
# echo ""
# echo "Building Lambda function..."
# cd cmd/api
# # Remove existing build artifacts
# rm -f bootstrap bootstrap.zip 2>/dev/null || true
# GOOS=linux GOARCH=amd64 CGO_ENABLED=0 go build -o bootstrap main.go
# cd ..

# echo "Creating deployment zip..."
# powershell -Command "Compress-Archive -Path '$(pwd)/cmd/api/bootstrap' -DestinationPath '$(pwd)/bootstrap.zip' -Force"

# echo "Updating Lambda function..."
# aws --endpoint-url=$AWS_ENDPOINT_URL lambda update-function-code \
#     --function-name feedback-api \
#     --zip-file fileb://bootstrap.zip

# echo "Waiting for Lambda update..."
# sleep 2

# 2. Create REST API Gateway
echo ""
echo "Creating API Gateway..."
API_ID=$(aws --endpoint-url=$AWS_ENDPOINT_URL apigateway create-rest-api \
    --name "feedback-portal-api" \
    --description "Feedback Portal API" \
    2>/dev/null | grep -o '"id"[^,]*' | cut -d'"' -f4)

if [ -z "$API_ID" ]; then
    # Try to get existing API
    API_ID=$(aws --endpoint-url=$AWS_ENDPOINT_URL apigateway get-rest-apis 2>/dev/null | grep -A1 "feedback-portal-api" | grep -o '"id"[^,]*' | cut -d'"' -f4 | tail -1)
fi

if [ -z "$API_ID" ] || [ "$API_ID" = "null" ]; then
    echo "Error creating/getting API Gateway"
    exit 1
fi

echo "API Gateway ID: $API_ID"

# 3. Get Lambda ARN for integrations (needed early)
echo "Getting Lambda ARN..."
lambda_arn=$(aws --endpoint-url=$AWS_ENDPOINT_URL lambda list-functions --query "Functions[?FunctionName=='feedback-api'].FunctionArn" --output text)
integration_uri="arn:aws:apigateway:us-west-2:lambda:path/2015-03-31/functions/$lambda_arn/invocations"
echo "Lambda ARN: $lambda_arn"

# 4. Get the root resource ID
PARENT_ID=$(aws --endpoint-url=$AWS_ENDPOINT_URL apigateway get-resources \
    --rest-api-id $API_ID 2>/dev/null | grep -o '"id"[^,]*' | cut -d'"' -f4 | head -1)

# 5. Create /feedback resource
echo ""
echo "Creating /feedback resource..."
FEEDBACK_RESOURCE_ID=$(aws --endpoint-url=$AWS_ENDPOINT_URL apigateway create-resource \
    --rest-api-id $API_ID \
    --parent-id $PARENT_ID \
    --path-part feedback 2>/dev/null | grep -o '"id"[^,]*' | cut -d'"' -f4)

# Create methods for /feedback
echo "Creating methods for /feedback..."
aws --endpoint-url=$AWS_ENDPOINT_URL apigateway put-method \
    --rest-api-id $API_ID \
    --resource-id $FEEDBACK_RESOURCE_ID \
    --http-method POST \
    --authorization-type NONE 2>/dev/null

aws --endpoint-url=$AWS_ENDPOINT_URL apigateway put-method \
    --rest-api-id $API_ID \
    --resource-id $FEEDBACK_RESOURCE_ID \
    --http-method GET \
    --authorization-type NONE 2>/dev/null

# 6. Create /{id} resource under /feedback
echo "Creating /{id} resource..."
ID_RESOURCE_ID=$(aws --endpoint-url=$AWS_ENDPOINT_URL apigateway create-resource \
    --rest-api-id $API_ID \
    --parent-id $FEEDBACK_RESOURCE_ID \
    --path-part "{id}" 2>/dev/null | grep -o '"id"[^,]*' | cut -d'"' -f4)

# Create methods for /feedback/{id}
echo "Creating methods for /feedback/{id}..."
aws --endpoint-url=$AWS_ENDPOINT_URL apigateway put-method \
    --rest-api-id $API_ID \
    --resource-id $ID_RESOURCE_ID \
    --http-method GET \
    --authorization-type NONE 2>/dev/null

aws --endpoint-url=$AWS_ENDPOINT_URL apigateway put-method \
    --rest-api-id $API_ID \
    --resource-id $ID_RESOURCE_ID \
    --http-method PUT \
    --authorization-type NONE 2>/dev/null

aws --endpoint-url=$AWS_ENDPOINT_URL apigateway put-method \
    --rest-api-id $API_ID \
    --resource-id $ID_RESOURCE_ID \
    --http-method DELETE \
    --authorization-type NONE 2>/dev/null

# 7. Create /comments resource
echo "Creating /comments resource..."
COMMENTS_RESOURCE_ID=$(aws --endpoint-url=$AWS_ENDPOINT_URL apigateway create-resource \
    --rest-api-id $API_ID \
    --parent-id $ID_RESOURCE_ID \
    --path-part comments 2>/dev/null | grep -o '"id"[^,]*' | cut -d'"' -f4)

aws --endpoint-url=$AWS_ENDPOINT_URL apigateway put-method \
    --rest-api-id $API_ID \
    --resource-id $COMMENTS_RESOURCE_ID \
    --http-method GET \
    --authorization-type NONE 2>/dev/null

aws --endpoint-url=$AWS_ENDPOINT_URL apigateway put-method \
    --rest-api-id $API_ID \
    --resource-id $COMMENTS_RESOURCE_ID \
    --http-method POST \
    --authorization-type NONE 2>/dev/null

# 8. Create /status resource
echo "Creating /status resource..."
STATUS_RESOURCE_ID=$(aws --endpoint-url=$AWS_ENDPOINT_URL apigateway create-resource \
    --rest-api-id $API_ID \
    --parent-id $ID_RESOURCE_ID \
    --path-part status 2>/dev/null | grep -o '"id"[^,]*' | cut -d'"' -f4)

aws --endpoint-url=$AWS_ENDPOINT_URL apigateway put-method \
    --rest-api-id $API_ID \
    --resource-id $STATUS_RESOURCE_ID \
    --http-method PUT \
    --authorization-type NONE 2>/dev/null

# 9. Create /vote resource
echo "Creating /vote resource..."
VOTE_RESOURCE_ID=$(aws --endpoint-url=$AWS_ENDPOINT_URL apigateway create-resource \
    --rest-api-id $API_ID \
    --parent-id $ID_RESOURCE_ID \
    --path-part vote 2>/dev/null | grep -o '"id"[^,]*' | cut -d'"' -f4)

aws --endpoint-url=$AWS_ENDPOINT_URL apigateway put-method \
    --rest-api-id $API_ID \
    --resource-id $VOTE_RESOURCE_ID \
    --http-method POST \
    --authorization-type NONE 2>/dev/null

aws --endpoint-url=$AWS_ENDPOINT_URL apigateway put-method \
    --rest-api-id $API_ID \
    --resource-id $VOTE_RESOURCE_ID \
    --http-method DELETE \
    --authorization-type NONE 2>/dev/null

# 10. Create /finalize resource for triggering Jira ticket creation
echo "Creating /finalize resource..."
FINALIZE_RESOURCE_ID=$(aws --endpoint-url=$AWS_ENDPOINT_URL apigateway create-resource \
    --rest-api-id $API_ID \
    --parent-id $ID_RESOURCE_ID \
    --path-part finalize 2>&1 | grep -o '"id"[^,]*' | cut -d'"' -f4 2>/dev/null || true)

# If resource creation failed or returned empty, try to get existing finalize resource
if [ -z "$FINALIZE_RESOURCE_ID" ] || [ "$FINALIZE_RESOURCE_ID" = "null" ]; then
    echo "Resource may already exist, fetching from existing resources..."
    FINALIZE_RESOURCE_ID=$(aws --endpoint-url=$AWS_ENDPOINT_URL apigateway get-resources \
        --rest-api-id $API_ID 2>&1 | jq -r '.items[] | select(.pathPart=="finalize").id' 2>/dev/null || true)
fi

if [ -z "$FINALIZE_RESOURCE_ID" ] || [ "$FINALIZE_RESOURCE_ID" = "null" ] || [ "$FINALIZE_RESOURCE_ID" = "None" ]; then
    echo "WARNING: Could not get /finalize resource ID, skipping..."
else
    echo "Finalize resource ID: $FINALIZE_RESOURCE_ID"

    # Add POST method to /finalize
    aws --endpoint-url=$AWS_ENDPOINT_URL apigateway put-method \
        --rest-api-id $API_ID \
        --resource-id "$FINALIZE_RESOURCE_ID" \
        --http-method POST \
        --authorization-type NONE 2>&1 | head -c 200 || true

    # Integration for POST /feedback/{id}/finalize
    aws --endpoint-url=$AWS_ENDPOINT_URL apigateway put-integration \
        --rest-api-id $API_ID \
        --resource-id "$FINALIZE_RESOURCE_ID" \
        --http-method POST \
        --type AWS_PROXY \
        --integration-http-method POST \
        --uri "$integration_uri" 2>&1 | head -c 200 || true
    echo "Finalize integration added"
fi

# 11. Create /comments/{commentid} resource for deleting comments (separate from /feedback/{id}/comments)
COMMENT_ROOT_RESOURCE_ID=$(aws --endpoint-url=$AWS_ENDPOINT_URL apigateway create-resource \
    --rest-api-id $API_ID \
    --parent-id $PARENT_ID \
    --path-part comments 2>/dev/null | grep -o '"id"[^,]*' | cut -d'"' -f4)

if [ -z "$COMMENT_ROOT_RESOURCE_ID" ] || [ "$COMMENT_ROOT_RESOURCE_ID" = 'null' ]; then
    COMMENT_ROOT_RESOURCE_ID=$(aws --endpoint-url=$AWS_ENDPOINT_URL apigateway get-resources \
        --rest-api-id $API_ID 2>/dev/null | grep -B1 '"pathPart": "comments"' | grep -o '"id"[^,]*' | cut -d'"' -f4 | head -1)
fi

COMMENT_ID_RESOURCE_ID=$(aws --endpoint-url=$AWS_ENDPOINT_URL apigateway create-resource \
    --rest-api-id $API_ID \
    --parent-id $COMMENT_ROOT_RESOURCE_ID \
    --path-part "{commentid}" 2>/dev/null | grep -o '"id"[^,]*' | cut -d'"' -f4)

if [ -z "$COMMENT_ID_RESOURCE_ID" ] || [ "$COMMENT_ID_RESOURCE_ID" = 'null' ]; then
    COMMENT_ID_RESOURCE_ID=$(aws --endpoint-url=$AWS_ENDPOINT_URL apigateway get-resources \
        --rest-api-id $API_ID 2>/dev/null | grep -B1 '"pathPart": "{commentid}"' | grep -o '"id"[^,]*' | cut -d'"' -f4 | tail -1)
fi

aws --endpoint-url=$AWS_ENDPOINT_URL apigateway put-method \
    --rest-api-id $API_ID \
    --resource-id $COMMENT_ID_RESOURCE_ID \
    --http-method DELETE \
    --authorization-type NONE 2>/dev/null

# 12. Create /attachment resource for file uploads
echo "Creating /attachment resource..."
ATTACHMENT_ROOT_RESOURCE_ID=$(aws --endpoint-url=$AWS_ENDPOINT_URL apigateway create-resource \
    --rest-api-id $API_ID \
    --parent-id $PARENT_ID \
    --path-part attachment \
    --query "id" --output text)

# If /attachment already exists, get its ID
if [ -z "$ATTACHMENT_ROOT_RESOURCE_ID" ]; then
    ATTACHMENT_ROOT_RESOURCE_ID=$(aws --endpoint-url=$AWS_ENDPOINT_URL apigateway get-resources \
        --rest-api-id $API_ID --query "items[?path=='/attachment'].id" --output text)
fi

if [ -z "$ATTACHMENT_ROOT_RESOURCE_ID" ]; then
    echo "ERROR: Failed to create/get /attachment resource"
    exit 1
fi

echo "Creating /attachment/{id} resource..."
ATTACHMENT_ID_RESOURCE_ID=$(aws --endpoint-url=$AWS_ENDPOINT_URL apigateway create-resource \
    --rest-api-id $API_ID \
    --parent-id $ATTACHMENT_ROOT_RESOURCE_ID \
    --path-part "{id}" \
    --query "id" --output text)

# If /attachment/{id} already exists, get its ID
if [ -z "$ATTACHMENT_ID_RESOURCE_ID" ]; then
    ATTACHMENT_ID_RESOURCE_ID=$(aws --endpoint-url=$AWS_ENDPOINT_URL apigateway get-resources \
        --rest-api-id $API_ID --query "items[?path=='/attachment/{id}'].id" --output text)
fi

if [ -z "$ATTACHMENT_ID_RESOURCE_ID" ]; then
    echo "ERROR: Failed to create/get /attachment/{id} resource"
    exit 1
fi

echo "Adding POST method to /attachment/{id}..."
aws --endpoint-url=$AWS_ENDPOINT_URL apigateway put-method \
    --rest-api-id $API_ID \
    --resource-id $ATTACHMENT_ID_RESOURCE_ID \
    --http-method POST \
    --authorization-type NONE 2>/dev/null

# Add GET method to /attachment/{id} for presigned URL requests
echo "Adding GET method to /attachment/{id}..."
aws --endpoint-url=$AWS_ENDPOINT_URL apigateway put-method \
    --rest-api-id $API_ID \
    --resource-id $ATTACHMENT_ID_RESOURCE_ID \
    --http-method GET \
    --authorization-type NONE 2>/dev/null

# 13. Create /attachment/confirm resource for confirming S3 uploads
echo "Creating /attachment/confirm resource..."
ATTACHMENT_CONFIRM_RESOURCE_ID=$(aws --endpoint-url=$AWS_ENDPOINT_URL apigateway get-resources \
    --rest-api-id $API_ID --query "items[?path=='/attachment/confirm'].id" --output text)

if [ -z "$ATTACHMENT_CONFIRM_RESOURCE_ID" ] || [ "$ATTACHMENT_CONFIRM_RESOURCE_ID" = "None" ]; then
    ATTACHMENT_CONFIRM_RESOURCE_ID=$(aws --endpoint-url=$AWS_ENDPOINT_URL apigateway create-resource \
        --rest-api-id $API_ID \
        --parent-id $ATTACHMENT_ROOT_RESOURCE_ID \
        --path-part confirm \
        --query "id" --output text)
fi

if [ -z "$ATTACHMENT_CONFIRM_RESOURCE_ID" ] || [ "$ATTACHMENT_CONFIRM_RESOURCE_ID" = "None" ]; then
    echo "ERROR: Failed to create/get /attachment/confirm resource"
    exit 1
fi

# Add POST method to /attachment/confirm
echo "Adding POST method to /attachment/confirm..."
aws --endpoint-url=$AWS_ENDPOINT_URL apigateway put-method \
    --rest-api-id $API_ID \
    --resource-id $ATTACHMENT_CONFIRM_RESOURCE_ID \
    --http-method POST \
    --authorization-type NONE 2>/dev/null

# 14. Create /attachments resource under /feedback/{id} for listing attachments
ATTACHMENTS_LIST_RESOURCE_ID=$(aws --endpoint-url=$AWS_ENDPOINT_URL apigateway create-resource \
    --rest-api-id $API_ID \
    --parent-id $ID_RESOURCE_ID \
    --path-part attachments 2>/dev/null | grep -o '"id"[^,]*' | cut -d'"' -f4)

# If already exists, get its ID from resources
if [ -z "$ATTACHMENTS_LIST_RESOURCE_ID" ] || [ "$ATTACHMENTS_LIST_RESOURCE_ID" = "null" ]; then
    ATTACHMENTS_LIST_RESOURCE_ID=$(aws --endpoint-url=$AWS_ENDPOINT_URL apigateway get-resources \
        --rest-api-id $API_ID 2>/dev/null | grep -A5 "parentId.*$ID_RESOURCE_ID" | grep -B1 '"pathPart": "attachments"' | grep -o '"id"[^,]*' | cut -d'"' -f4 | head -1)
fi

# Add GET method for listing attachments
aws --endpoint-url=$AWS_ENDPOINT_URL apigateway put-method \
    --rest-api-id $API_ID \
    --resource-id $ATTACHMENTS_LIST_RESOURCE_ID \
    --http-method GET \
    --authorization-type NONE 2>/dev/null

# 15. Create /attachment/{id}/{attachmentId} resource for DELETE operation
echo "Creating /attachment/{id}/{attachmentId} resource for DELETE..."
ATTACHMENT_DELETE_RESOURCE_ID=$(aws --endpoint-url=$AWS_ENDPOINT_URL apigateway create-resource \
    --rest-api-id $API_ID \
    --parent-id $ATTACHMENT_ID_RESOURCE_ID \
    --path-part "{attachmentId}" \
    --query "id" --output text)

# If /attachment/{id}/{attachmentId} already exists, get its ID
if [ -z "$ATTACHMENT_DELETE_RESOURCE_ID" ]; then
    ATTACHMENT_DELETE_RESOURCE_ID=$(aws --endpoint-url=$AWS_ENDPOINT_URL apigateway get-resources \
        --rest-api-id $API_ID --query "items[?path=='/attachment/{id}/{attachmentId}'].id" --output text)
fi

if [ -z "$ATTACHMENT_DELETE_RESOURCE_ID" ] || [ "$ATTACHMENT_DELETE_RESOURCE_ID" = "None" ]; then
    echo "ERROR: Failed to create/get /attachment/{id}/{attachmentId} resource"
    exit 1
fi

# Add DELETE method to /attachment/{id}/{attachmentId}
echo "Adding DELETE method to /attachment/{id}/{attachmentId}..."
aws --endpoint-url=$AWS_ENDPOINT_URL apigateway put-method \
    --rest-api-id $API_ID \
    --resource-id $ATTACHMENT_DELETE_RESOURCE_ID \
    --http-method DELETE \
    --authorization-type NONE 2>/dev/null

# ==================== INTEGRATIONS ====================

# Integration for POST /feedback (create feedback)
echo "Adding Lambda integration for POST /feedback..."
aws --endpoint-url=$AWS_ENDPOINT_URL apigateway put-integration \
    --rest-api-id $API_ID \
    --resource-id $FEEDBACK_RESOURCE_ID \
    --http-method POST \
    --type AWS_PROXY \
    --integration-http-method POST \
    --uri "$integration_uri" 2>/dev/null

# Integration for GET /feedback (list feedback)
echo "Adding Lambda integration for GET /feedback..."
aws --endpoint-url=$AWS_ENDPOINT_URL apigateway put-integration \
    --rest-api-id $API_ID \
    --resource-id $FEEDBACK_RESOURCE_ID \
    --http-method GET \
    --type AWS_PROXY \
    --integration-http-method POST \
    --uri "$integration_uri" 2>/dev/null

# Integration for GET /feedback/{id}
aws --endpoint-url=$AWS_ENDPOINT_URL apigateway put-integration \
    --rest-api-id $API_ID \
    --resource-id $ID_RESOURCE_ID \
    --http-method GET \
    --type AWS_PROXY \
    --integration-http-method POST \
    --uri "$integration_uri" 2>/dev/null

# Integration for PUT /feedback/{id}
aws --endpoint-url=$AWS_ENDPOINT_URL apigateway put-integration \
    --rest-api-id $API_ID \
    --resource-id $ID_RESOURCE_ID \
    --http-method PUT \
    --type AWS_PROXY \
    --integration-http-method POST \
    --uri "$integration_uri" 2>/dev/null

# Integration for DELETE /feedback/{id}
aws --endpoint-url=$AWS_ENDPOINT_URL apigateway put-integration \
    --rest-api-id $API_ID \
    --resource-id $ID_RESOURCE_ID \
    --http-method DELETE \
    --type AWS_PROXY \
    --integration-http-method POST \
    --uri "$integration_uri" 2>/dev/null

# Integration for GET /feedback/{id}/comments
aws --endpoint-url=$AWS_ENDPOINT_URL apigateway put-integration \
    --rest-api-id $API_ID \
    --resource-id $COMMENTS_RESOURCE_ID \
    --http-method GET \
    --type AWS_PROXY \
    --integration-http-method POST \
    --uri "$integration_uri" 2>/dev/null

# Integration for POST /feedback/{id}/comments
aws --endpoint-url=$AWS_ENDPOINT_URL apigateway put-integration \
    --rest-api-id $API_ID \
    --resource-id $COMMENTS_RESOURCE_ID \
    --http-method POST \
    --type AWS_PROXY \
    --integration-http-method POST \
    --uri "$integration_uri" 2>/dev/null

# Integration for PUT /feedback/{id}/status
aws --endpoint-url=$AWS_ENDPOINT_URL apigateway put-integration \
    --rest-api-id $API_ID \
    --resource-id $STATUS_RESOURCE_ID \
    --http-method PUT \
    --type AWS_PROXY \
    --integration-http-method POST \
    --uri "$integration_uri" 2>/dev/null

# Integration for POST /feedback/{id}/vote
aws --endpoint-url=$AWS_ENDPOINT_URL apigateway put-integration \
    --rest-api-id $API_ID \
    --resource-id $VOTE_RESOURCE_ID \
    --http-method POST \
    --type AWS_PROXY \
    --integration-http-method POST \
    --uri "$integration_uri" 2>/dev/null

# Integration for DELETE /feedback/{id}/vote
aws --endpoint-url=$AWS_ENDPOINT_URL apigateway put-integration \
    --rest-api-id $API_ID \
    --resource-id $VOTE_RESOURCE_ID \
    --http-method DELETE \
    --type AWS_PROXY \
    --integration-http-method POST \
    --uri "$integration_uri" 2>/dev/null

# Integration for DELETE /comments/{commentid}
aws --endpoint-url=$AWS_ENDPOINT_URL apigateway put-integration \
    --rest-api-id $API_ID \
    --resource-id $COMMENT_ID_RESOURCE_ID \
    --http-method DELETE \
    --type AWS_PROXY \
    --integration-http-method POST \
    --uri "$integration_uri" 2>/dev/null

# Integration for POST /attachment/{id}
aws --endpoint-url=$AWS_ENDPOINT_URL apigateway put-integration \
    --rest-api-id $API_ID \
    --resource-id $ATTACHMENT_ID_RESOURCE_ID \
    --http-method POST \
    --type AWS_PROXY \
    --integration-http-method POST \
    --uri "$integration_uri" 2>/dev/null

# Integration for GET /attachment/{id} (presigned URL)
aws --endpoint-url=$AWS_ENDPOINT_URL apigateway put-integration \
    --rest-api-id $API_ID \
    --resource-id $ATTACHMENT_ID_RESOURCE_ID \
    --http-method GET \
    --type AWS_PROXY \
    --integration-http-method POST \
    --uri "$integration_uri" 2>/dev/null

# Integration for POST /attachment/confirm
aws --endpoint-url=$AWS_ENDPOINT_URL apigateway put-integration \
    --rest-api-id $API_ID \
    --resource-id $ATTACHMENT_CONFIRM_RESOURCE_ID \
    --http-method POST \
    --type AWS_PROXY \
    --integration-http-method POST \
    --uri "$integration_uri" 2>/dev/null

# Integration for GET /feedback/{id}/attachments
aws --endpoint-url=$AWS_ENDPOINT_URL apigateway put-integration \
    --rest-api-id $API_ID \
    --resource-id $ATTACHMENTS_LIST_RESOURCE_ID \
    --http-method GET \
    --type AWS_PROXY \
    --integration-http-method POST \
    --uri "$integration_uri" 2>/dev/null

# Integration for DELETE /attachment/{id}/{attachmentId}
aws --endpoint-url=$AWS_ENDPOINT_URL apigateway put-integration \
    --rest-api-id $API_ID \
    --resource-id $ATTACHMENT_DELETE_RESOURCE_ID \
    --http-method DELETE \
    --type AWS_PROXY \
    --integration-http-method POST \
    --uri "$integration_uri" 2>/dev/null

# 16. Deploy the API Gateway
echo ""
echo "Deploying API Gateway..."
aws --endpoint-url=$AWS_ENDPOINT_URL apigateway create-deployment \
    --rest-api-id $API_ID \
    --stage-name prod 2>/dev/null

# 17. Add Lambda permission (idempotent)
echo ""
echo "Adding Lambda invoke permission..."

# Try to add permission, ignore error if it already exists
aws --endpoint-url=$AWS_ENDPOINT_URL lambda add-permission \
    --function-name feedback-api \
    --statement-id apigateway-invoke \
    --action lambda:InvokeFunction \
    --principal apigateway.amazonaws.com \
    --source-arn "arn:aws:execute-api:us-west-2:*:*:$API_ID/*/*/*" 2>/dev/null || true

echo "Lambda invoke permission added (or already exists)."

echo ""
echo "=== Setup Complete ==="
echo ""
echo "======================================================"
echo "IMPORTANT: Update your UI configuration"
echo "======================================================"
echo ""
echo "Run these commands in the UI_code/feedback-form directory:"
echo ""
echo "1. Update vite.config.js proxy target to:"
echo "   target: 'http://localhost:4566/restapis/$API_ID/prod/_user_request_'"
echo ""
echo "The API Gateway URL is:"
echo "   http://localhost:4566/restapis/$API_ID/prod/_user_request_"
echo ""
echo "Example commands to test:"
echo "   curl \"http://localhost:4566/restapis/$API_ID/prod/_user_request_/feedback?tenant_id=default-tenant\""
echo ""
