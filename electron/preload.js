const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  apiUrl: 'http://127.0.0.1:7474',
  isElectron: true,
  showNotification: (title, body) => ipcRenderer.send('notification-show', { title, body }),
});
