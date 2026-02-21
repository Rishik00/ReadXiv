import express from 'express';
import cors from 'cors';
import { initDB } from './db.js';
import papersRouter from './routes/papers.js';
import searchRouter from './routes/search.js';
import arxivRouter from './routes/arxiv.js';
import readerRouter from './routes/reader.js';

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
app.use('/api/search', searchRouter);
app.use('/api/arxiv', arxivRouter);
app.use('/api/reader', readerRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`🚀 Papyrus server running on http://localhost:${PORT}`);
});
