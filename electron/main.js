const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let serverProcess = null;
let mainWindow = null;

const SERVER_PORT = 7474;
const isDev = process.env.NODE_ENV !== 'production' || process.env.ELECTRON_DEV;

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
    if (code !== null && code !== 0) console.error('Server exited with code', code);
  });
}

function waitForServer(maxAttempts = 30) {
  return new Promise((resolve, reject) => {
    const http = require('http');
    let attempts = 0;
    const tryConnect = () => {
      const req = http.get(`http://127.0.0.1:${SERVER_PORT}/health`, (res) => {
        if (res.statusCode === 200) return resolve();
        if (++attempts < maxAttempts) setTimeout(tryConnect, 200);
        else reject(new Error('Server failed to become ready'));
      });
      req.on('error', () => {
        if (++attempts < maxAttempts) setTimeout(tryConnect, 200);
        else reject(new Error('Server failed to become ready'));
      });
    };
    tryConnect();
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'ReadXiv',
    icon: path.join(__dirname, '..', 'client', 'public', 'readxiv-logo-icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'client', 'dist', 'index.html'));
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    mainWindow.webContents.send('open-external-tab', url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(async () => {
  startServer();
  await waitForServer();
  createWindow();
});

app.on('window-all-closed', () => {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
  app.quit();
});
