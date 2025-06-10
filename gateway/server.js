// gateway/server.js
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');
const http = require('http');
require('dotenv').config();

const app = express();
const PORT = process.env.GATEWAY_PORT || 3000;

const AUTH_SERVICE = process.env.AUTH_SERVICE_URL || 'http://localhost:3001';
const EHR_SERVICE = process.env.EHR_SERVICE_URL || 'http://localhost:3002';
const AI_SERVICE = process.env.AI_SERVICE_URL || 'http://localhost:3003';

console.log('🔧 Service Configuration:');
console.log('AUTH_SERVICE:', AUTH_SERVICE);
console.log('EHR_SERVICE:', EHR_SERVICE);
console.log('AI_SERVICE:', AI_SERVICE);

// Health check function
const checkServiceHealth = (serviceUrl, serviceName) => {
  return new Promise((resolve) => {
    const url = new URL(serviceUrl);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: '/health',
      method: 'GET',
      timeout: 3000
    };

    const fallbackOptions = { ...options, path: '/' };

    const req = http.request(options, (res) => {
      resolve({ service: serviceName, status: 'UP', statusCode: res.statusCode, url: serviceUrl });
    });

    req.on('error', () => {
      const fallbackReq = http.request(fallbackOptions, (res) => {
        resolve({
          service: serviceName,
          status: 'UP',
          statusCode: res.statusCode,
          url: serviceUrl,
          note: 'No /health endpoint, but service responding'
        });
      });

      fallbackReq.on('error', (err) => {
        resolve({
          service: serviceName,
          status: 'DOWN',
          error: err.message,
          url: serviceUrl
        });
      });

      fallbackReq.on('timeout', () => {
        fallbackReq.destroy();
        resolve({ service: serviceName, status: 'TIMEOUT', url: serviceUrl });
      });

      fallbackReq.setTimeout(3000);
      fallbackReq.end();
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ service: serviceName, status: 'TIMEOUT', url: serviceUrl });
    });

    req.setTimeout(3000);
    req.end();
  });
};

const checkAllServices = async () => {
  console.log('🔍 Checking service health...');
  const services = [
    { url: AUTH_SERVICE, name: 'AUTH' },
    { url: EHR_SERVICE, name: 'EHR' },
    { url: AI_SERVICE, name: 'AI' }
  ];
  const results = await Promise.all(services.map(service => checkServiceHealth(service.url, service.name)));

  console.log('📊 Service Health Status:');
  results.forEach(result => {
    const status = result.status === 'UP' ? '✅' : '❌';
    console.log(`${status} ${result.service}: ${result.status} (${result.url})`);
    if (result.error) console.log(`   Error: ${result.error}`);
    if (result.note) console.log(`   Note: ${result.note}`);
  });

  return results;
};

// ✅ CORS config
const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, postman)
    if (!origin) return callback(null, true);
    // Allow same-origin and known dev origins
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:5173',
      'http://localhost:4173',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:5173',
      'https://quickehr-gateway.onrender.com'
    ];
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    } else {
      return callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization'
  ]
};


app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use(express.json());

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  next();
});

app.get('/health', async (req, res) => {
  const serviceStatus = await checkAllServices();
  res.json({
    status: 'API Gateway is running',
    port: PORT,
    services: {
      auth: AUTH_SERVICE,
      ehr: EHR_SERVICE,
      ai: AI_SERVICE
    },
    serviceHealth: serviceStatus,
    timestamp: new Date().toISOString()
  });
});

app.get('/api/status', async (req, res) => {
  const serviceStatus = await checkAllServices();
  res.json({ gateway: 'UP', services: serviceStatus });
});

const createProxy = (target, pathRewrite, serviceName) => {
  return createProxyMiddleware({
    target,
    pathRewrite,
    changeOrigin: true,
    timeout: 10000,
    logLevel: 'debug',

    onProxyReq: (proxyReq, req) => {
      console.log(`🔄 Proxying ${req.method} ${req.url} to ${target}`);
      if (req.headers.authorization) {
        proxyReq.setHeader('Authorization', req.headers.authorization);
      }
    },

    onProxyRes: (proxyRes, req) => {
      console.log(`✅ ${serviceName} responded: ${proxyRes.statusCode} for ${req.method} ${req.url}`);
    },

    onError: (err, req, res) => {
      console.error(`❌ ${serviceName} proxy error:`, err.message);
      if (!res.headersSent) {
        res.status(502).json({
          error: 'Bad Gateway',
          message: `${serviceName} service is unavailable`,
          details: err.message,
          service: serviceName,
          target,
          timestamp: new Date().toISOString()
        });
      }
    }
  });
};

// Proxy routes
app.use('/api/auth', createProxy(AUTH_SERVICE, { '^/api/auth': '' }, 'AUTH'));
app.use('/api/ehr', createProxy(EHR_SERVICE, { '^/api/ehr': '' }, 'EHR'));
app.use('/api/ai', createProxy(AI_SERVICE, { '^/api/ai': '' }, 'AI'));

app.get('/api', (req, res) => {
  res.json({
    message: 'QuickEHR API Gateway',
    version: '1.0.0',
    status: 'UP',
    endpoints: {
      auth: 'POST /api/auth/login, POST /api/auth/register',
      ehr: 'GET /api/ehr/patients, POST /api/ehr/patients',
      ai: 'POST /api/ai/diagnose, GET /api/ai/analytics'
    },
    debug: {
      health: 'GET /health',
      status: 'GET /api/status'
    }
  });
});

app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    message: 'The requested endpoint does not exist',
    path: req.originalUrl,
    method: req.method
  });
});

module.exports = app;
