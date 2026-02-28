const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  apiUrl: 'http://127.0.0.1:7474',
  isElectron: true,
});
