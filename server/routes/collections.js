import express from 'express';
import { randomUUID } from 'crypto';
import { getDB, saveDB } from '../db.js';

const router = express.Router();

function rows(result) {
  if (!result?.[0]) return [];
  return result[0].values.map((row) => Object.fromEntries(result[0].columns.map((key, index) => [key, row[index]])));
}

router.get('/', async (_req, res) => {
  try {
    const db = await getDB();
    return res.json(rows(db.exec(`
      SELECT c.*, COUNT(pc.paper_id) AS paper_count
      FROM collections c
      LEFT JOIN paper_collections pc ON pc.collection_id = c.id
      GROUP BY c.id
      ORDER BY c.updated_at DESC, c.name COLLATE NOCASE ASC
    `)));
  } catch (error) { return res.status(500).json({ error: error.message }); }
});

router.post('/', async (req, res) => {
  const name = String(req.body?.name || '').trim();
  const description = String(req.body?.description || '').trim();
  if (!name || name.length > 100) return res.status(400).json({ error: 'Enter a collection name up to 100 characters.' });
  try {
    const db = await getDB();
    const id = randomUUID();
    db.run("INSERT INTO collections (id, name, description, created_at, updated_at) VALUES (?, ?, ?, datetime('now'), datetime('now'))", [id, name, description || null]);
    saveDB();
    return res.status(201).json(rows(db.exec('SELECT *, 0 AS paper_count FROM collections WHERE id = ?', [id]))[0]);
  } catch (error) {
    return res.status(error.message.includes('UNIQUE') ? 409 : 500).json({ error: error.message.includes('UNIQUE') ? 'A collection with that name already exists.' : error.message });
  }
});

router.get('/paper/:paperId', async (req, res) => {
  try {
    const db = await getDB();
    return res.json(rows(db.exec(`SELECT c.* FROM collections c JOIN paper_collections pc ON pc.collection_id = c.id WHERE pc.paper_id = ? ORDER BY c.name COLLATE NOCASE`, [req.params.paperId])));
  } catch (error) { return res.status(500).json({ error: error.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const db = await getDB();
    const collection = rows(db.exec('SELECT * FROM collections WHERE id = ?', [req.params.id]))[0];
    if (!collection) return res.status(404).json({ error: 'Collection not found' });
    const papers = rows(db.exec(`SELECT p.* FROM papers p JOIN paper_collections pc ON pc.paper_id = p.id WHERE pc.collection_id = ? ORDER BY pc.created_at DESC`, [req.params.id]));
    return res.json({ ...collection, papers });
  } catch (error) { return res.status(500).json({ error: error.message }); }
});

router.put('/:id/papers/:paperId', async (req, res) => {
  try {
    const db = await getDB();
    if (!rows(db.exec('SELECT id FROM collections WHERE id = ?', [req.params.id]))[0] || !rows(db.exec('SELECT id FROM papers WHERE id = ?', [req.params.paperId]))[0]) return res.status(404).json({ error: 'Collection or paper not found' });
    db.run("INSERT OR IGNORE INTO paper_collections (paper_id, collection_id, created_at) VALUES (?, ?, datetime('now'))", [req.params.paperId, req.params.id]);
    db.run("UPDATE collections SET updated_at = datetime('now') WHERE id = ?", [req.params.id]);
    saveDB();
    return res.status(204).end();
  } catch (error) { return res.status(500).json({ error: error.message }); }
});

router.delete('/:id/papers/:paperId', async (req, res) => {
  try { const db = await getDB(); db.run('DELETE FROM paper_collections WHERE collection_id = ? AND paper_id = ?', [req.params.id, req.params.paperId]); db.run("UPDATE collections SET updated_at = datetime('now') WHERE id = ?", [req.params.id]); saveDB(); return res.status(204).end(); } catch (error) { return res.status(500).json({ error: error.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const db = await getDB();
    db.run('DELETE FROM paper_collections WHERE collection_id = ?', [req.params.id]);
    db.run('DELETE FROM collections WHERE id = ?', [req.params.id]);
    saveDB();
    return res.status(204).end();
  } catch (error) { return res.status(500).json({ error: error.message }); }
});

export default router;
