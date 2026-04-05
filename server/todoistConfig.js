import fs from 'fs';
import path from 'path';
import os from 'os';

const CONFIG_PATH = path.join(os.homedir(), '.papyrus', 'config.json');

/**
 * Credentials: TODOIST_* and SEMANTIC_SCHOLAR_API_KEY env vars override ~/.papyrus/config.json (file is written from Settings UI).
 */
export function readPapyrusConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    }
  } catch {
    // ignore
  }
  return {};
}

export function writePapyrusConfig(next) {
  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2), 'utf8');
}

/** Merge a patch into config.json (shallow keys); then write. */
export function patchPapyrusConfig(patch) {
  const cur = readPapyrusConfig();
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    cur[k] = v;
  }
  writePapyrusConfig(cur);
}

export function getTodoistCredentials() {
  const file = readPapyrusConfig();
  let fileToken =
    typeof file.todoistApiToken === 'string' && file.todoistApiToken.trim()
      ? file.todoistApiToken.trim()
      : null;
  let fileProjectId =
    typeof file.todoistProjectId === 'string' && file.todoistProjectId.trim()
      ? file.todoistProjectId.trim()
      : null;

  const envToken = process.env.TODOIST_API_TOKEN?.trim() || null;
  const envProject = process.env.TODOIST_PROJECT_ID?.trim() || null;

  return {
    token: envToken || fileToken || null,
    projectId: envProject || fileProjectId || null,
    fileToken,
    fileProjectId,
    envToken: !!envToken,
    envProject: !!envProject,
  };
}

export function getTodoistSettingsForClient() {
  const file = readPapyrusConfig();
  const hasFileToken =
    typeof file.todoistApiToken === 'string' && !!file.todoistApiToken.trim();
  const fileProjectId =
    typeof file.todoistProjectId === 'string' && file.todoistProjectId.trim()
      ? file.todoistProjectId.trim()
      : null;
  const creds = getTodoistCredentials();

  return {
    ready: !!creds.token,
    tokenSource: creds.envToken ? 'env' : hasFileToken ? 'file' : 'none',
    hasFileToken,
    fileProjectId,
    envOverridesToken: creds.envToken,
    envOverridesProject: creds.envProject,
  };
}

/**
 * Semantic Scholar Graph API key: SEMANTIC_SCHOLAR_API_KEY overrides ~/.papyrus/config.json (file from Settings UI).
 */
export function getSemanticScholarApiKey() {
  const envKey = process.env.SEMANTIC_SCHOLAR_API_KEY?.trim() || null;
  if (envKey) return envKey;
  const file = readPapyrusConfig();
  const fk =
    typeof file.semanticScholarApiKey === 'string' ? file.semanticScholarApiKey.trim() : '';
  return fk || null;
}

export function getSemanticScholarSettingsForClient() {
  const file = readPapyrusConfig();
  const hasFileKey =
    typeof file.semanticScholarApiKey === 'string' && !!file.semanticScholarApiKey.trim();
  const envKey = process.env.SEMANTIC_SCHOLAR_API_KEY?.trim() || null;
  const effective = envKey || (hasFileKey ? file.semanticScholarApiKey.trim() : null);
  return {
    configured: !!effective,
    keySource: envKey ? 'env' : hasFileKey ? 'file' : 'none',
    hasFileKey,
    envOverridesKey: !!envKey,
  };
}
