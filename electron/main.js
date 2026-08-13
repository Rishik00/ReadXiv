const { app, BrowserWindow, dialog, ipcMain, Notification, screen, shell } = require('electron');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

let serverProcess = null;
let mainWindow = null;
let windowStateSaveTimer = null;
let serverExited = false;

if (process.env.READXIV_USER_DATA_DIR) {
  app.setPath('userData', path.resolve(process.env.READXIV_USER_DATA_DIR));
}

const SERVER_PORT = Number.parseInt(process.env.READXIV_SERVER_PORT || '7474', 10);
const DEV_CLIENT_URL = process.env.READXIV_CLIENT_URL || 'http://localhost:5173';
const useBuiltClient = process.env.READXIV_USE_BUILT_CLIENT === '1';
const isDev = !app.isPackaged;
const shouldOpenDevTools = process.env.READXIV_DEVTOOLS === '1';
const DEFAULT_WINDOW_BOUNDS = { width: 1280, height: 800 };

function windowStatePath() {
  return path.join(app.getPath('userData'), 'window-state.json');
}

function readWindowState() {
  try {
    const state = JSON.parse(fs.readFileSync(windowStatePath(), 'utf8'));
    return state && typeof state === 'object' ? state : {};
  } catch {
    return {};
  }
}

function boundsOverlapDisplay(bounds) {
  return screen.getAllDisplays().some(({ workArea }) => {
    const overlapWidth = Math.min(bounds.x + bounds.width, workArea.x + workArea.width)
      - Math.max(bounds.x, workArea.x);
    const overlapHeight = Math.min(bounds.y + bounds.height, workArea.y + workArea.height)
      - Math.max(bounds.y, workArea.y);
    return overlapWidth >= 80 && overlapHeight >= 80;
  });
}

function restoredWindowOptions(state) {
  const bounds = state?.bounds;
  if (!bounds || !['x', 'y', 'width', 'height'].every((key) => Number.isFinite(bounds[key]))) {
    return DEFAULT_WINDOW_BOUNDS;
  }
  const candidate = {
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: Math.max(800, Math.round(bounds.width)),
    height: Math.max(600, Math.round(bounds.height)),
  };
  return boundsOverlapDisplay(candidate) ? candidate : DEFAULT_WINDOW_BOUNDS;
}

function saveWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const maximized = mainWindow.isMaximized();
  const bounds = maximized ? mainWindow.getNormalBounds() : mainWindow.getBounds();
  try {
    fs.mkdirSync(path.dirname(windowStatePath()), { recursive: true });
    fs.writeFileSync(windowStatePath(), JSON.stringify({ bounds, maximized }, null, 2));
  } catch (error) {
    console.warn('Could not save window state:', error.message);
  }
}

function scheduleWindowStateSave() {
  clearTimeout(windowStateSaveTimer);
  windowStateSaveTimer = setTimeout(saveWindowState, 250);
}

function startServer() {
  const appRoot = app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked')
    : path.join(__dirname, '..');
  const serverPath = path.join(appRoot, 'server', 'index.js');
  serverProcess = spawn('node', [serverPath], {
    cwd: path.join(appRoot, 'server'),
    env: { ...process.env, PORT: String(SERVER_PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  serverProcess.stdout?.on('data', (d) => process.stdout.write(d.toString()));
  serverProcess.stderr?.on('data', (d) => process.stderr.write(d.toString()));
  serverProcess.on('error', (err) => console.error('Server spawn error:', err));
  serverProcess.on('exit', (code) => {
    serverExited = true;
    if (code !== null && code !== 0) console.error('Server exited with code', code);
  });
}

function waitForServer(timeoutMs = 10000) {
  const startedAt = Date.now();
  return new Promise((resolve) => {
    const check = () => {
      const request = http.get(
        `http://127.0.0.1:${SERVER_PORT}/health`,
        { timeout: 500 },
        (response) => {
          response.resume();
          if (response.statusCode === 200) {
            resolve(true);
            return;
          }
          retry();
        }
      );
      request.on('timeout', () => request.destroy());
      request.on('error', retry);
    };
    const retry = () => {
      if (serverExited || Date.now() - startedAt >= timeoutMs) {
        resolve(false);
        return;
      }
      setTimeout(check, 75);
    };
    check();
  });
}

function createWindow() {
  const savedWindowState = readWindowState();
  mainWindow = new BrowserWindow({
    show: false,
    backgroundColor: '#0A0A0A',
    ...restoredWindowOptions(savedWindowState),
    minWidth: 800,
    minHeight: 600,
    title: 'ReadXiv',
    icon: path.join(__dirname, '..', 'client', 'public', 'readxiv-logo-icon.png'),
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.setMenuBarVisibility(false);
  if (savedWindowState.maximized) mainWindow.maximize();
  mainWindow.on('move', scheduleWindowStateSave);
  mainWindow.on('resize', scheduleWindowStateSave);

  if (isDev && !useBuiltClient) {
    mainWindow.loadURL(DEV_CLIENT_URL);
    if (shouldOpenDevTools) mainWindow.webContents.openDevTools();
  } else if (isDev) {
    const builtClientUrl = `http://127.0.0.1:${SERVER_PORT}`;
    const retryBuiltClient = (_event, errorCode, _description, _url, isMainFrame) => {
      if (!isMainFrame || ![-102, -105, -106].includes(errorCode)) return;
      setTimeout(() => mainWindow?.loadURL(builtClientUrl), 50);
    };
    mainWindow.webContents.on('did-fail-load', retryBuiltClient);
    mainWindow.loadURL(builtClientUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'client', 'dist', 'index.html'));
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    mainWindow.webContents.send('open-external-tab', url);
    return { action: 'deny' };
  });

  ipcMain.on('open-external-browser', (_event, url) => {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) shell.openExternal(url);
  });

  mainWindow.on('close', () => {
    clearTimeout(windowStateSaveTimer);
    saveWindowState();
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}

ipcMain.on('notification-show', (_, { title, body, data }) => {
  if (Notification.isSupported()) {
    const notification = new Notification({ title, body });
    notification.on('click', () => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
      mainWindow.webContents.send('notification-activated', data || {});
    });
    notification.show();
  }
});

ipcMain.on('window-minimize', () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.minimize();
});

ipcMain.on('window-toggle-maximize', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});

ipcMain.on('window-close', () => {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close();
});

app.whenReady().then(async () => {
  startServer();
  const serverReady = await waitForServer();
  if (!serverReady) {
    dialog.showErrorBox(
      'ReadXiv could not start',
      'The local server exited before it became ready. Check the terminal output for the underlying error.'
    );
    app.quit();
    return;
  }
  createWindow();
});

app.on('window-all-closed', () => {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
  app.quit();
});
