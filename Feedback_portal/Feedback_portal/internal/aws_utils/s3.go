package awsutils

import (
	"bytes"
	"context"
	"feedback-portal/internal/config"
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/s3"
)

// UploadFile uploads a file to S3 with the given tenant, feedback ID, and filename
func UploadFile(tenantID, feedbackID, fileName string, fileData []byte, cfg config.Config) error {
	// Determine the endpoint URL - use config or default to localhost
	endpointURL := cfg.AWSEndpointURL
	if endpointURL == "" {
		endpointURL = "http://localhost:4566"
	}

	// Configure AWS SDK options
	var configOptions []func(*awsconfig.LoadOptions) error
	configOptions = append(configOptions,
		awsconfig.WithRegion(cfg.AWSRegion),
		awsconfig.WithEndpointResolverWithOptions(
			aws.EndpointResolverWithOptionsFunc(
				func(service, region string, options ...interface{}) (aws.Endpoint, error) {
					return aws.Endpoint{
						URL:           endpointURL,
						SigningRegion: cfg.AWSRegion,
					}, nil
				}),
		),
	)

	awsCfg, err := awsconfig.LoadDefaultConfig(context.Background(), configOptions...)
	if err != nil {
		return fmt.Errorf("failed to load AWS config: %w", err)
	}

	client := s3.NewFromConfig(awsCfg, func(o *s3.Options) {
		o.UsePathStyle = true // Force path-style addressing for LocalStack compatibility
	})

	s3Key := fmt.Sprintf("%s/%s/%s", tenantID, feedbackID, fileName)

	_, err = client.PutObject(context.Background(),
		&s3.PutObjectInput{
			Bucket:      aws.String(cfg.S3Bucket),
			Key:         aws.String(s3Key),
			Body:        bytes.NewReader(fileData),
			ContentType: aws.String(getContentType(fileName)),
		})

	if err != nil {
		return fmt.Errorf("failed to upload file to S3: %w", err)
	}

	return nil
}

// GetPresignedURL generates a presigned URL for downloading a file from S3
func GetPresignedURL(tenantID, feedbackID, fileName string, cfg config.Config) (string, error) {
	// Determine the endpoint URL - use config or default to localhost
	endpointURL := cfg.AWSEndpointURL
	if endpointURL == "" {
		endpointURL = "http://localhost:4566"
	}

	var configOptions []func(*awsconfig.LoadOptions) error
	configOptions = append(configOptions,
		awsconfig.WithRegion(cfg.AWSRegion),
		awsconfig.WithEndpointResolverWithOptions(
			aws.EndpointResolverWithOptionsFunc(
				func(service, region string, options ...interface{}) (aws.Endpoint, error) {
					return aws.Endpoint{
						URL:           endpointURL,
						SigningRegion: cfg.AWSRegion,
					}, nil
				}),
		),
	)

	awsCfg, err := awsconfig.LoadDefaultConfig(context.Background(), configOptions...)
	if err != nil {
		return "", fmt.Errorf("failed to load AWS config: %w", err)
	}

	client := s3.NewFromConfig(awsCfg, func(o *s3.Options) {
		o.UsePathStyle = true // Force path-style addressing for LocalStack compatibility
	})

	presignClient := s3.NewPresignClient(client)

	s3Key := fmt.Sprintf("%s/%s/%s", tenantID, feedbackID, fileName)

	presignedURL, err := presignClient.PresignGetObject(context.Background(),
		&s3.GetObjectInput{
			Bucket: aws.String(cfg.S3Bucket),
			Key:    aws.String(s3Key),
		},
		s3.WithPresignExpires(15*time.Minute),
	)

	if err != nil {
		return "", fmt.Errorf("failed to generate presigned URL: %w", err)
	}

	// Replace the host in the presigned URL to use localhost for browser access
	// The Lambda uses localstack-main:4566 internally, but browsers need localhost:4566
	url := presignedURL.URL
	url = strings.Replace(url, "localstack-main", "localhost", 1)

	return url, nil
}

// GetPresignedUploadURL generates a presigned URL for uploading a file to S3
func GetPresignedUploadURL(tenantID, feedbackID, fileName string, cfg config.Config) (string, error) {
	endpointURL := cfg.AWSEndpointURL
	if endpointURL == "" {
		endpointURL = "http://localhost:4566"
	}

	var configOptions []func(*awsconfig.LoadOptions) error
	configOptions = append(configOptions,
		awsconfig.WithRegion(cfg.AWSRegion),
		awsconfig.WithEndpointResolverWithOptions(
			aws.EndpointResolverWithOptionsFunc(
				func(service, region string, options ...interface{}) (aws.Endpoint, error) {
					return aws.Endpoint{
						URL:           endpointURL,
						SigningRegion: cfg.AWSRegion,
					}, nil
				}),
		),
	)

	awsCfg, err := awsconfig.LoadDefaultConfig(context.Background(), configOptions...)
	if err != nil {
		return "", fmt.Errorf("failed to load AWS config: %w", err)
	}

	client := s3.NewFromConfig(awsCfg, func(o *s3.Options) {
		o.UsePathStyle = true
	})

	presignClient := s3.NewPresignClient(client)

	s3Key := fmt.Sprintf("%s/%s/%s", tenantID, feedbackID, fileName)

	presignedURL, err := presignClient.PresignPutObject(context.Background(),
		&s3.PutObjectInput{
			Bucket: aws.String(cfg.S3Bucket),
			Key:    aws.String(s3Key),
		},
		s3.WithPresignExpires(15*time.Minute),
	)

	if err != nil {
		return "", fmt.Errorf("failed to generate presigned upload URL: %w", err)
	}

	// Replace the host in the presigned URL to use localhost for browser access
	// The Lambda uses localstack-main:4566 internally, but browsers need localhost:4566
	url := presignedURL.URL
	url = strings.Replace(url, "localstack-main", "localhost", 1)

	return url, nil
}

