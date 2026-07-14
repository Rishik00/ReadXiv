import express from 'express';
import fs from 'fs-extra';
import path from 'path';
import { createHash } from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { getDB, PAPYRUS_DIR, saveDB } from '../db.js';

const router = express.Router();
const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const NOTES_SITE_DIR = path.resolve(
  process.env.READXIV_NOTES_SITE_DIR || path.join(__dirname, '../../../notes-site')
);
let resolvedNotesSiteUrl = String(
  process.env.READXIV_NOTES_SITE_URL || 'https://notes-site-ruby.vercel.app'
).replace(/\/$/, '');

async function getNotesSiteUrl() {
  if (resolvedNotesSiteUrl) return resolvedNotesSiteUrl;
  try {
    const { stdout } = await execFileAsync('git', ['-c', `safe.directory=${NOTES_SITE_DIR}`, '-C', NOTES_SITE_DIR, 'remote', 'get-url', 'origin']);
    const match = String(stdout).trim().match(/github\.com[/:]([^/]+)\/([^/.]+)(?:\.git)?$/i);
    if (match) resolvedNotesSiteUrl = `https://${match[1]}.github.io/${match[2]}`;
  } catch {}
  return resolvedNotesSiteUrl || null;
}

function rowToObject(row, columns) {
  return Object.fromEntries(columns.map((column, index) => [column, row[index]]));
}

async function getPaper(id) {
  const db = await getDB();
  const result = db.exec('SELECT * FROM papers WHERE id = ?', [id]);
  return result.length ? rowToObject(result[0].values[0], result[0].columns) : null;
}

