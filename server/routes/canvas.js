import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { CANVAS_DIR } from '../../lib/utils/paths.mjs';

const router = express.Router();

await fs.mkdir(CANVAS_DIR, { recursive: true });

router.get('/global', async (req, res) => {
  try {
    const canvasPath = path.join(CANVAS_DIR, 'global.json');
    try {
      const data = await fs.readFile(canvasPath, 'utf-8');
      res.json(JSON.parse(data));
    } catch (error) {
      if (error.code === 'ENOENT') {
        res.json({});
      } else {
        throw error;
      }
    }
  } catch (error) {
    console.error('Error reading global canvas:', error);
    res.status(500).json({ error: 'Failed to read canvas' });
  }
});

router.put('/global', async (req, res) => {
  try {
    const canvasPath = path.join(CANVAS_DIR, 'global.json');
    await fs.writeFile(canvasPath, JSON.stringify(req.body, null, 2));
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving global canvas:', error);
    res.status(500).json({ error: 'Failed to save canvas' });
  }
});

export default router;
