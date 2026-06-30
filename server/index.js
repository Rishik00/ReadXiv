import express from 'express';
import cors from 'cors';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDB } from './db.js';
import { checkScheduledBackup } from './backup.js';
import papersRouter from './routes/papers.js';
import searchRouter from './routes/search.js';
import arxivRouter from './routes/arxiv.js';
import readerRouter from './routes/reader.js';
import canvasRouter from './routes/canvas.js';
import todoistRouter from './routes/todoist.js';
import semanticScholarSettingsRouter from './routes/semanticScholarSettings.js';
import analyticsRouter from './routes/analytics.js';
import dashboardRouter from './routes/dashboard.js';
import backupRouter from './routes/backup.js';
const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDistPath = path.resolve(__dirname, '../client/dist');
// Todoist & Semantic Scholar keys: ~/.papyrus/config.json from Settings UI; env vars override (see Help).
const PORT = process.env.PORT || 7474;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize database (async)
let isDbReady = false;
initDB().then(() => {
  isDbReady = true;
  console.log('✅ Database ready');
  checkScheduledBackup();
}).catch(err => {
  console.error('❌ Database initialization failed:', err);
  process.exit(1);
});

app.use((req, res, next) => {
  if (!isDbReady && req.path !== '/health') {
    return res.status(503).json({ error: 'Database is still initializing' });
  }
  return next();
});

// Routes
app.use('/api/papers', papersRouter);
app.use('/api/search', searchRouter);
app.use('/api/arxiv', arxivRouter);
app.use('/api/reader', readerRouter);
app.use('/api/canvas', canvasRouter);
app.use('/api/todoist', todoistRouter);
app.use('/api/semantic-scholar', semanticScholarSettingsRouter);
app.use('/api/instrumentation', analyticsRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/backup', backupRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    return res.sendFile(path.join(clientDistPath, 'index.html'));
  });
} else {
  app.get('/', (_req, res) => {
    res.status(503).send(
      'ReadXiv client build is missing. Run "npm run build" from the ReadXiv package directory.'
    );
  });
}

function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return null;
}

app.listen(PORT, '0.0.0.0', () => {
  const hostname = os.hostname();
  const localIP = getLocalIP();
  console.log(`ReadXiv running on http://localhost:${PORT}`);
  console.log('LAN access:');
  console.log(`- http://${hostname}:${PORT}`);
  if (localIP) console.log(`- http://${localIP}:${PORT}`);
});
