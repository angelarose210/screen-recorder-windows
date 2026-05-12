"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('recorder', {
    getSources: () => electron_1.ipcRenderer.invoke('recorder:get-sources'),
    start: (config) => electron_1.ipcRenderer.invoke('recorder:start', config),
    stop: () => electron_1.ipcRenderer.invoke('recorder:stop'),
    getState: () => electron_1.ipcRenderer.invoke('recorder:get-state'),
    setEffects: (config) => electron_1.ipcRenderer.invoke('recorder:set-effects', config),
    onStateChange: (cb) => {
        electron_1.ipcRenderer.on('recorder:state-changed', (_event, state) => cb(state));
    },
    onTimer: (cb) => {
        electron_1.ipcRenderer.on('recorder:timer', (_event, seconds) => cb(seconds));
    },
    onGlobalShortcut: (cb) => {
        electron_1.ipcRenderer.on('global-shortcut', (_event, action) => cb(action));
    },
    openOutputFolder: () => electron_1.ipcRenderer.invoke('recorder:open-output'),
    getSettings: () => electron_1.ipcRenderer.invoke('settings:get'),
    setSettings: (settings) => electron_1.ipcRenderer.invoke('settings:set', settings),
    selectOutputFolder: () => electron_1.ipcRenderer.invoke('dialog:select-folder'),
});