function hash(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitForPublishedNote(siteUrl, id, expectedMarkdown, timeoutMs = 60000) {
  if (!siteUrl) return false;
  const expectedHash = hash(expectedMarkdown);
  const deadline = Date.now() + timeoutMs;
  const noteUrl = `${siteUrl}/notes/${encodeURIComponent(id)}.md`;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${noteUrl}?readxiv-published=${Date.now()}`, {
        headers: { 'cache-control': 'no-cache' },
      });
      if (response.ok && hash(await response.text()) === expectedHash) return true;
    } catch {
      // The host may briefly refuse requests while swapping deployments.
    }
    await sleep(1500);
  }
  return false;
}

async function deployNotesSite() {
  const isWindows = process.platform === 'win32';
  const command = isWindows ? (process.env.ComSpec || 'cmd.exe') : 'vercel';
  const args = isWindows
    ? ['/d', '/s', '/c', 'vercel.cmd', 'deploy', '--prod', '--yes']
    : ['deploy', '--prod', '--yes'];
  return execFileAsync(command, args, {
    cwd: NOTES_SITE_DIR,
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024,
  });
}

function yamlString(value) {
  return JSON.stringify(String(value || ''));
}

function publishedMarkdown(paper, content) {
  const body = String(content || '').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '');
  return [
    '---',
    `title: ${yamlString(paper.title || paper.id)}`,
    `authors: ${yamlString(paper.authors || '')}`,
    `arxiv: ${yamlString(paper.id)}`,
    'status: published',
    '---',
    '',
    body.trimStart(),
  ].join('\n');
}

async function readPublishingState(id) {
  const paper = await getPaper(id);
  if (!paper) return null;
  const notesPath = path.join(PAPYRUS_DIR, 'notes', `${id}.md`);
  const content = await fs.pathExists(notesPath) ? await fs.readFile(notesPath, 'utf8') : `# ${paper.title}\n`;
  const contentHash = hash(content);
  const manifestPath = path.join(NOTES_SITE_DIR, 'manifest.json');
  const manifest = await fs.pathExists(manifestPath) ? await fs.readJson(manifestPath) : { notes: [] };
  const manifestEntry = (manifest.notes || []).find((note) => note.id === id) || null;
  const siteUrl = await getNotesSiteUrl();
  return {
    paper,
    content,
    contentHash,
    published: Boolean(paper.published_at || manifestEntry),
    changed: !paper.published_hash || paper.published_hash !== contentHash,
    publishedUrl: paper.published_url || (siteUrl ? `${siteUrl}/note.html?id=${encodeURIComponent(id)}` : null),
  };
}

router.get('/:id', async (req, res) => {
  try {
    const state = await readPublishingState(req.params.id);
    if (!state) return res.status(404).json({ error: 'Paper not found' });
    return res.json(state);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.get('/:id/preview', async (req, res) => {
  try {
    const state = await readPublishingState(req.params.id);
    if (!state) return res.status(404).send('Paper not found');
    const templatePath = path.join(NOTES_SITE_DIR, 'note.html');
    let html = await fs.readFile(templatePath, 'utf8');
    const previewId = `preview-${encodeURIComponent(state.paper.id)}`;
    const controls = `
      <style>
        .readxiv-publish-bar{position:fixed;right:24px;bottom:24px;z-index:9999;display:flex;align-items:center;gap:12px;padding:12px 14px;background:#111;color:#fff;border:1px solid #333;border-radius:10px;box-shadow:0 14px 44px rgba(0,0,0,.3);font:13px ui-monospace,monospace}
        .readxiv-publish-bar button{border:0;border-radius:7px;padding:9px 14px;background:#fff;color:#111;font:600 13px ui-monospace,monospace;cursor:pointer}
        .readxiv-publish-bar button:disabled{opacity:.55;cursor:wait}
      </style>
      <div class="readxiv-publish-bar"><span id="readxiv-publish-state">Local preview</span><button id="readxiv-publish-button">Publish</button></div>
      <script>
        (() => {
          const button = document.getElementById('readxiv-publish-button');
          const state = document.getElementById('readxiv-publish-state');
          button.addEventListener('click', async () => {
            button.disabled = true; state.textContent = 'Publishing and waiting for the notes site…';
            try {
              const response = await fetch('/api/publish/${encodeURIComponent(state.paper.id)}', { method: 'POST' });
              const data = await response.json();
              if (!response.ok) throw new Error(data.error || 'Publish failed');
              state.textContent = data.message || 'Published';
              button.textContent = data.unchanged ? 'Already current' : 'Published';
              if (data.publishedUrl && data.deploymentReady) {
                setTimeout(() => { location.href = data.publishedUrl; }, 500);
              } else if (data.publishedUrl) {
                state.textContent = 'Published. The notes site is still deploying.';
                button.textContent = 'Published';
              }
            } catch (error) {
              state.textContent = error.message; button.disabled = false;
            }
          });
        })();
      </script>`;
    html = html
      .replace('<head>', `<head><base href="/api/publish/preview-site/">`)
      .replace('</body>', `${controls}</body>`)
      .replace('const id = getId();', `const id = ${JSON.stringify(previewId)};`);
    return res.type('html').send(html);
  } catch (error) {
    return res.status(500).send(error.message);
  }
});

router.get('/preview-site/style.css', (_req, res) => {
  res.sendFile(path.join(NOTES_SITE_DIR, 'style.css'));
});

router.get('/preview-site/notes/:filename', async (req, res) => {
  try {
    const match = String(req.params.filename).match(/^preview-(.+)\.md$/);
    if (!match) return res.status(404).end();
    const id = decodeURIComponent(match[1]);
    const state = await readPublishingState(id);
    if (!state) return res.status(404).end();
    return res.type('text/markdown').send(publishedMarkdown(state.paper, state.content));
  } catch (error) {
    return res.status(500).send(error.message);
  }
});

router.post('/:id', async (req, res) => {
  try {
    const state = await readPublishingState(req.params.id);
    if (!state) return res.status(404).json({ error: 'Paper not found' });
    if (state.published && !state.changed) {
      const siteUrl = await getNotesSiteUrl();
      const outputMarkdown = publishedMarkdown(state.paper, state.content);
      let deploymentReady = await waitForPublishedNote(siteUrl, state.paper.id, outputMarkdown, 3000);
      if (!deploymentReady) {
        await deployNotesSite();
        deploymentReady = await waitForPublishedNote(siteUrl, state.paper.id, outputMarkdown);
      }
      return res.json({ ...state, deploymentReady, unchanged: true, message: 'Already published — no changes.' });
    }

    const manifestPath = path.join(NOTES_SITE_DIR, 'manifest.json');
    if (!(await fs.pathExists(manifestPath))) {
      return res.status(503).json({ error: `Notes site not found at ${NOTES_SITE_DIR}` });
    }
    const notePath = path.join(NOTES_SITE_DIR, 'notes', `${state.paper.id}.md`);
    const manifest = await fs.readJson(manifestPath);
    const publishedAt = new Date().toISOString().slice(0, 10);
    const entry = {
      id: state.paper.id,
      title: state.paper.title || state.paper.id,
      authors: state.paper.authors || '',
      template: 'freeform',
      published_at: publishedAt,
    };
    const notes = Array.isArray(manifest.notes) ? manifest.notes : [];
    const index = notes.findIndex((note) => note.id === state.paper.id);
    if (index >= 0) notes[index] = { ...notes[index], ...entry };
    else notes.push(entry);
    manifest.notes = notes;

    const outputMarkdown = publishedMarkdown(state.paper, state.content);
    await fs.ensureDir(path.dirname(notePath));
    await fs.writeFile(notePath, outputMarkdown, 'utf8');
    await fs.writeJson(manifestPath, manifest, { spaces: 2 });

    await execFileAsync('git', ['-c', `safe.directory=${NOTES_SITE_DIR}`, '-C', NOTES_SITE_DIR, 'add', 'manifest.json', `notes/${state.paper.id}.md`]);
    const diff = await execFileAsync('git', ['-c', `safe.directory=${NOTES_SITE_DIR}`, '-C', NOTES_SITE_DIR, 'diff', '--cached', '--quiet'])
      .then(() => false)
      .catch((error) => {
        if (error.code === 1) return true;
        throw error;
      });
    if (diff) {
      await execFileAsync('git', ['-c', `safe.directory=${NOTES_SITE_DIR}`, '-C', NOTES_SITE_DIR, 'commit', '-m', `Publish notes for ${state.paper.id}`]);
    }
    await execFileAsync('git', ['-c', `safe.directory=${NOTES_SITE_DIR}`, '-C', NOTES_SITE_DIR, 'push']);
    await deployNotesSite();

    const siteUrl = await getNotesSiteUrl();
    const publishedUrl = siteUrl ? `${siteUrl}/note.html?id=${encodeURIComponent(state.paper.id)}` : null;
    const deploymentReady = await waitForPublishedNote(siteUrl, state.paper.id, outputMarkdown);
    const db = await getDB();
    db.run(
      `UPDATE papers SET published_at = datetime('now'), published_url = ?,
       published_hash = ?, note_file_path = ?, updated_at = datetime('now') WHERE id = ?`,
      [publishedUrl, state.contentHash, path.join(PAPYRUS_DIR, 'notes', `${state.paper.id}.md`), state.paper.id]
    );
    saveDB();
    return res.json({
      ...state,
      published: true,
      changed: false,
      unchanged: !diff,
      publishedUrl,
      deploymentReady,
      message: diff ? 'Published.' : 'Publication files were already current.',
    });
  } catch (error) {
    return res.status(500).json({ error: error.stderr || error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const state = await readPublishingState(req.params.id);
    if (!state) return res.status(404).json({ error: 'Paper not found' });
    const manifestPath = path.join(NOTES_SITE_DIR, 'manifest.json');
    const noteRelativePath = `notes/${state.paper.id}.md`;
    const notePath = path.join(NOTES_SITE_DIR, noteRelativePath);
    const manifest = await fs.readJson(manifestPath);
    manifest.notes = (manifest.notes || []).filter((note) => note.id !== state.paper.id);
    await fs.writeJson(manifestPath, manifest, { spaces: 2 });
    if (await fs.pathExists(notePath)) await fs.remove(notePath);
    await execFileAsync('git', ['-c', `safe.directory=${NOTES_SITE_DIR}`, '-C', NOTES_SITE_DIR, 'add', '-A', 'manifest.json', noteRelativePath]);
    const changed = await execFileAsync('git', ['-c', `safe.directory=${NOTES_SITE_DIR}`, '-C', NOTES_SITE_DIR, 'diff', '--cached', '--quiet'])
      .then(() => false)
      .catch((error) => {
        if (error.code === 1) return true;
        throw error;
      });
    if (changed) {
      await execFileAsync('git', ['-c', `safe.directory=${NOTES_SITE_DIR}`, '-C', NOTES_SITE_DIR, 'commit', '-m', `Unpublish notes for ${state.paper.id}`]);
      await execFileAsync('git', ['-c', `safe.directory=${NOTES_SITE_DIR}`, '-C', NOTES_SITE_DIR, 'push']);
    }
    const db = await getDB();
    db.run(
      'UPDATE papers SET published_at = NULL, published_url = NULL, published_hash = NULL, updated_at = datetime(\'now\') WHERE id = ?',
      [state.paper.id]
    );
    saveDB();
    return res.json({ success: true, message: 'Unpublished.' });
  } catch (error) {
    return res.status(500).json({ error: error.stderr || error.message });
  }
});

export default router;
