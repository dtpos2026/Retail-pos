'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// The renderer can only call named API methods; the main process validates
// permissions for every call.
contextBridge.exposeInMainWorld('pos', {
  invoke: (method, args) => ipcRenderer.invoke('api', method, args),
  // Main-process pushes (e.g. the license was blocked / renewed while the app is open).
  on: (channel, cb) => {
    if (!['license'].includes(channel)) return () => {};
    const fn = (_e, data) => cb(data);
    ipcRenderer.on(channel, fn);
    return () => ipcRenderer.removeListener(channel, fn);
  },
});
