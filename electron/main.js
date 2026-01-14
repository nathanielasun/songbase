const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const log = require('electron-log');

// Auto-updater (only in production)
let autoUpdater = null;
if (app.isPackaged) {
  autoUpdater = require('electron-updater').autoUpdater;
  autoUpdater.logger = log;
  autoUpdater.logger.transports.file.level = 'info';
}

let mainWindow;
let backendProcess;
let frontendProcess;
const BACKEND_PORT = 8000;
const FRONTEND_PORT = 3000;

// =============================================================================
// Auto-Update Functions
// =============================================================================

function setupAutoUpdater() {
  if (!autoUpdater) {
    log.info('Auto-updater disabled in development mode');
    return;
  }

  // Configure auto-updater
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  // Update events
  autoUpdater.on('checking-for-update', () => {
    log.info('Checking for updates...');
    sendUpdateStatus('checking');
  });

  autoUpdater.on('update-available', (info) => {
    log.info('Update available:', info.version);
    sendUpdateStatus('available', info);

    // Prompt user to download
    if (mainWindow) {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Update Available',
        message: `A new version (${info.version}) is available.`,
        detail: 'Would you like to download it now?',
        buttons: ['Download', 'Later'],
        defaultId: 0,
      }).then(({ response }) => {
        if (response === 0) {
          autoUpdater.downloadUpdate();
        }
      });
    }
  });

  autoUpdater.on('update-not-available', (info) => {
    log.info('No updates available');
    sendUpdateStatus('not-available', info);
  });

  autoUpdater.on('download-progress', (progress) => {
    log.info(`Download progress: ${progress.percent.toFixed(1)}%`);
    sendUpdateStatus('downloading', progress);
  });

  autoUpdater.on('update-downloaded', (info) => {
    log.info('Update downloaded:', info.version);
    sendUpdateStatus('downloaded', info);

    // Prompt user to install
    if (mainWindow) {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Update Ready',
        message: `Version ${info.version} has been downloaded.`,
        detail: 'The update will be installed when you restart the application.',
        buttons: ['Restart Now', 'Later'],
        defaultId: 0,
      }).then(({ response }) => {
        if (response === 0) {
          autoUpdater.quitAndInstall(false, true);
        }
      });
    }
  });

  autoUpdater.on('error', (error) => {
    log.error('Auto-updater error:', error);
    sendUpdateStatus('error', { message: error.message });
  });
}

function sendUpdateStatus(status, data = {}) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-status', { status, ...data });
  }
}

function checkForUpdates() {
  if (autoUpdater) {
    autoUpdater.checkForUpdates().catch((err) => {
      log.error('Failed to check for updates:', err);
    });
  }
}

// IPC handlers for update control from renderer
function setupUpdateIPC() {
  ipcMain.handle('check-for-updates', async () => {
    if (autoUpdater) {
      try {
        const result = await autoUpdater.checkForUpdates();
        return { success: true, updateInfo: result?.updateInfo };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }
    return { success: false, error: 'Auto-updater not available' };
  });

  ipcMain.handle('download-update', async () => {
    if (autoUpdater) {
      try {
        await autoUpdater.downloadUpdate();
        return { success: true };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }
    return { success: false, error: 'Auto-updater not available' };
  });

  ipcMain.handle('install-update', () => {
    if (autoUpdater) {
      autoUpdater.quitAndInstall(false, true);
      return { success: true };
    }
    return { success: false, error: 'Auto-updater not available' };
  });

  ipcMain.handle('get-app-version', () => {
    return app.getVersion();
  });
}

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

// =============================================================================
// Frontend Server (Next.js)
// =============================================================================

function getFrontendPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'app', 'frontend');
  }
  return path.join(__dirname, '..', 'frontend');
}

function startFrontend() {
  const isDev = !app.isPackaged;

  if (isDev) {
    log.info('Development mode: Start frontend manually with `npm run dev` in frontend/');
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const frontendPath = getFrontendPath();
    const npxPath = process.platform === 'win32' ? 'npx.cmd' : 'npx';

    log.info('Starting frontend server at:', frontendPath);

    // Start Next.js production server
    frontendProcess = spawn(npxPath, ['next', 'start', '-p', FRONTEND_PORT.toString()], {
      cwd: frontendPath,
      stdio: 'pipe',
      env: {
        ...process.env,
        NODE_ENV: 'production',
      },
    });

    frontendProcess.stdout.on('data', (data) => {
      const output = data.toString();
      log.info('Frontend:', output.trim());
      // Resolve when server is ready
      if (output.includes('Ready') || output.includes('started server')) {
        resolve();
      }
    });

    frontendProcess.stderr.on('data', (data) => {
      log.error('Frontend error:', data.toString().trim());
    });

    frontendProcess.on('error', (error) => {
      log.error('Failed to start frontend:', error);
      reject(error);
    });

    frontendProcess.on('exit', (code) => {
      log.info(`Frontend process exited with code ${code}`);
    });

    // Fallback resolve after timeout
    setTimeout(resolve, 5000);
  });
}

function stopFrontend() {
  if (frontendProcess) {
    log.info('Stopping frontend...');
    frontendProcess.kill();
    frontendProcess = null;
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
    // Load from local Next.js server
    mainWindow.loadURL(`http://localhost:${FRONTEND_PORT}`);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  try {
    // Initialize IPC handlers
    setupUpdateIPC();

    // Start backend API server
    await startBackend();

    // Start frontend server (Next.js) in production
    if (app.isPackaged) {
      await startFrontend();
    }

    createWindow();

    // Setup auto-updater after window is created
    setupAutoUpdater();

    // Check for updates after a short delay (don't block startup)
    setTimeout(() => {
      checkForUpdates();
    }, 5000);
  } catch (error) {
    log.error('Failed to start application:', error);
    app.quit();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  stopFrontend();
  stopBackend();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopFrontend();
  stopBackend();
});

app.on('will-quit', () => {
  stopFrontend();
  stopBackend();
});
