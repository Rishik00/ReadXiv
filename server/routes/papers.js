import express from 'express';
import axios from 'axios';
import { getDB, saveDB } from '../db.js';
import { createHash, randomUUID } from 'crypto';
import { pipeline } from 'stream/promises';
import fs from 'fs-extra';
import path from 'path';
import multer from 'multer';
import { PAPYRUS_DIR } from '../db.js';
import Fuse from 'fuse.js';
import { extractArxivId, fetchArxivMetadata } from './arxiv.js';

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

async function fetchPaperById(id) {
  const db = await getDB();
  const result = db.exec('SELECT * FROM papers WHERE id = ?', [id]);
  if (result.length === 0 || result[0].values.length === 0) return null;
  return rowToObject(result[0].values[0], result[0].columns);
}

function isPlaceholderTitle(title, id) {
  const value = String(title || '').trim();
  if (!value) return true;
  return /^arxiv:/i.test(value) || value === id;
}

function hasUsableMetadata(metadata, paper) {
  if (!metadata || typeof metadata !== 'object') return false;
  const hasTitle = metadata.title && !isPlaceholderTitle(metadata.title, paper.id);
  const hasAbstract = Boolean(String(metadata.abstract || '').trim());
  return hasTitle || hasAbstract;
}

function resolvePaperArxivId(paper) {
  if (!paper) return null;
  return (
    extractArxivId(String(paper.id || '')) ||
    extractArxivId(String(paper.url || '')) ||
    extractArxivId(String(paper.pdf_url || '')) ||
    null
  );
}

