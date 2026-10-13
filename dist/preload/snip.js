"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('snip', {
    onImage: (cb) => {
        electron_1.ipcRenderer.on('snip:image', (_event, url, opts) => cb(url, opts));
    },
    done: (rect, mode, fx) => electron_1.ipcRenderer.send('snip:done', rect, mode, fx),
    cancel: () => electron_1.ipcRenderer.send('snip:cancel'),
});
