package config

import "os"

type Config struct {
	DBUrl           string
	S3Bucket        string
	SQSUrl          string
	AWSRegion       string
	AWSEndpointURL  string // e.g., "http://localhost:4566" for LocalStack
	// JIRA configuration
	JiraBaseURL    string
	JiraAPIToken   string
	JiraProjectKey string
}

func Load() Config {
	return Config{
		DBUrl:          os.Getenv("DB_URL"),
		SQSUrl:         os.Getenv("SQS_URL"),
		AWSRegion:      os.Getenv("AWS_REGION"),
		AWSEndpointURL: os.Getenv("AWS_ENDPOINT_URL"),
		JiraBaseURL:    os.Getenv("JIRA_BASE_URL"),
		JiraAPIToken:   os.Getenv("JIRA_PAT"),
		JiraProjectKey: os.Getenv("JIRA_PROJECT_KEY"),
		S3Bucket:       os.Getenv("S3_BUCKET"),
	}
}
