'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// The renderer can only call named API methods; the main process validates
// permissions for every call.
contextBridge.exposeInMainWorld('pos', {
  invoke: (method, args) => ipcRenderer.invoke('api', method, args),
});
