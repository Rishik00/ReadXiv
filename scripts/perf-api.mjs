import { spawn } from 'child_process';
import fs from 'fs-extra';
import path from 'path';
import { performance } from 'perf_hooks';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, '.perf', 'data');
const outputPath = path.join(root, '.perf', 'api-results.json');
const basePort = 17474;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function timedFetch(url) {
  const started = performance.now();
  const response = await fetch(url);
  const body = await response.arrayBuffer();
  return {
    ms: performance.now() - started,
    status: response.status,
    bytes: body.byteLength,
  };
}

async function waitUntilReady(baseUrl, timeoutMs = 15000) {
  const started = performance.now();
  while (performance.now() - started < timeoutMs) {
    try {
      const response = await fetch(`${baseUrl}/api/papers?paginate=1&pageSize=1`);
      if (response.status === 200) return performance.now() - started;
    } catch {
      // Server is still starting.
    }
    await sleep(25);
  }
  throw new Error(`Server did not become ready at ${baseUrl}`);
}

function startServer(port) {
  const child = spawn(process.execPath, ['index.js'], {
    cwd: path.join(root, 'server'),
    env: {
      ...process.env,
      PORT: String(port),
      READXIV_DATA_DIR: dataDir,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });
  return { child, getStderr: () => stderr };
}

async function stopServer(child) {
  if (child.exitCode !== null) return;
  child.kill();
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    sleep(2000),
  ]);
}

function stats(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const percentile = (p) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
  return {
    runs: sorted.length,
    minMs: Number(sorted[0].toFixed(2)),
    medianMs: Number(percentile(0.5).toFixed(2)),
    p95Ms: Number(percentile(0.95).toFixed(2)),
    maxMs: Number(sorted.at(-1).toFixed(2)),
  };
}

const coldStarts = [];
for (let index = 0; index < 5; index += 1) {
  const port = basePort + index;
  const { child, getStderr } = startServer(port);
  try {
    coldStarts.push(await waitUntilReady(`http://127.0.0.1:${port}`));
  } catch (error) {
    throw new Error(`${error.message}\n${getStderr()}`);
  } finally {
    await stopServer(child);
  }
}

const port = basePort + 20;
const baseUrl = `http://127.0.0.1:${port}`;
const { child, getStderr } = startServer(port);
try {
  await waitUntilReady(baseUrl);
  const papers = await fetch(`${baseUrl}/api/papers`).then((response) => response.json());
  const firstPaperId = encodeURIComponent(papers[0].id);
  const titleToken =
    papers[0].title.split(/\W+/).find((token) => token.length >= 5)?.toLowerCase() || 'model';

  const scenarios = {
    papersPage: '/api/papers?page=1&pageSize=10',
    dashboard: '/api/dashboard/summary?days=30',
    broadSearch: '/api/search?q=model',
    titleSearch: `/api/search?q=${encodeURIComponent(titleToken)}`,
    recents: '/api/papers/recents?limit=8',
    readerMetadata: `/api/reader/${firstPaperId}`,
  };
  const measurements = {};

  for (const [name, endpoint] of Object.entries(scenarios)) {
    for (let warmup = 0; warmup < 5; warmup += 1) await timedFetch(baseUrl + endpoint);
    const samples = [];
    let bytes = 0;
    for (let run = 0; run < 40; run += 1) {
      const result = await timedFetch(baseUrl + endpoint);
      if (result.status !== 200) throw new Error(`${endpoint} returned ${result.status}`);
      samples.push(result.ms);
      bytes = result.bytes;
    }
    measurements[name] = { ...stats(samples), responseBytes: bytes };
  }

  const burstStarted = performance.now();
  const burst = await Promise.all(
    Array.from({ length: 20 }, () => timedFetch(`${baseUrl}/api/search?q=model`))
  );
  const results = {
    createdAt: new Date().toISOString(),
    dataDir,
    paperCount: papers.length,
    coldStart: stats(coldStarts),
    endpoints: measurements,
    twentySearchBurst: {
      wallMs: Number((performance.now() - burstStarted).toFixed(2)),
      individual: stats(burst.map((result) => result.ms)),
    },
  };
  await fs.writeJson(outputPath, results, { spaces: 2 });
  console.log(JSON.stringify(results, null, 2));
} catch (error) {
  throw new Error(`${error.message}\n${getStderr()}`);
} finally {
  await stopServer(child);
}
