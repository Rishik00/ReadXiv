import express from 'express';
import {
  getSemanticScholarSettingsForClient,
  patchPapyrusConfig,
} from '../todoistConfig.js';

const router = express.Router();

router.get('/settings', (req, res) => {
  try {
    res.json(getSemanticScholarSettingsForClient());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/settings', (req, res) => {
  try {
    const body = req.body || {};
    const patch = {};

    if (body.clearApiKey === true) {
      patch.semanticScholarApiKey = null;
    } else if (typeof body.apiKey === 'string' && body.apiKey.trim()) {
      patch.semanticScholarApiKey = body.apiKey.trim();
    }

    if (Object.keys(patch).length === 0) {
      return res.status(400).json({
        error: 'Nothing to save. Paste an API key, or remove the saved key.',
      });
    }

    patchPapyrusConfig(patch);
    res.json({ ok: true, ...getSemanticScholarSettingsForClient() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
