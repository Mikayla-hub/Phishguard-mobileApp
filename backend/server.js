/**
 * PhishGuard Backend Server
 * Main entry point for the API
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Import routes
const authRoutes = require('./routes/auth');
const phishingRoutes = require('./routes/phishing');
const learningRoutes = require('./routes/learning');
const reportRoutes = require('./routes/reports');
const incidentRoutes = require('./routes/incidents');

// Import database
const db = require('./config/database');
const path = require('path');
const os = require('os');

// Auto-detect current LAN IPv4 address
function getLanIp() {
  const interfaces = os.networkInterfaces();
  for (const iface of Object.values(interfaces)) {
    for (const alias of iface) {
      if (alias.family === 'IPv4' && !alias.internal) {
        return alias.address;
      }
    }
  }
  return 'localhost';
}
const mlService = require('./services/mlService');

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: { error: 'Too many requests, please try again later.' }
});
app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    service: 'PhishGuard API'
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/phishing', phishingRoutes);
app.use('/api/learning', learningRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/incidents', incidentRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// Initialize database and start server
db.initialize()
  .then(async () => {

    // Naive Bayes works on natural language text — train it on the email datasets.
    // URL phishing is handled by pattern analysis in mlService.analyze().
    const modelPath = path.join(__dirname, 'models', 'naive_bayes.json');
    const csvConfigs = [
      {
        filePath: path.join(__dirname, 'data', 'datasets', 'Phishing_Email.csv'),
        textCol:  'Email Text',
        labelCol: 'Email Type',
        phishingVal: 'Phishing Email',
        maxRows: 1000,
      },
      {
        filePath: path.join(__dirname, 'data', 'datasets', 'zimbabwe_phishing_dataset.csv'),
        textCol:  'text',
        labelCol: 'label',
        phishingVal: 'phishing',
      },
    ];

    mlService.initializeFromCSVs(csvConfigs, modelPath).catch(console.error);

    app.listen(PORT, '0.0.0.0', () => {
      const lanIp = getLanIp();
      console.log('========================================');
      console.log('   PhishGuard Backend Server');
      console.log('========================================');
      console.log(`Server running on http://0.0.0.0:${PORT}`);
      console.log(`LAN access:    http://${lanIp}:${PORT}/api/health`);
      console.log(`Health check:  http://localhost:${PORT}/api/health`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log('========================================');
      console.log(`📱 Update services/api.js → YOUR_LOCAL_IP = "${lanIp}"`);
      console.log('========================================');
    });
  })
  .catch(err => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });

module.exports = app;
