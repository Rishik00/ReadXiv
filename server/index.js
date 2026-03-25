import express from 'express';
import cors from 'cors';
import os from 'os';
import { initDB } from './db.js';
import papersRouter from './routes/papers.js';
import searchRouter from './routes/search.js';
import arxivRouter from './routes/arxiv.js';
import readerRouter from './routes/reader.js';
import canvasRouter from './routes/canvas.js';
import readingQueueRouter from './routes/reading-queue.js';

const app = express();
const PORT = process.env.PORT || 7474;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize database (async)
let isDbReady = false;
initDB().then(() => {
  isDbReady = true;
  console.log('✅ Database ready');
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
app.use('/api/reading-queue', readingQueueRouter);
app.use('/api/search', searchRouter);
app.use('/api/arxiv', arxivRouter);
app.use('/api/reader', readerRouter);
app.use('/api/canvas', canvasRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

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
  console.log(`🚀 ReadXiv server running on http://localhost:${PORT}`);
  console.log(`   iPad/LAN access:`);
  console.log(`   • http://${hostname}:5173  (alias – rename PC to "readxiv" for http://readxiv:5173)`);
  if (localIP) console.log(`   • http://${localIP}:5173`);
});
