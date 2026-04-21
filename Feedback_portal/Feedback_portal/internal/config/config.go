package config

import "os"

type Config struct {
	DBUrl               string
	S3Bucket            string
	SQSUrl              string
	AWSRegion           string
	AWSEndpointURL      string // e.g., "http://localhost:4566" for LocalStack
	AICategorizerURL    string
	AICategorizerAPIKey string
	AICategorizerModel  string
	// JIRA configuration
	JiraBaseURL    string
	JiraAPIToken   string
	JiraProjectKey string
}

func Load() Config {
	return Config{
		DBUrl:               os.Getenv("DB_URL"),
		SQSUrl:              os.Getenv("SQS_URL"),
		AWSRegion:           os.Getenv("AWS_REGION"),
		AWSEndpointURL:      os.Getenv("AWS_ENDPOINT_URL"),
		AICategorizerURL:    os.Getenv("AI_CATEGORIZER_URL"),
		AICategorizerAPIKey: os.Getenv("AI_CATEGORIZER_API_KEY"),
		AICategorizerModel:  os.Getenv("AI_CATEGORIZER_MODEL"),
		JiraBaseURL:         os.Getenv("JIRA_BASE_URL"),
		JiraAPIToken:        os.Getenv("JIRA_PAT"),
		JiraProjectKey:      os.Getenv("JIRA_PROJECT_KEY"),
		S3Bucket:            os.Getenv("S3_BUCKET"),
	}
}
