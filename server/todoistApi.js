import axios from 'axios';

/** Todoist REST API v1 (rest/v2 returns 410 Gone as of 2026). */
const BASE = 'https://api.todoist.com/api/v1';

function bearerHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

export function todoistErrorMessage(err) {
  const status = err.response?.status;
  if (status === 410) {
    return 'Todoist returned 410 Gone — the API endpoint was retired. Update ReadXiv (or report if you are already on the latest).';
  }
  const data = err.response?.data;
  if (data && typeof data === 'object') {
    if (typeof data.error === 'string') return data.error;
    if (typeof data.message === 'string') return data.message;
  }
  if (err.message) return err.message;
  return 'Todoist request failed';
}

/**
 * @param {{ content: string, description?: string | null, project_id?: string | null, priority?: number, due_date?: string | null }} opts
 * @returns {Promise<string>} task id
 */
export async function createTask(token, opts) {
  const body = {
    content: opts.content,
  };
  if (opts.description) body.description = opts.description;
  if (opts.project_id) body.project_id = opts.project_id;
  if (typeof opts.priority === 'number' && opts.priority >= 1 && opts.priority <= 4) {
    body.priority = opts.priority;
  }
  if (opts.due_date) body.due_date = opts.due_date;

  const { data } = await axios.post(`${BASE}/tasks`, body, {
    headers: bearerHeaders(token),
    timeout: 30000,
  });
  return data.id;
}

/** @param {{ priority?: number, due_date?: string | null }} opts — pass due_date: null to clear */
export async function updateTask(token, taskId, opts) {
  const body = {};
  if (typeof opts.priority === 'number' && opts.priority >= 1 && opts.priority <= 4) {
    body.priority = opts.priority;
  }
  if ('due_date' in opts) body.due_date = opts.due_date;

  if (Object.keys(body).length === 0) return;

  await axios.post(`${BASE}/tasks/${encodeURIComponent(taskId)}`, body, {
    headers: bearerHeaders(token),
    timeout: 30000,
  });
}

export async function getTask(token, taskId) {
  const { data } = await axios.get(`${BASE}/tasks/${encodeURIComponent(taskId)}`, {
    headers: bearerHeaders(token),
    timeout: 30000,
  });
  return data;
}

export async function closeTask(token, taskId) {
  await axios.post(
    `${BASE}/tasks/${encodeURIComponent(taskId)}/close`,
    {},
    {
      headers: bearerHeaders(token),
      timeout: 30000,
    }
  );
}

/** @param {string[]} ids */
export async function getTasksByIds(token, ids) {
  const unique = [...new Set((ids || []).filter(Boolean))];
  const byId = new Map();
  const chunkSize = 200;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const { data } = await axios.get(`${BASE}/tasks`, {
      headers: bearerHeaders(token),
      timeout: 30000,
      params: { ids: chunk.join(','), limit: chunkSize },
    });
    const rows = Array.isArray(data?.results) ? data.results : [];
    for (const t of rows) {
      if (t?.id) byId.set(t.id, t);
    }
  }
  return byId;
}

/** @returns {Promise<Array<{ id: string, name: string }>>} */
export async function listProjects(token) {
  const all = [];
  let cursor = null;
  do {
    const params = { limit: 200 };
    if (cursor) params.cursor = cursor;
    const { data } = await axios.get(`${BASE}/projects`, {
      headers: bearerHeaders(token),
      timeout: 30000,
      params,
    });
    const rows = Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : [];
    for (const p of rows) {
      if (p?.id) all.push({ id: p.id, name: p.name || 'Untitled' });
    }
    cursor = data?.next_cursor || null;
  } while (cursor);
  return all;
}

/** @returns {Promise<string>} new project id */
export async function createProject(token, name) {
  const { data } = await axios.post(
    `${BASE}/projects`,
    { name: name.trim() },
    { headers: bearerHeaders(token), timeout: 30000 }
  );
  return data.id;
}

export const READXIV_TODOIST_PROJECT_NAME = 'ReadXiv Todoist';
