package awsutils

import (
	"context"
	"encoding/json"
	"feedback-portal/internal/config"
	"feedback-portal/internal/models"
	"fmt"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/service/sqs"
)

func PublishFeedbackEvent(event models.FeedbackEvent, cfg config.Config) error {
	// Determine the endpoint URL - use config or default to 127.0.0.1
	endpointURL := cfg.AWSEndpointURL
	if endpointURL == "" {
		endpointURL = "http://127.0.0.1:4566"
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

	awsCfg, err := awsconfig.LoadDefaultConfig(context.TODO(), configOptions...)
	if err != nil {
		return fmt.Errorf("failed to load AWS config: %w", err)
	}

	client := sqs.NewFromConfig(awsCfg)

	messageBody, err := json.Marshal(event)
	if err != nil {
		return err
	}

	_, err = client.SendMessage(context.TODO(),
		&sqs.SendMessageInput{
			QueueUrl:    &cfg.SQSUrl,
			MessageBody: aws.String(string(messageBody)),
		})

	return err
}
