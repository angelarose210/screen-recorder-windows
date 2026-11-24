"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('trimmer', {
    getInfo: () => electron_1.ipcRenderer.invoke('trim:get-info'),
    exportClip: (opts) => electron_1.ipcRenderer.invoke('trim:export', opts),
    showInFolder: (filePath) => electron_1.ipcRenderer.invoke('trim:show-in-folder', filePath),
    onProgress: (cb) => {
        electron_1.ipcRenderer.on('trim:progress', (_event, fraction) => cb(fraction));
    },
});
