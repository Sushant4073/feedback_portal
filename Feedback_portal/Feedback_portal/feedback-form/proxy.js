// Simple proxy to handle LocalStack Lambda invocation with authentication bypass
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { aws4 } = require('aws-sdk');
const { execSync } = require('child_process');

// Configure AWS SDK for LocalStack
aws4.config.update({
  region: 'us-west-2',
  accessKeyId: 'test',
  secretAccessKey: 'test',
  endpoint: 'http://localhost:4566',
});

const lambda = new aws4.Lambda({ endpoint: 'http://localhost:4566' });

const app = express();
const port = 3001;

// Stripe trailing slashes and handle errors
app.use((req, res, next) => {
  try {
    next();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Proxy all requests to API Gateway
app.use('/api', createProxyMiddleware({
  target: 'http://localhost:4566/restapis/hivfmawrvl/prod/_user_request_',
  changeOrigin: true,
  onProxyReq: (proxyReq, req, res) => {
    // Add LocalStack auth bypass header
    proxyReq.setHeader('x-api-key', 'test');
  },
  onProxyRes: (proxyRes, req, res) => {
    const body = proxyRes.body;
    // Log errors
    if (proxyRes.statusCode === 403) {
      console.error('403 Forbidden from API Gateway:', body.toString());
    }
  },
}));

app.listen(port, () => {
  console.log(`Proxy server running on http://localhost:${port}`);
});
