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

// Enhanced CORS Configuration
const corsOptions = {
  origin: [
    'http://localhost:3000',     // React dev server
    'http://localhost:5173',     // Vite dev server
    'http://localhost:3001',     // Alternative React port
    'http://localhost:4173',     // Vite preview
    'http://127.0.0.1:3000',     // Alternative localhost
    'http://127.0.0.1:5173',     // Alternative localhost
    // Add your production domains here
    'https://your-actual-frontend-domain.com',
    'https://your-actual-frontend-domain.vercel.app',
    'https://your-actual-frontend-domain.netlify.app'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'Cache-Control',
    'X-HTTP-Method-Override'
  ],
  exposedHeaders: ['Authorization'],
  optionsSuccessStatus: 200, // Some legacy browsers choke on 204
  maxAge: 86400 // 24 hours
};

// Apply CORS middleware
app.use(cors(corsOptions));

// Handle preflight requests explicitly
app.options('*', cors(corsOptions));

// Add security headers
app.use((req, res, next) => {
  // Allow credentials
  res.header('Access-Control-Allow-Credentials', 'true');
  
  // Set Vary header for proper caching
  res.header('Vary', 'Origin');
  
  next();
});

// Logging middleware with more details
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  console.log('Origin:', req.headers.origin);
  console.log('User-Agent:', req.headers['user-agent']);
  next();
});

// Health check for gateway
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

// Enhanced Proxy Configuration
const createProxy = (target, pathRewrite) => {
  return createProxyMiddleware({
    target,
    pathRewrite,
    changeOrigin: true,
    timeout: 10000,
    logLevel: 'debug',
    
    // Handle CORS for proxy
    onProxyReq: (proxyReq, req, res) => {
      // Forward all relevant headers
      if (req.headers.authorization) {
        proxyReq.setHeader('Authorization', req.headers.authorization);
      }
      
      // Forward origin header
      if (req.headers.origin) {
        proxyReq.setHeader('Origin', req.headers.origin);
      }
      
      // Handle POST/PUT/PATCH body data
      if (req.body && (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH')) {
        const bodyData = JSON.stringify(req.body);
        proxyReq.setHeader('Content-Type', 'application/json');
        proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
        proxyReq.write(bodyData);
        proxyReq.end();
      }
      
      console.log(`Proxying ${req.method} ${req.url} to ${target}`);
    },
    
    // Handle proxy response
    onProxyRes: (proxyRes, req, res) => {
      console.log(`Proxy response: ${proxyRes.statusCode} for ${req.method} ${req.url}`);
      
      // Ensure CORS headers are set on proxy response
      res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
      res.header('Access-Control-Allow-Credentials', 'true');
    },
    
    // Handle errors
    onError: (err, req, res) => {
      console.error('Proxy error:', err.message);
      console.error('Request details:', {
        method: req.method,
        url: req.url,
        headers: req.headers,
        origin: req.headers.origin
      });
      
      if (!res.headersSent) {
        res.status(503).json({ 
          error: 'Service temporarily unavailable',
          message: err.message,
          service: req.path ? req.path.split('/')[2] : "unknown"
        });
      }
    }
  });
};

// Auth Service Proxy
app.use('/api/auth', express.json(), createProxy(AUTH_SERVICE, { '^/api/auth': '' }));

// EHR Service Proxy
app.use('/api/ehr', express.json(), createProxy(EHR_SERVICE, { '^/api/ehr': '' }));

// AI Service Proxy
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
  console.log('🌐 Allowed origins:', corsOptions.origin);
});

module.exports = app;