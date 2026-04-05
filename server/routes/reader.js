import express from 'express';
import fs from 'fs-extra';
import path from 'path';
import { getDB, saveDB, PAPYRUS_DIR } from '../db.js';
import { fetchReferencesFromSemanticScholar } from '../semanticScholarReferences.mjs';

async function resolvePdfPathForPaper(paper) {
  if (!paper?.id) return null;
  if (paper.pdf_path) {
    if (await fs.pathExists(paper.pdf_path)) {
      const st = await fs.stat(paper.pdf_path);
      if (st.size > 0) return paper.pdf_path;
    }
  }
  const offlinePath = path.join(PAPYRUS_DIR, 'offline', `${paper.id}.pdf`);
  if (await fs.pathExists(offlinePath)) {
    const st = await fs.stat(offlinePath);
    if (st.size > 0) return offlinePath;
  }
  return null;
}
import { randomUUID } from 'crypto';

const router = express.Router();

function rowToObject(row, columns) {
  const obj = {};
  columns.forEach((col, i) => {
    obj[col] = row[i];
  });
  return obj;
}

async function getPaperById(id) {
  const db = await getDB();
  const result = db.exec('SELECT * FROM papers WHERE id = ?', [id]);
  if (result.length === 0 || result[0].values.length === 0) return null;
  return rowToObject(result[0].values[0], result[0].columns);
}

function getNotesPath(paperId) {
  return path.join(PAPYRUS_DIR, 'notes', `${paperId}.md`);
}

function buildDefaultNotesTemplate(paper) {
  return `# ${paper.title}\n\n## Quotes from the paper\n\n> Add highlighted quotes here.\n\n## Opinions and Questions\n\n- Add your thoughts, critiques, and open questions.\n`;
}

router.get('/:id/references', async (req, res) => {
  try {
    const paper = await getPaperById(req.params.id);
    if (!paper) return res.status(404).json({ error: 'Paper not found' });
    const references = await fetchReferencesFromSemanticScholar(paper);
    return res.json({ references });
  } catch (err) {
    console.warn('[reader] references:', err?.message || err);
    return res.json({ references: [] });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const paper = await getPaperById(req.params.id);
    if (!paper) return res.status(404).json({ error: 'Paper not found' });

    const brief =
      req.query.brief === '1' ||
      req.query.brief === 'true' ||
      req.query.light === '1';

    if (brief) {
      const pdfPath = await resolvePdfPathForPaper(paper);
      return res.json({
        ...paper,
        hasPdf: Boolean(pdfPath),
        offline_pinned: Number(paper.offline_pinned) === 1 ? 1 : 0,
      });
    }

    const notesPath = getNotesPath(paper.id);
    const notes = (await fs.pathExists(notesPath))
      ? await fs.readFile(notesPath, 'utf8')
      : buildDefaultNotesTemplate(paper);

    const pdfPath = await resolvePdfPathForPaper(paper);
    return res.json({
      ...paper,
      notes,
      hasPdf: Boolean(pdfPath),
      offline_pinned: Number(paper.offline_pinned) === 1 ? 1 : 0,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.get('/:id/pdf', async (req, res) => {
  try {
    const paper = await getPaperById(req.params.id);
    if (!paper) return res.status(404).json({ error: 'Paper not found' });
    const resolvedPath = await resolvePdfPathForPaper(paper);
    if (!resolvedPath) return res.status(404).json({ error: 'PDF file not found' });
    const stat = await fs.stat(resolvedPath);
    const fileSize = stat.size;
    const range = req.headers.range;
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Type', 'application/pdf');

    if (range) {
      const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
      const start = Number(startStr);
      const end = endStr ? Number(endStr) : fileSize - 1;
      const chunkSize = end - start + 1;
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
      res.setHeader('Content-Length', chunkSize);
      return fs.createReadStream(resolvedPath, { start, end }).pipe(res);
    }

    res.setHeader('Content-Length', fileSize);
    return fs.createReadStream(resolvedPath).pipe(res);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.get('/:id/notes', async (req, res) => {
  try {
    const paper = await getPaperById(req.params.id);
    if (!paper) return res.status(404).json({ error: 'Paper not found' });

    const notesPath = getNotesPath(req.params.id);
    if (!(await fs.pathExists(notesPath))) {
      const initial = buildDefaultNotesTemplate(paper);
      await fs.writeFile(notesPath, initial, 'utf8');
      return res.json({ content: initial, updatedAt: new Date().toISOString() });
    }

    const content = await fs.readFile(notesPath, 'utf8');
    const stat = await fs.stat(notesPath);
    return res.json({ content, updatedAt: stat.mtime.toISOString() });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.put('/:id/notes', async (req, res) => {
  try {
    const paper = await getPaperById(req.params.id);
    if (!paper) return res.status(404).json({ error: 'Paper not found' });

    const content = typeof req.body?.content === 'string' ? req.body.content : '';
    const notesPath = getNotesPath(req.params.id);
    await fs.writeFile(notesPath, content, 'utf8');

    const db = await getDB();
    db.run("UPDATE papers SET updated_at = datetime('now') WHERE id = ?", [req.params.id]);
    saveDB();

    const stat = await fs.stat(notesPath);
    return res.json({ success: true, updatedAt: stat.mtime.toISOString() });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.get('/:id/highlights', async (req, res) => {
  try {
    const paper = await getPaperById(req.params.id);
    if (!paper) return res.status(404).json({ error: 'Paper not found' });

    const db = await getDB();
    const result = db.exec(
      'SELECT * FROM highlights WHERE paper_id = ? ORDER BY created_at ASC',
      [req.params.id]
    );

    if (result.length === 0) return res.json([]);

    const rows = result[0].values.map((row) => rowToObject(row, result[0].columns));
    const highlights = rows.map((h) => ({
      ...h,
      rect: h.rect_json ? JSON.parse(h.rect_json) : null,
    }));

    return res.json(highlights);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.post('/:id/highlights', async (req, res) => {
  try {
    const paper = await getPaperById(req.params.id);
    if (!paper) return res.status(404).json({ error: 'Paper not found' });

    const { page, text, color = 'yellow', rect, note = '' } = req.body || {};
    if (!page || !rect) {
      return res.status(400).json({ error: 'page and rect are required' });
    }

    const highlightId = randomUUID();
    const db = await getDB();
    db.run(
      `INSERT INTO highlights (id, paper_id, page, text, color, rect_json, note, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        highlightId,
        req.params.id,
        Number(page),
        text || '',
        color,
        JSON.stringify(rect),
        note,
      ]
    );
    saveDB();

    return res.status(201).json({
      id: highlightId,
      paper_id: req.params.id,
      page: Number(page),
      text: text || '',
      color,
      rect,
      note,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.delete('/:id/highlights/:highlightId', async (req, res) => {
  try {
    const paper = await getPaperById(req.params.id);
    if (!paper) return res.status(404).json({ error: 'Paper not found' });

    const db = await getDB();
    db.run('DELETE FROM highlights WHERE id = ? AND paper_id = ?', [
      req.params.highlightId,
      req.params.id,
    ]);
    saveDB();

    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.delete('/:id/highlights', async (req, res) => {
  try {
    const paper = await getPaperById(req.params.id);
    if (!paper) return res.status(404).json({ error: 'Paper not found' });

    const db = await getDB();
    db.run('DELETE FROM highlights WHERE paper_id = ?', [req.params.id]);
    saveDB();

    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

export default router;