// DeleteAttachment deletes a file from S3
func DeleteAttachment(tenantID, feedbackID, fileName string, cfg config.Config) error {
	// Determine the endpoint URL - use config or default to localhost
	endpointURL := cfg.AWSEndpointURL
	if endpointURL == "" {
		endpointURL = "http://localhost:4566"
	}

	var configOptions []func(*awsconfig.LoadOptions) error
	configOptions = append(configOptions,
		awsconfig.WithRegion(cfg.AWSRegion),
		awsconfig.WithEndpointResolverWithOptions(
			aws.EndpointResolverWithOptionsFunc(
				func(service, region string, options ...interface{}) (aws.Endpoint, error) {
					return aws.Endpoint{
						URL:           endpointURL,
						SigningRegion: cfg.AWSRegion,
					}, nil
				}),
		),
	)

	awsCfg, err := awsconfig.LoadDefaultConfig(context.Background(), configOptions...)
	if err != nil {
		return fmt.Errorf("failed to load AWS config: %w", err)
	}

	client := s3.NewFromConfig(awsCfg, func(o *s3.Options) {
		o.UsePathStyle = true // Force path-style addressing for LocalStack compatibility
	})

	s3Key := fmt.Sprintf("%s/%s/%s", tenantID, feedbackID, fileName)

	_, err = client.DeleteObject(context.Background(),
		&s3.DeleteObjectInput{
			Bucket: aws.String(cfg.S3Bucket),
			Key:    aws.String(s3Key),
		})

	if err != nil {
		return fmt.Errorf("failed to delete file from S3: %w", err)
	}

	return nil
}

// DownloadFile downloads a file from S3 and returns its contents
func DownloadFile(tenantID, feedbackID, fileName string, cfg config.Config) ([]byte, error) {
	// Determine the endpoint URL - use config or default to localhost
	endpointURL := cfg.AWSEndpointURL
	if endpointURL == "" {
		endpointURL = "http://localhost:4566"
	}

	// Configure AWS SDK options
	var configOptions []func(*awsconfig.LoadOptions) error
	configOptions = append(configOptions,
		awsconfig.WithRegion(cfg.AWSRegion),
		awsconfig.WithEndpointResolverWithOptions(
			aws.EndpointResolverWithOptionsFunc(
				func(service, region string, options ...interface{}) (aws.Endpoint, error) {
					return aws.Endpoint{
						URL:           endpointURL,
						SigningRegion: cfg.AWSRegion,
					}, nil
				}),
		),
	)

	awsCfg, err := awsconfig.LoadDefaultConfig(context.Background(), configOptions...)
	if err != nil {
		return nil, fmt.Errorf("failed to load AWS config: %w", err)
	}

	client := s3.NewFromConfig(awsCfg, func(o *s3.Options) {
		o.UsePathStyle = true // Force path-style addressing for LocalStack compatibility
	})

	s3Key := fmt.Sprintf("%s/%s/%s", tenantID, feedbackID, fileName)

	result, err := client.GetObject(context.Background(),
		&s3.GetObjectInput{
			Bucket: aws.String(cfg.S3Bucket),
			Key:    aws.String(s3Key),
		})

	if err != nil {
		return nil, fmt.Errorf("failed to download file from S3: %w", err)
	}
	defer result.Body.Close()

	// Read the file content
	data, err := io.ReadAll(result.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read file content: %w", err)
	}

	return data, nil
}

// getContentType returns the content type for a given filename
func getContentType(filename string) string {
	switch {
	case endsWith(filename, ".jpg"), endsWith(filename, ".jpeg"):
		return "image/jpeg"
	case endsWith(filename, ".png"):
		return "image/png"
	case endsWith(filename, ".gif"):
		return "image/gif"
	case endsWith(filename, ".pdf"):
		return "application/pdf"
	case endsWith(filename, ".txt"):
		return "text/plain"
	default:
		return "application/octet-stream"
	}
}

// endsWith checks if a string ends with a suffix
func endsWith(s, suffix string) bool {
	return len(s) >= len(suffix) && s[len(s)-len(suffix):] == suffix
}
