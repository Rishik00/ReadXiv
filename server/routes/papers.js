import express from 'express';
import { getDB, saveDB } from '../db.js';
import { randomUUID } from 'crypto';
import { createHash } from 'crypto';
import fs from 'fs-extra';
import path from 'path';
import multer from 'multer';
import { PAPYRUS_DIR } from '../db.js';

const router = express.Router();
const upload = multer({ dest: path.join(PAPYRUS_DIR, 'tmp') });

// Helper to convert sql.js rows to objects
function rowToObject(row, columns) {
  const obj = {};
  columns.forEach((col, i) => {
    obj[col] = row[i];
  });
  return obj;
}

// Get all papers
router.get('/', async (req, res) => {
  try {
    const db = await getDB();
    const result = db.exec('SELECT * FROM papers ORDER BY created_at DESC');
    if (result.length === 0) {
      return res.json([]);
    }
    const columns = result[0].columns;
    const papers = result[0].values.map(row => rowToObject(row, columns));
    res.json(papers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get recent papers by last access
router.get('/recents', async (req, res) => {
  try {
    const db = await getDB();
    const limitRaw = Number.parseInt(req.query.limit, 10);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(limitRaw, 20)) : 3;
    const result = db.exec(
      'SELECT * FROM papers ORDER BY COALESCE(last_accessed_at, created_at) DESC LIMIT ?',
      [limit]
    );
    if (result.length === 0) {
      return res.json([]);
    }
    const columns = result[0].columns;
    const papers = result[0].values.map((row) => rowToObject(row, columns));
    return res.json(papers);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// Get single paper
router.get('/:id', async (req, res) => {
  try {
    const db = await getDB();
    const result = db.exec('SELECT * FROM papers WHERE id = ?', [req.params.id]);
    if (result.length === 0 || result[0].values.length === 0) {
      return res.status(404).json({ error: 'Paper not found' });
    }
    const columns = result[0].columns;
    const paper = rowToObject(result[0].values[0], columns);
    res.json(paper);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Mark a paper as accessed (for recents)
router.post('/:id/access', async (req, res) => {
  try {
    const db = await getDB();
    db.run("UPDATE papers SET last_accessed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?", [
      req.params.id,
    ]);
    saveDB();

    const result = db.exec('SELECT * FROM papers WHERE id = ?', [req.params.id]);
    if (result.length === 0 || result[0].values.length === 0) {
      return res.status(404).json({ error: 'Paper not found' });
    }
    const columns = result[0].columns;
    const paper = rowToObject(result[0].values[0], columns);
    return res.json(paper);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// Create paper
router.post('/', async (req, res) => {
  try {
    const db = await getDB();
    const { id, title, authors, abstract, url, pdf_path, pdf_url, source, year, tags } = req.body;
    
    const paperId = id || randomUUID();
    const tagsJson = tags ? JSON.stringify(tags) : '[]';
    const now = new Date().toISOString();
    
    db.run(`
      INSERT INTO papers (id, title, authors, abstract, url, pdf_path, pdf_url, source, year, tags, created_at, updated_at, last_accessed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      paperId,
      title,
      authors ?? null,
      abstract ?? null,
      url ?? null,
      pdf_path ?? null,
      pdf_url ?? null,
      source || 'arxiv',
      year ?? null,
      tagsJson,
      now,
      now,
      now,
    ]);
    
    saveDB();
    
    const result = db.exec('SELECT * FROM papers WHERE id = ?', [paperId]);
    const columns = result[0].columns;
    const paper = rowToObject(result[0].values[0], columns);
    res.status(201).json(paper);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update paper
router.patch('/:id', async (req, res) => {
  try {
    const db = await getDB();
    const updates = req.body;
    const allowedFields = ['title', 'authors', 'abstract', 'status', 'tags', 'year', 'deadline', 'scheduled_date', 'citation_count', 'page_count'];
    
    const setParts = [];
    const values = [];
    
    Object.keys(updates).forEach(key => {
      if (allowedFields.includes(key)) {
        setParts.push(`${key} = ?`);
        values.push(key === 'tags' ? JSON.stringify(updates[key]) : updates[key]);
      }
    });
    
    if (setParts.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }
    
    setParts.push("updated_at = datetime('now')");
    values.push(req.params.id);
    
    db.run(`UPDATE papers SET ${setParts.join(', ')} WHERE id = ?`, values);
    saveDB();
    
    const result = db.exec('SELECT * FROM papers WHERE id = ?', [req.params.id]);
    const columns = result[0].columns;
    const paper = rowToObject(result[0].values[0], columns);
    res.json(paper);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete paper
router.delete('/:id', async (req, res) => {
  try {
    const db = await getDB();
    db.run('DELETE FROM papers WHERE id = ?', [req.params.id]);
    saveDB();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/upload', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No PDF uploaded' });
    if (!req.file.originalname?.toLowerCase().endsWith('.pdf')) {
      await fs.remove(req.file.path);
      return res.status(400).json({ error: 'Only PDF files are supported' });
    }

    const db = await getDB();
    const fileBuffer = await fs.readFile(req.file.path);
    const digest = createHash('sha256').update(fileBuffer).digest('hex');
    const paperId = `local-${digest.slice(0, 16)}`;

    const existingResult = db.exec('SELECT * FROM papers WHERE id = ?', [paperId]);
    if (existingResult.length > 0 && existingResult[0].values.length > 0) {
      await fs.remove(req.file.path);
      const existing = rowToObject(existingResult[0].values[0], existingResult[0].columns);
      return res.json({ ...existing, alreadyExists: true });
    }

    const pdfPath = path.join(PAPYRUS_DIR, 'pdfs', `${paperId}.pdf`);
    await fs.move(req.file.path, pdfPath, { overwrite: true });

    const baseTitle = path.basename(req.file.originalname, path.extname(req.file.originalname));
    const title = baseTitle || 'Untitled PDF';
    const now = new Date().toISOString();
    const notesPath = path.join(PAPYRUS_DIR, 'notes', `${paperId}.md`);
    await fs.writeFile(notesPath, `# ${title}\n\n## Notes\n\n`, 'utf8');

    db.run(
      `INSERT INTO papers (id, title, authors, abstract, url, pdf_path, pdf_url, source, year, tags, created_at, updated_at, last_accessed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        paperId,
        title,
        null,
        null,
        null,
        pdfPath,
        null,
        'manual',
        null,
        '[]',
        now,
        now,
        now,
      ]
    );
    saveDB();

    const result = db.exec('SELECT * FROM papers WHERE id = ?', [paperId]);
    const paper = rowToObject(result[0].values[0], result[0].columns);
    return res.status(201).json(paper);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;
