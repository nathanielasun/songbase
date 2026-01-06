const { app, BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

let mainWindow;
let backendProcess;
const BACKEND_PORT = 8000;

function _candidateExists(candidate) {
  if (!candidate) {
    return false;
  }
  const binary = process.platform === 'win32' ? 'pg_ctl.exe' : 'pg_ctl';
  return fs.existsSync(path.join(candidate, 'bin', binary));
}

function buildBackendEnv() {
  const env = { ...process.env };
  const userData = app.getPath('userData');
  const metadataRoot = path.join(userData, '.metadata');
  env.SONGBASE_METADATA_DIR = env.SONGBASE_METADATA_DIR || metadataRoot;

  const candidates = [
    path.join(process.resourcesPath, 'postgres'),
    path.join(process.resourcesPath, 'backend', 'postgres'),
    path.join(process.resourcesPath, 'postgres_bundle'),
  ];

  const bundled = candidates.find(_candidateExists);
  if (bundled) {
    env.POSTGRES_BIN_DIR = env.POSTGRES_BIN_DIR || path.join(bundled, 'bin');
  } else {
    env.POSTGRES_BUNDLE_DIR =
      env.POSTGRES_BUNDLE_DIR || path.join(metadataRoot, 'postgres_bundle');
  }

  return env;
}

function getBackendBinaryPath() {
  const platform = process.platform;
  const isDev = !app.isPackaged;

  if (isDev) {
    return null;
  }

  const resourcesPath = process.resourcesPath;
  let binaryName = 'songbase-api';

  if (platform === 'win32') {
    binaryName += '.exe';
  }

  return path.join(resourcesPath, 'backend', binaryName);
}

function startBackend() {
  const isDev = !app.isPackaged;

  if (isDev) {
    console.log('Development mode: Start backend manually with `uvicorn backend.api.app:app --reload --port 8000`');
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const binaryPath = getBackendBinaryPath();

    if (!fs.existsSync(binaryPath)) {
      reject(new Error(`Backend binary not found at: ${binaryPath}`));
      return;
    }

    console.log('Starting backend:', binaryPath);

    backendProcess = spawn(binaryPath, ['--port', BACKEND_PORT.toString()], {
      stdio: 'inherit',
      env: buildBackendEnv()
    });

    backendProcess.on('error', (error) => {
      console.error('Failed to start backend:', error);
      reject(error);
    });

    backendProcess.on('exit', (code) => {
      console.log(`Backend process exited with code ${code}`);
    });

    setTimeout(resolve, 2000);
  });
}

function stopBackend() {
  if (backendProcess) {
    console.log('Stopping backend...');
    backendProcess.kill();
    backendProcess = null;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    icon: path.join(__dirname, '../frontend/public/icon.png'),
  });

  const isDev = !app.isPackaged;

  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    const indexPath = path.join(__dirname, '../frontend/out/index.html');
    mainWindow.loadFile(indexPath);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  try {
    await startBackend();
    createWindow();
  } catch (error) {
    console.error('Failed to start application:', error);
    app.quit();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  stopBackend();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopBackend();
});

app.on('will-quit', () => {
  stopBackend();
});
