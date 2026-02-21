import express from 'express';
import { getDB } from '../db.js';
import Fuse from 'fuse.js';

const router = express.Router();

// Helper to convert sql.js rows to objects
function rowToObject(row, columns) {
  const obj = {};
  columns.forEach((col, i) => {
    obj[col] = row[i];
  });
  return obj;
}

// Search papers using Fuse.js
router.get('/', async (req, res) => {
  try {
    const db = await getDB();
    const query = req.query.q || '';
    
    if (!query.trim()) {
      return res.json([]);
    }
    
    const result = db.exec('SELECT * FROM papers ORDER BY created_at DESC');
    if (result.length === 0) {
      return res.json([]);
    }
    const columns = result[0].columns;
    const papers = result[0].values.map(row => rowToObject(row, columns));
    
    const fuse = new Fuse(papers, {
      keys: ['title', 'authors', 'abstract'],
      threshold: 0.3,
      includeScore: true
    });
    
    const results = fuse.search(query).map(result => result.item);
    res.json(results);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
