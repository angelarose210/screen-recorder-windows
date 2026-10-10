"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('snip', {
    onImage: (cb) => {
        electron_1.ipcRenderer.on('snip:image', (_event, url, hint) => cb(url, hint));
    },
    done: (rect) => electron_1.ipcRenderer.send('snip:done', rect),
    cancel: () => electron_1.ipcRenderer.send('snip:cancel'),
});
