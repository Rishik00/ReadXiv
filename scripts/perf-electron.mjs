import fs from 'fs-extra';
import path from 'path';
import { performance } from 'perf_hooks';
import { fileURLToPath } from 'url';
import { _electron as electron } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, '.perf', 'data');
const outputPath = path.join(root, '.perf', 'electron-results.json');
const userDataDir = path.join(root, '.perf', 'electron-user-data');
const serverPort = 17574;

let electronApp;
let activeWindow;
try {
  await fs.emptyDir(userDataDir);
  const launchStarted = performance.now();
  electronApp = await electron.launch({
    args: [path.join(root, 'electron', 'main.js')],
    cwd: root,
    env: {
      ...process.env,
      READXIV_DATA_DIR: dataDir,
      READXIV_USER_DATA_DIR: userDataDir,
      READXIV_SERVER_PORT: String(serverPort),
      READXIV_USE_BUILT_CLIENT: '1',
    },
  });

  const window = await electronApp.firstWindow();
  activeWindow = window;
  const firstWindowMs = performance.now() - launchStarted;
  const errors = [];
  window.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  window.on('pageerror', (error) => errors.push(error.message));
  await window.waitForLoadState('domcontentloaded');

  const homeInput = window.getByPlaceholder('Type / for commands...');
  const initialLibraryInput = window.getByPlaceholder('Your Library...');
  await homeInput.or(initialLibraryInput).first().waitFor({ state: 'visible' });
  const homeUsableMs = performance.now() - launchStarted;
  const startupRoute = new URL(window.url()).pathname;
  const chord = async (key) => {
    await window.evaluate(() => document.activeElement?.blur());
    await window.keyboard.press('Space');
    await window.keyboard.press(key);
  };

  if (await initialLibraryInput.isVisible()) {
    await chord('h');
    await homeInput.waitFor({ state: 'visible' });
  }

  const navSamples = [];
  for (let run = 0; run < 8; run += 1) {
    const started = performance.now();
    await chord('l');
    const libraryInput = window.getByPlaceholder('Your Library...');
    await libraryInput.waitFor({ state: 'visible' });
    navSamples.push(performance.now() - started);

    await chord('h');
    await homeInput.waitFor({ state: 'visible' });
  }

  await chord('l');
  const libraryInput = window.getByPlaceholder('Your Library...');
  await libraryInput.waitFor({ state: 'visible' });

  const searchSamples = [];
  for (const query of ['model', 'diffusion', 'reasoning', 'mesh', 'learning']) {
    if ((await libraryInput.inputValue()) !== '') {
      const clearResponsePromise = window.waitForResponse(
        (response) =>
          response.url().includes('/api/papers') &&
          new URL(response.url()).searchParams.get('q') === ''
      );
      await libraryInput.fill('');
      await clearResponsePromise;
    }
    const responsePromise = window.waitForResponse(
      (response) =>
        response.url().includes('/api/papers') &&
        new URL(response.url()).searchParams.get('q') === query
    );
    const started = performance.now();
    await libraryInput.fill(query);
    await responsePromise;
    await window.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    );
    searchSamples.push(performance.now() - started);
  }

  const memory = await electronApp.evaluate(({ app }) =>
    app.getAppMetrics().map((metric) => ({
      type: metric.type,
      cpuPercent: metric.cpu.percentCPUUsage,
      workingSetKb: metric.memory.workingSetSize,
      peakWorkingSetKb: metric.memory.peakWorkingSetSize,
    }))
  );

  const summarize = (samples) => {
    const sorted = [...samples].sort((a, b) => a - b);
    return {
      runs: sorted.length,
      medianMs: Number(sorted[Math.floor(sorted.length / 2)].toFixed(2)),
      minMs: Number(sorted[0].toFixed(2)),
      maxMs: Number(sorted.at(-1).toFixed(2)),
      samplesMs: samples.map((sample) => Number(sample.toFixed(2))),
    };
  };

  const results = {
    createdAt: new Date().toISOString(),
    firstWindowMs: Number(firstWindowMs.toFixed(2)),
    homeUsableMs: Number(homeUsableMs.toFixed(2)),
    startupRoute,
    navigation: summarize(navSamples),
    searchIncludingDebounce: summarize(searchSamples),
    processMetrics: memory,
    rendererErrors: errors,
  };
  await fs.writeJson(outputPath, results, { spaces: 2 });
  console.log(JSON.stringify(results, null, 2));
} catch (error) {
  if (activeWindow) {
    const diagnostics = {
      url: activeWindow.url(),
      title: await activeWindow.title().catch(() => ''),
      body: await activeWindow.locator('body').innerText().catch(() => ''),
    };
    await fs.writeJson(path.join(root, '.perf', 'electron-failure.json'), diagnostics, {
      spaces: 2,
    });
    await activeWindow
      .screenshot({ path: path.join(root, '.perf', 'electron-failure.png') })
      .catch(() => {});
  }
  throw error;
} finally {
  if (electronApp) await electronApp.close();
}
