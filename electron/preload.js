const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  apiUrl: `http://127.0.0.1:${process.env.READXIV_SERVER_PORT || '7474'}`,
  isElectron: true,
  openExternal: (url) => ipcRenderer.send('open-external-browser', url),
  showNotification: (title, body, data = {}) => ipcRenderer.send('notification-show', { title, body, data }),
  windowControls: {
    minimize: () => ipcRenderer.send('window-minimize'),
    toggleMaximize: () => ipcRenderer.send('window-toggle-maximize'),
    close: () => ipcRenderer.send('window-close'),
  },
  onNotificationActivated: (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on('notification-activated', handler);
    return () => ipcRenderer.removeListener('notification-activated', handler);
  },
  onOpenExternalTab: (callback) => {
    const handler = (_, url) => callback(url);
    ipcRenderer.on('open-external-tab', handler);
    return () => ipcRenderer.removeListener('open-external-tab', handler);
  },
});
