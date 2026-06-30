import express from 'express';
import { performBackup, getBackupState, setBackupInterval } from '../backup.js';

const router = express.Router();

router.get('/status', (_req, res) => {
  try {
    res.json(getBackupState());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (_req, res) => {
  try {
    const result = await performBackup();
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/settings', (req, res) => {
  const { intervalDays } = req.body;
  if (!Number.isFinite(intervalDays) || intervalDays < 0) {
    return res.status(400).json({ error: 'intervalDays must be a non-negative number (0 = disabled)' });
  }
  setBackupInterval(intervalDays);
  res.json({ success: true, intervalDays });
});

export default router;
