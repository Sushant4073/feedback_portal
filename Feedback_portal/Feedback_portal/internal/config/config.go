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
	JiraBaseURL                 string
	JiraAPIToken                string
	JiraProjectKey              string
	AIJiraDescriptionEnrichment bool
}

func Load() Config {
	return Config{
		DBUrl:                       os.Getenv("DB_URL"),
		SQSUrl:                      os.Getenv("SQS_URL"),
		AWSRegion:                   os.Getenv("AWS_REGION"),
		AWSEndpointURL:              os.Getenv("AWS_ENDPOINT_URL"),
		AICategorizerURL:            os.Getenv("AI_CATEGORIZER_URL"),
		AICategorizerAPIKey:         os.Getenv("AI_CATEGORIZER_API_KEY"),
		AICategorizerModel:          os.Getenv("AI_CATEGORIZER_MODEL"),
		JiraBaseURL:                 os.Getenv("JIRA_BASE_URL"),
		JiraAPIToken:                os.Getenv("JIRA_PAT"),
		JiraProjectKey:              os.Getenv("JIRA_PROJECT_KEY"),
		AIJiraDescriptionEnrichment: getEnvBool("AI_JIRA_DESCRIPTION_ENRICHMENT", true),
		S3Bucket:                    os.Getenv("S3_BUCKET"),
	}
}

func getEnvBool(name string, defaultValue bool) bool {
	v := os.Getenv(name)
	if v == "" {
		return defaultValue
	}

	switch v {
	case "1", "true", "TRUE", "True", "yes", "YES", "on", "ON":
		return true
	case "0", "false", "FALSE", "False", "no", "NO", "off", "OFF":
		return false
	default:
		return defaultValue
	}
}
