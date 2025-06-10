// gateway/server.js
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.GATEWAY_PORT || 3000;

// Service URLs
const AUTH_SERVICE = process.env.AUTH_SERVICE_URL || 'http://localhost:3001';
const EHR_SERVICE = process.env.EHR_SERVICE_URL || 'http://localhost:3002';
const AI_SERVICE = process.env.AI_SERVICE_URL || 'http://localhost:3003';

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:5173', 'https://your-frontend-domain.com'],
  credentials: true
}));

// ⚠️ IMPORTANT: Remove express.json() for proxy routes
// app.use(express.json()); // This interferes with proxying

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health check for gateway (needs express.json for this specific route)
app.get('/health', express.json(), (req, res) => {
  res.json({ 
    status: 'API Gateway is running',
    port: PORT,
    services: {
      auth: AUTH_SERVICE,
      ehr: EHR_SERVICE,
      ai: AI_SERVICE
    },
    timestamp: new Date().toISOString()
  });
});

// API Routes Overview
app.get('/api', express.json(), (req, res) => {
  res.json({
    message: 'QuickEHR API Gateway',
    version: '1.0.0',
    endpoints: {
      auth: {
        login: 'POST /api/auth/login',
        register: 'POST /api/auth/register',
        verify: 'GET /api/auth/verify'
      },
      patients: {
        list: 'GET /api/ehr/patients',
        create: 'POST /api/ehr/patients',
        get: 'GET /api/ehr/patients/:id',
        update: 'PUT /api/ehr/patients/:id',
        delete: 'DELETE /api/ehr/patients/:id'
      },
      appointments: {
        list: 'GET /api/ehr/appointments',
        create: 'POST /api/ehr/appointments',
        update: 'PUT /api/ehr/appointments/:id'
      },
      ai: {
        diagnose: 'POST /api/ai/diagnose',
        analytics: 'GET /api/ai/analytics',
        insights: 'GET /api/ai/insights'
      }
    }
  });
});

// Proxy Configuration
const createProxy = (target, pathRewrite) => {
  return createProxyMiddleware({
    target,
    pathRewrite,
    changeOrigin: true,
    timeout: 10000,
    logLevel: 'debug',
    
    // Handle request body properly
    onProxyReq: (proxyReq, req, res) => {
      // Forward authorization header
      if (req.headers.authorization) {
        proxyReq.setHeader('Authorization', req.headers.authorization);
      }
      
      // Handle POST/PUT/PATCH body data
      if (req.body && (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH')) {
        const bodyData = JSON.stringify(req.body);
        proxyReq.setHeader('Content-Type', 'application/json');
        proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
        proxyReq.write(bodyData);
        proxyReq.end();
      }
    },
    
    // Handle errors
    onError: (err, req, res) => {
      console.error('Proxy error:', err.message);
      console.error('Request details:', {
        method: req.method,
        url: req.url,
        headers: req.headers
      });
      
      if (!res.headersSent) {
        res.status(503).json({ 
          error: 'Service temporarily unavailable',
          message: err.message,
          service: req.path ? req.path.split('/')[2] : "unknown"
        });
      }
    },
    
    // Debug proxy requests
    onProxyRes: (proxyRes, req, res) => {
      console.log(`Proxy response: ${proxyRes.statusCode} for ${req.method} ${req.url}`);
    }
  });
};

// Auth Service Proxy - needs body parsing for POST requests
app.use('/api/auth', express.json(), createProxy(AUTH_SERVICE, { '^/api/auth': '' }));

// EHR Service Proxy - needs body parsing for POST/PUT requests
app.use('/api/ehr', express.json(), createProxy(EHR_SERVICE, { '^/api/ehr': '' }));

// AI Service Proxy - needs body parsing for POST requests
app.use('/api/ai', express.json(), createProxy(AI_SERVICE, { '^/api/ai': '' }));

// Catch-all for undefined routes
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    message: 'The requested endpoint does not exist',
    available_endpoints: ['/api/auth', '/api/ehr', '/api/ai'],
    documentation: '/api'
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Gateway error:', err);
  if (!res.headersSent) {
    res.status(500).json({
      error: 'Internal server error',
      message: err.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 API Gateway running on port ${PORT}`);
  console.log(`📋 Available at: http://localhost:${PORT}/api`);
  console.log(`🔐 Auth Service: ${AUTH_SERVICE}`);
  console.log(`🏥 EHR Service: ${EHR_SERVICE}`);
  console.log(`🤖 AI Service: ${AI_SERVICE}`);
});

module.exports = app;