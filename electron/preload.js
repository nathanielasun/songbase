const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  platform: process.platform,
  apiUrl: 'http://localhost:8000',

  // Auto-update API
  updates: {
    // Check for updates manually
    checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
    // Download available update
    downloadUpdate: () => ipcRenderer.invoke('download-update'),
    // Install downloaded update (will restart app)
    installUpdate: () => ipcRenderer.invoke('install-update'),
    // Get current app version
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    // Listen for update status changes
    onUpdateStatus: (callback) => {
      const handler = (_event, data) => callback(data);
      ipcRenderer.on('update-status', handler);
      // Return cleanup function
      return () => ipcRenderer.removeListener('update-status', handler);
    },
  },
});
