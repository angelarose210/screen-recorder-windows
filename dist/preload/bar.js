"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('bar', {
    onState: (cb) => {
        electron_1.ipcRenderer.on('bar:state', (_event, state) => cb(state));
    },
    onTimer: (cb) => {
        electron_1.ipcRenderer.on('bar:timer', (_event, seconds) => cb(seconds));
    },
    stop: () => electron_1.ipcRenderer.send('bar:stop'),
});
