// Lambda Proxy Server using AWS SDK to bypass LocalStack auth requirements
const express = require('express');
const { execSync } = require('child_process');

// Configure AWS SDK for LocalStack (free tier - uses test credentials)
const AWS = require('aws-sdk');

// Set LocalStack endpoint
const lambda = new AWS.Lambda({
  region: 'us-west-2',
  accessKeyId: 'test',
  secretAccessKey: 'test',
  endpoint: 'http://localhost:4566',
});

const app = express();
const port = 3002;

app.use(express.json());

// API key header that LocalStack accepts for internal requests
app.use((req, res, next) => {
  req.headers['x-api-key'] = 'test';
  req.headers['x-localstack-await'] = 'false';
  next();
});

// Proxy all /api requests to LocalStack (for logs and tracing)
app.all('/api/:path', (req, res, next) => {
  console.log(`[Proxy] ${req.method} /api/${req.params.path} -> LocalStack`);

  const targetUrl = `http://localhost:4566${req.originalUrl}`;

  // Use fetch to forward the request
  fetch(targetUrl, {
    method: req.method,
    headers: {
      ...req.headers,
      'Content-Type': 'application/json',
      'x-api-key': 'test',
    },
    body: req.body,
  }).then(response => {
    if (!response.ok) {
      console.error(`[${response.status}] ${url}: ${response.statusText}`);
    }
    response.body.pipe(res);
  });
});

app.listen(port, () => {
  console.log(`Lambda proxy server running on http://localhost:${port}`);
});