function extractNotesTitle(content) {
  const match = String(content || '').match(/^#\s+(.+?)\s*$/m);
  return match ? match[1].trim() : null;
}

function replaceFirstNotesTitle(content, nextTitle) {
  if (!content || !String(content).trim()) return `# ${nextTitle}\n`;
  if (/^#\s+.+?\s*$/m.test(content)) {
    return String(content).replace(/^#\s+.+?\s*$/m, `# ${nextTitle}`);
  }
  return `# ${nextTitle}\n\n${String(content).trimStart()}`;
}

async function syncNotesTitleForMetadataFetch(paper, nextTitle) {
  if (!nextTitle || isPlaceholderTitle(nextTitle, paper.id)) return;

  const notesPath = path.join(PAPYRUS_DIR, 'notes', `${paper.id}.md`);
  if (!(await fs.pathExists(notesPath))) return;

  const content = await fs.readFile(notesPath, 'utf8');
  const currentTitle = extractNotesTitle(content);
  if (!currentTitle) return;

  const rest = String(content)
    .replace(/^#\s+.+?\s*$/m, '')
    .trim();
  const safeToUpdate =
    isPlaceholderTitle(currentTitle, paper.id) ||
    currentTitle === paper.title ||
    (rest === '' && currentTitle);

  if (!safeToUpdate || currentTitle === nextTitle) return;
  await fs.writeFile(notesPath, replaceFirstNotesTitle(content, nextTitle), 'utf8');
}

async function downloadToFile(url, destination) {
  const temporaryPath = `${destination}.download-${randomUUID()}`;
  try {
    const response = await axios.get(url, {
      responseType: 'stream',
      timeout: 120000,
      maxRedirects: 5,
      headers: { 'User-Agent': 'ReadXiv/1.0' },
    });
    await pipeline(response.data, fs.createWriteStream(temporaryPath));
    await fs.move(temporaryPath, destination, { overwrite: true });
  } catch (error) {
    await fs.remove(temporaryPath).catch(() => {});
    throw error;
  }
}

async function hashFile(filePath) {
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(filePath)) {
    hash.update(chunk);
  }
  return hash.digest('hex');
}

/** Ensure a non-empty PDF exists at paper.pdf_path (or default pdfs/{id}.pdf); download from pdf_url if needed. Updates DB when downloading. */
async function ensurePaperPdfOnDisk(paper) {
  const db = await getDB();
  const id = paper.id;
  let pdfPath = paper.pdf_path || path.join(PAPYRUS_DIR, 'pdfs', `${id}.pdf`);

  let hasFile = false;
  if (await fs.pathExists(pdfPath)) {
    const st = await fs.stat(pdfPath);
    hasFile = st.size > 0;
  }

  if (!hasFile) {
    const pdfUrl = paper.pdf_url;
    if (!pdfUrl) {
      throw new Error('No local PDF and no download URL. Connect to the internet once to fetch this paper.');
    }
    await fs.ensureDir(path.dirname(pdfPath));
    await downloadToFile(pdfUrl, pdfPath);
    db.run(
      "UPDATE papers SET pdf_path = ?, pdf_url = ?, status = 'queued', updated_at = datetime('now') WHERE id = ?",
      [pdfPath, pdfUrl, id]
    );
    saveDB();
  }

  return pdfPath;
}

// Get all papers
router.get('/', async (req, res) => {
  try {
    const db = await getDB();
    const wantsPaginated =
      Object.prototype.hasOwnProperty.call(req.query, 'q') ||
      Object.prototype.hasOwnProperty.call(req.query, 'page') ||
      Object.prototype.hasOwnProperty.call(req.query, 'pageSize') ||
      req.query.paginate === '1';

    const query = String(req.query.q || '').trim();
    const pageSizeRaw = Number.parseInt(req.query.pageSize, 10);
    const requestedPageSize = Number.isFinite(pageSizeRaw) ? pageSizeRaw : 10;
    const pageSize = Math.max(1, Math.min(requestedPageSize, 50));

    if (wantsPaginated && !query) {
      const countResult = db.exec('SELECT COUNT(*) AS total FROM papers');
      const total = Number(countResult[0]?.values[0]?.[0] || 0);
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const pageRaw = Number.parseInt(req.query.page, 10);
      const requestedPage = Number.isFinite(pageRaw) ? pageRaw : 1;
      const page = Math.max(1, Math.min(requestedPage, totalPages));
      const result = db.exec(
        'SELECT * FROM papers ORDER BY created_at DESC LIMIT ? OFFSET ?',
        [pageSize, (page - 1) * pageSize]
      );
      const columns = result.length > 0 ? result[0].columns : [];
      const items = result.length > 0
        ? result[0].values.map((row) => rowToObject(row, columns))
        : [];
      return res.json({ items, total, page, pageSize, totalPages, query });
    }

    const result = db.exec('SELECT * FROM papers ORDER BY created_at DESC');
    const columns = result.length > 0 ? result[0].columns : [];
    const papers = result.length > 0 ? result[0].values.map(row => rowToObject(row, columns)) : [];

    if (!wantsPaginated) {
      return res.json(papers);
    }

    let filtered = papers;
    if (query) {
      const fuse = new Fuse(papers, {
        keys: ['title', 'authors', 'abstract'],
        threshold: 0.3,
        includeScore: true,
      });
      filtered = fuse.search(query).map((match) => match.item);
    }

    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const pageRaw = Number.parseInt(req.query.page, 10);
    const requestedPage = Number.isFinite(pageRaw) ? pageRaw : 1;
    const page = Math.max(1, Math.min(requestedPage, totalPages));
    const pageStart = (page - 1) * pageSize;
    const items = filtered.slice(pageStart, pageStart + pageSize);

    return res.json({
      items,
      total,
      page,
      pageSize,
      totalPages,
      query,
    });
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

// Copy PDF into ~/.papyrus/offline and mark paper for offline reading
router.post('/:id/offline', async (req, res) => {
  try {
    const enabled = Boolean(req.body?.enabled);
    const paper = await fetchPaperById(req.params.id);
    if (!paper) return res.status(404).json({ error: 'Paper not found' });

    const offlineDir = path.join(PAPYRUS_DIR, 'offline');
    const offlinePath = path.join(offlineDir, `${paper.id}.pdf`);

    if (enabled) {
      const pdfPath = await ensurePaperPdfOnDisk(paper);
      await fs.ensureDir(offlineDir);
      await fs.copy(pdfPath, offlinePath, { overwrite: true });
      const db = await getDB();
      db.run("UPDATE papers SET offline_pinned = 1, updated_at = datetime('now') WHERE id = ?", [paper.id]);
      saveDB();
      const updated = await fetchPaperById(paper.id);
      return res.json(updated);
    }

    if (await fs.pathExists(offlinePath)) {
      await fs.remove(offlinePath);
    }
    const db = await getDB();
    db.run("UPDATE papers SET offline_pinned = 0, updated_at = datetime('now') WHERE id = ?", [paper.id]);
    saveDB();
    const updated = await fetchPaperById(paper.id);
    return res.json(updated);
  } catch (error) {
    console.error('Offline pin failed:', error);
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

router.put('/:id/progress', async (req, res) => {
  try {
    const page = Math.max(1, Number.parseInt(req.body?.page, 10) || 1);
    const totalPagesRaw = Number.parseInt(req.body?.totalPages, 10);
    const totalPages = Number.isFinite(totalPagesRaw) ? Math.max(page, totalPagesRaw) : null;
    const db = await getDB();
    db.run(
      `UPDATE papers
       SET current_page = ?, total_pages = COALESCE(?, total_pages),
           last_read_at = datetime('now'), last_accessed_at = datetime('now'),
           updated_at = datetime('now')
       WHERE id = ?`,
      [page, totalPages, req.params.id]
    );
    saveDB();
    const result = db.exec('SELECT * FROM papers WHERE id = ?', [req.params.id]);
    if (result.length === 0 || result[0].values.length === 0) {
      return res.status(404).json({ error: 'Paper not found' });
    }
    return res.json(rowToObject(result[0].values[0], result[0].columns));
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// Fetch arXiv metadata for placeholder or incomplete papers.
router.post('/:id/fetch-metadata', async (req, res) => {
  try {
    const paper = await fetchPaperById(req.params.id);
    if (!paper) return res.status(404).json({ error: 'Paper not found' });

    const arxivId = resolvePaperArxivId(paper);
    if (!arxivId) {
      return res.status(400).json({ error: 'No arXiv ID available for this paper' });
    }

    const metadata = await fetchArxivMetadata(arxivId, 3);
    if (!hasUsableMetadata(metadata, paper)) {
      return res.status(502).json({ error: 'Metadata fetch returned no usable title or abstract' });
    }

    const nextTitle = metadata.title && !isPlaceholderTitle(metadata.title, paper.id)
      ? metadata.title
      : paper.title;
    const nextAuthors = metadata.authors || paper.authors || null;
    const nextAbstract = String(metadata.abstract || '').trim() || paper.abstract || null;
    const nextYear = Number.isFinite(metadata.year) ? metadata.year : paper.year || null;
    const db = await getDB();

    db.run(
      `UPDATE papers
       SET title = ?, authors = ?, abstract = ?, year = ?, updated_at = datetime('now')
       WHERE id = ?`,
      [nextTitle, nextAuthors, nextAbstract, nextYear, paper.id]
    );
    saveDB();
    await syncNotesTitleForMetadataFetch(paper, nextTitle);

    const updated = await fetchPaperById(paper.id);
    return res.json(updated);
  } catch (error) {
    console.error('Metadata fetch failed:', error);
    return res.status(error.status || 500).json({ error: error.message || 'Metadata fetch failed' });
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
    const digest = await hashFile(req.file.path);
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
    await fs.writeFile(notesPath, `# ${title}\n`, 'utf8');

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
