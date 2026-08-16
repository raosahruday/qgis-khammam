global.bootTime = new Date();
global.dbLogs = [];
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;
console.log = (...args) => {
  global.dbLogs.push('[INFO] ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
  originalLog(...args);
};
console.error = (...args) => {
  global.dbLogs.push('[ERROR] ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
  originalError(...args);
};
console.warn = (...args) => {
  global.dbLogs.push('[WARN] ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
  originalWarn(...args);
};

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const apiRoutes = require('./src/routes/api');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Cloudflare & Render Request Tracing Middleware (CF-Ray)
app.use((req, res, next) => {
  const cfRay = req.headers['cf-ray'] || 'local';
  req.cfRay = cfRay;
  res.setHeader('X-CF-Ray', cfRay);
  if (req.path.startsWith('/api')) {
    console.log(`[${new Date().toISOString()}] [CF-Ray: ${cfRay}] ${req.method} ${req.path}`);
  }
  next();
});
 
// Serve static files for uploaded photos
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Serve static web dashboard frontend files
const publicDir = path.join(__dirname, 'public');
const fs = require('fs');
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
}

// API Routes
app.use('/api', apiRoutes);

// Health check endpoints for Render zero-downtime monitoring
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime(), cfRay: req.cfRay });
});
app.get('/healthz', (req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime(), cfRay: req.cfRay });
});

// Fallback to index.html for Web Dashboard single page application routing
app.use((req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
    return next();
  }
  const indexPath = path.join(publicDir, 'index.html');
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  res.send('Cleaning Task API is running');
});

const { startResetJob } = require('./src/jobs/resetTasks');
const initDb = require('./src/config/initDb');

// Initialize database and start server
const startServer = async () => {
  await initDb();
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    startResetJob();
  });
};

startServer();
