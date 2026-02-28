const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  apiUrl: 'http://127.0.0.1:7474',
  isElectron: true,
  onOpenExternalTab: (callback) => {
    ipcRenderer.on('open-external-tab', (_, url) => callback(url));
  },
});
