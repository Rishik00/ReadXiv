import fs from 'fs-extra';
import axios from 'axios';
import { spawn } from 'child_process';
import path from 'path';
import { PACKAGE_ROOT, SERVER_PID_PATH } from './paths.mjs';

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function readServerPid() {
  if (!(await fs.pathExists(SERVER_PID_PATH))) return null;
  const raw = await fs.readFile(SERVER_PID_PATH, 'utf8');
  const pid = Number.parseInt(raw, 10);
  return Number.isFinite(pid) ? pid : null;
}

async function writeServerPid(pid) {
  await fs.writeFile(SERVER_PID_PATH, String(pid), 'utf8');
}

export async function isServerRunning(port = 7474) {
  try {
    await axios.get(`http://127.0.0.1:${port}/health`, { timeout: 1200 });
    return true;
  } catch {
    return false;
  }
}

export async function waitForServer(port = 7474, timeoutMs = 12000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isServerRunning(port)) return true;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return false;
}

export async function startServerInBackground(port = 7474) {
  if (await isServerRunning(port)) return { started: false, reason: 'already-running' };

  const existingPid = await readServerPid();
  if (existingPid && isProcessAlive(existingPid)) {
    const becameHealthy = await waitForServer(port, 3000);
    if (becameHealthy) return { started: false, reason: 'already-running' };
  }

  const serverCwd = path.join(PACKAGE_ROOT, 'server');
  const child = spawn(process.execPath, ['index.js'], {
    cwd: serverCwd,
    env: { ...process.env, PORT: String(port) },
    detached: true,
    stdio: 'ignore',
  });
  child.unref();

  await writeServerPid(child.pid);
  const ready = await waitForServer(port);
  if (!ready) {
    throw new Error(`Server failed to start on port ${port}`);
  }

  return { started: true, pid: child.pid };
}

export async function ensureServerRunning(port = 7474, autoStart = true) {
  if (await isServerRunning(port)) return { running: true, started: false };
  if (!autoStart) {
    throw new Error(
      `Server is not running on port ${port}. Start it with "readxiv start:client" or enable autoStartServer.`
    );
  }
  const result = await startServerInBackground(port);
  return { running: true, started: result.started };
}

export async function stopServer() {
  const pid = await readServerPid();
  if (!pid) return { stopped: false, reason: 'no-pid-file' };

  if (!isProcessAlive(pid)) {
    await fs.remove(SERVER_PID_PATH);
    return { stopped: false, reason: 'not-running' };
  }

  process.kill(pid);
  await fs.remove(SERVER_PID_PATH);
  return { stopped: true, pid };
}
