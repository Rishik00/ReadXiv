import express from 'express';
import { getDB, saveDB } from '../db.js';
import {
  createTask,
  closeTask,
  getTask,
  getTasksByIds,
  updateTask,
  todoistErrorMessage,
  listProjects,
  createProject,
  READXIV_TODOIST_PROJECT_NAME,
} from '../todoistApi.js';
import {
  getTodoistCredentials,
  getTodoistSettingsForClient,
  patchPapyrusConfig,
} from '../todoistConfig.js';

const router = express.Router();

function rowToObject(row, columns) {
  const obj = {};
  columns.forEach((col, i) => {
    obj[col] = row[i];
  });
  return obj;
}

function fetchPaperById(db, id) {
  const result = db.exec('SELECT * FROM papers WHERE id = ?', [id]);
  if (result.length === 0 || result[0].values.length === 0) return null;
  return rowToObject(result[0].values[0], result[0].columns);
}

const SETTINGS_HINT =
  'Open Settings in ReadXiv and paste your Todoist API token (or set TODOIST_API_TOKEN). See Help.';

/** @param {object} body */
function parseTaskOptions(body, { forUpdate = false } = {}) {
  const out = {};
  if (!body || typeof body !== 'object') return out;

  if (body.priority != null && body.priority !== '') {
    const p = Number(body.priority);
    if ([1, 2, 3, 4].includes(p)) out.priority = p;
  }

  if ('due_date' in body) {
    const v = body.due_date;
    if (v === null || v === '') {
      if (forUpdate) out.due_date = null;
    } else if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.trim())) {
      out.due_date = v.trim();
    }
  }

  return out;
}

