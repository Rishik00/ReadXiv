const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  apiUrl: 'http://127.0.0.1:7474',
  isElectron: true,
  showNotification: (title, body, data = {}) => ipcRenderer.send('notification-show', { title, body, data }),
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
