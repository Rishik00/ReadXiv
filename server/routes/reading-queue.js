import express from 'express';
import { getDB, saveDB } from '../db.js';

const router = express.Router();

function rowToObject(row, columns) {
  const obj = {};
  columns.forEach((col, i) => {
    obj[col] = row[i];
  });
  return obj;
}

// GET /api/reading-queue - list queue items with paper data, ordered by position
router.get('/', async (req, res) => {
  try {
    const db = await getDB();
    const result = db.exec(`
      SELECT p.*, rq.position, rq.created_at as queued_at
      FROM reading_queue rq
      JOIN papers p ON p.id = rq.paper_id
      ORDER BY rq.position ASC
    `);
    if (result.length === 0) {
      return res.json([]);
    }
    const columns = result[0].columns;
    const items = result[0].values.map((row) => rowToObject(row, columns));
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST /api/reading-queue - add paper to queue (appends to end)
router.post('/', async (req, res) => {
  try {
    const db = await getDB();
    const { paperId } = req.body;
    if (!paperId) {
      return res.status(400).json({ error: 'paperId required' });
    }

    const existing = db.exec('SELECT 1 FROM reading_queue WHERE paper_id = ?', [paperId]);
    if (existing.length > 0 && existing[0].values.length > 0) {
      return res.status(409).json({ error: 'Paper already in queue' });
    }

    const paperExists = db.exec('SELECT 1 FROM papers WHERE id = ?', [paperId]);
    if (paperExists.length === 0 || paperExists[0].values.length === 0) {
      return res.status(404).json({ error: 'Paper not found' });
    }

    const maxResult = db.exec('SELECT COALESCE(MAX(position), -1) + 1 as next_pos FROM reading_queue');
    const nextPos = maxResult.length > 0 && maxResult[0].values[0]
      ? maxResult[0].values[0][0]
      : 0;

    db.run(
      'INSERT INTO reading_queue (paper_id, position) VALUES (?, ?)',
      [paperId, nextPos]
    );
    saveDB();

    const result = db.exec(`
      SELECT p.*, rq.position, rq.created_at as queued_at
      FROM reading_queue rq
      JOIN papers p ON p.id = rq.paper_id
      WHERE rq.paper_id = ?
    `, [paperId]);
    const columns = result[0].columns;
    const item = rowToObject(result[0].values[0], columns);
    res.status(201).json(item);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PATCH /api/reading-queue/reorder - reorder queue by array of paper ids (must be before /:paperId)
router.patch('/reorder', async (req, res) => {
  try {
    const db = await getDB();
    const { paperIds } = req.body;
    if (!Array.isArray(paperIds) || paperIds.length === 0) {
      return res.status(400).json({ error: 'paperIds array required' });
    }

    const placeholders = paperIds.map(() => '?').join(',');
    const inQueue = db.exec(
      `SELECT paper_id FROM reading_queue WHERE paper_id IN (${placeholders})`,
      paperIds
    );
    const inQueueIds = inQueue.length > 0
      ? inQueue[0].values.map((r) => r[0])
      : [];
    if (inQueueIds.length !== paperIds.length) {
      return res.status(400).json({ error: 'All paperIds must be in the queue' });
    }

    db.exec('BEGIN TRANSACTION');
    try {
      paperIds.forEach((id, idx) => {
        db.run('UPDATE reading_queue SET position = ? WHERE paper_id = ?', [idx, id]);
      });
      saveDB();
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }

    const result = db.exec(`
      SELECT p.*, rq.position, rq.created_at as queued_at
      FROM reading_queue rq
      JOIN papers p ON p.id = rq.paper_id
      ORDER BY rq.position ASC
    `);
    const columns = result[0].columns;
    const items = result[0].values.map((row) => rowToObject(row, columns));
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/reading-queue/:paperId - remove from queue
router.delete('/:paperId', async (req, res) => {
  try {
    const db = await getDB();
    db.run('DELETE FROM reading_queue WHERE paper_id = ?', [req.params.paperId]);
    saveDB();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