router.get('/settings', (req, res) => {
  try {
    res.json(getTodoistSettingsForClient());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/settings', (req, res) => {
  try {
    const body = req.body || {};
    const patch = {};

    if (body.clearToken === true) {
      patch.todoistApiToken = null;
    } else if (typeof body.apiToken === 'string' && body.apiToken.trim()) {
      patch.todoistApiToken = body.apiToken.trim();
    }

    if ('projectId' in body) {
      const v = body.projectId;
      patch.todoistProjectId =
        v != null && String(v).trim() ? String(v).trim() : null;
    }

    if (Object.keys(patch).length === 0) {
      return res.status(400).json({
        error: 'Nothing to save. Enter an API token, change the project, or remove the saved token.',
      });
    }

    patchPapyrusConfig(patch);
    res.json({ ok: true, ...getTodoistSettingsForClient() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/projects-preview', async (req, res) => {
  const t = req.body?.apiToken?.trim();
  if (!t) {
    return res.status(400).json({ error: 'Paste your API token to fetch projects.' });
  }
  try {
    const projects = await listProjects(t);
    res.json({ projects });
  } catch (err) {
    const status = err.response?.status || 500;
    const message = todoistErrorMessage(err);
    return res.status(status >= 400 && status < 600 ? status : 502).json({ error: message });
  }
});

router.get('/projects', async (req, res) => {
  const { token } = getTodoistCredentials();
  if (!token) {
    return res.status(401).json({
      error: 'Save your Todoist token in Settings first (or set TODOIST_API_TOKEN in the environment).',
    });
  }
  try {
    const projects = await listProjects(token);
    res.json({ projects });
  } catch (err) {
    const status = err.response?.status || 500;
    const message = todoistErrorMessage(err);
    return res.status(status >= 400 && status < 600 ? status : 502).json({ error: message });
  }
});

router.get('/linked', async (req, res) => {
  const { token } = getTodoistCredentials();
  if (!token) {
    return res.status(501).json({
      error: `Todoist is not configured. ${SETTINGS_HINT}`,
      items: [],
    });
  }
  try {
    const db = await getDB();
    const result = db.exec(
      `SELECT * FROM papers
       WHERE todoist_task_id IS NOT NULL AND trim(todoist_task_id) != ''
       ORDER BY updated_at DESC`
    );
    if (!result.length || !result[0].values.length) {
      return res.json({ items: [] });
    }
    const columns = result[0].columns;
    const papers = result[0].values.map((row) => rowToObject(row, columns));
    const taskIds = papers.map((p) => p.todoist_task_id).filter(Boolean);
    const taskMap = await getTasksByIds(token, taskIds);
    const items = papers.map((paper) => {
      const tid = paper.todoist_task_id;
      const raw = taskMap.get(tid);
      if (!raw) {
        return {
          paper,
          todoist: null,
          stale: true,
        };
      }
      return {
        paper,
        stale: false,
        todoist: {
          taskId: raw.id,
          checked: !!raw.checked,
          completedAt: raw.completed_at || null,
          due: raw.due ?? null,
          deadline: raw.deadline ?? null,
          priority: typeof raw.priority === 'number' ? raw.priority : 1,
        },
      };
    });
    res.json({ items });
  } catch (err) {
    const status = err.response?.status || 500;
    const message = todoistErrorMessage(err);
    return res.status(status >= 400 && status < 600 ? status : 502).json({
      error: message,
      items: [],
    });
  }
});

/** Batch-resolve Todoist task fields for papers (e.g. home /search preview). */
router.post('/resolve-papers', async (req, res) => {
  const { token } = getTodoistCredentials();
  const paperIds = req.body?.paperIds;
  if (!Array.isArray(paperIds) || paperIds.length === 0) {
    return res.json({});
  }
  if (!token) {
    return res.status(501).json({ error: `Todoist is not configured. ${SETTINGS_HINT}` });
  }
  try {
    const db = await getDB();
    const taskByPaper = new Map();
    for (const pid of paperIds) {
      const paper = fetchPaperById(db, pid);
      if (paper?.todoist_task_id) taskByPaper.set(pid, paper.todoist_task_id);
    }
    if (taskByPaper.size === 0) return res.json({});

    const taskIds = [...new Set([...taskByPaper.values()])];
    const taskMap = await getTasksByIds(token, taskIds);
    const out = {};
    for (const [pid, tid] of taskByPaper) {
      const raw = taskMap.get(tid);
      if (!raw) {
        out[pid] = { stale: true, todoist: null };
      } else {
        out[pid] = {
          stale: false,
          todoist: {
            taskId: raw.id,
            checked: !!raw.checked,
            completedAt: raw.completed_at || null,
            due: raw.due ?? null,
            deadline: raw.deadline ?? null,
            priority: typeof raw.priority === 'number' ? raw.priority : 1,
          },
        };
      }
    }
    res.json(out);
  } catch (err) {
    const status = err.response?.status || 500;
    const message = todoistErrorMessage(err);
    return res.status(status >= 400 && status < 600 ? status : 502).json({ error: message });
  }
});

router.post('/ensure-readxiv-project', async (req, res) => {
  const { token } = getTodoistCredentials();
  if (!token) {
    return res.status(401).json({ error: SETTINGS_HINT });
  }
  try {
    const projects = await listProjects(token);
    let row = projects.find((p) => p.name === READXIV_TODOIST_PROJECT_NAME);
    let created = false;
    if (!row) {
      const id = await createProject(token, READXIV_TODOIST_PROJECT_NAME);
      row = { id, name: READXIV_TODOIST_PROJECT_NAME };
      created = true;
    }
    patchPapyrusConfig({ todoistProjectId: row.id });
    res.json({
      projectId: row.id,
      projectName: row.name,
      created,
      ...getTodoistSettingsForClient(),
    });
  } catch (err) {
    const status = err.response?.status || 500;
    const message = todoistErrorMessage(err);
    return res.status(status >= 400 && status < 600 ? status : 502).json({ error: message });
  }
});

router.get('/papers/:paperId/task', async (req, res) => {
  const { token } = getTodoistCredentials();
  if (!token) {
    return res.status(501).json({
      error: `Todoist is not configured. ${SETTINGS_HINT}`,
    });
  }

  const { paperId } = req.params;
  try {
    const db = await getDB();
    const paper = fetchPaperById(db, paperId);
    if (!paper) {
      return res.status(404).json({ error: 'Paper not found' });
    }

    const taskId = paper.todoist_task_id;
    if (!taskId) {
      return res.status(400).json({ error: 'No Todoist task linked to this paper' });
    }

    const raw = await getTask(token, taskId);
    res.json({
      priority: typeof raw.priority === 'number' ? raw.priority : 1,
      due_date: raw.due && typeof raw.due === 'object' && raw.due.date ? raw.due.date : null,
      due_string: raw.due && typeof raw.due === 'object' && raw.due.string ? raw.due.string : null,
    });
  } catch (err) {
    const status = err.response?.status || 500;
    const message = todoistErrorMessage(err);
    return res.status(status >= 400 && status < 600 ? status : 502).json({ error: message });
  }
});

router.patch('/papers/:paperId/task', async (req, res) => {
  const { token } = getTodoistCredentials();
  if (!token) {
    return res.status(501).json({
      error: `Todoist is not configured. ${SETTINGS_HINT}`,
    });
  }

  const { paperId } = req.params;
  try {
    const db = await getDB();
    const paper = fetchPaperById(db, paperId);
    if (!paper) {
      return res.status(404).json({ error: 'Paper not found' });
    }

    const taskId = paper.todoist_task_id;
    if (!taskId) {
      return res.status(400).json({ error: 'No Todoist task linked to this paper' });
    }

    const opts = parseTaskOptions(req.body || {}, { forUpdate: true });
    if (Object.keys(opts).length === 0) {
      return res.status(400).json({
        error: 'Nothing to update. Send priority and/or due_date (use null to clear the due date).',
      });
    }

    await updateTask(token, taskId, opts);
    res.json({ ok: true });
  } catch (err) {
    const status = err.response?.status || 500;
    const message = todoistErrorMessage(err);
    return res.status(status >= 400 && status < 600 ? status : 502).json({ error: message });
  }
});

router.post('/papers/:paperId', async (req, res) => {
  const { token, projectId: defaultProjectId } = getTodoistCredentials();
  if (!token) {
    return res.status(501).json({
      error: `Todoist is not configured. ${SETTINGS_HINT}`,
    });
  }

  const { paperId } = req.params;
  try {
    const db = await getDB();
    const paper = fetchPaperById(db, paperId);
    if (!paper) {
      return res.status(404).json({ error: 'Paper not found' });
    }

    if (paper.todoist_task_id) {
      return res.status(409).json({
        error: 'Paper already linked to a Todoist task',
        taskId: paper.todoist_task_id,
      });
    }

    const title = (paper.title || 'Paper').trim() || 'Paper';
    const content = `[ReadXiv] ${title}`;

    const descLines = [];
    if (paper.url) {
      descLines.push(`Read here: [${title}](${paper.url})`);
    }
    descLines.push(`ReadXiv: ${paper.id}`);
    const description = descLines.join('\n\n');

    const taskOpts = parseTaskOptions(req.body || {}, { forUpdate: false });

    const taskId = await createTask(token, {
      content,
      description,
      project_id: defaultProjectId,
      ...taskOpts,
    });

    db.run(
      "UPDATE papers SET todoist_task_id = ?, updated_at = datetime('now') WHERE id = ?",
      [taskId, paperId]
    );
    saveDB();

    return res.json({ taskId });
  } catch (err) {
    const status = err.response?.status || 500;
    const message = todoistErrorMessage(err);
    return res.status(status >= 400 && status < 600 ? status : 502).json({ error: message });
  }
});

router.post('/papers/:paperId/complete', async (req, res) => {
  const { token } = getTodoistCredentials();
  if (!token) {
    return res.status(501).json({
      error: `Todoist is not configured. ${SETTINGS_HINT}`,
    });
  }

  const { paperId } = req.params;
  try {
    const db = await getDB();
    const paper = fetchPaperById(db, paperId);
    if (!paper) {
      return res.status(404).json({ error: 'Paper not found' });
    }

    const taskId = paper.todoist_task_id;
    if (!taskId) {
      return res.status(400).json({ error: 'No Todoist task linked to this paper' });
    }

    await closeTask(token, taskId);

    db.run(
      "UPDATE papers SET todoist_task_id = NULL, updated_at = datetime('now') WHERE id = ?",
      [paperId]
    );
    saveDB();

    return res.json({ ok: true });
  } catch (err) {
    const status = err.response?.status || 500;
    const message = todoistErrorMessage(err);
    return res.status(status >= 400 && status < 600 ? status : 502).json({ error: message });
  }
});

export default router;
