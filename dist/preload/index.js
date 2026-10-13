"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('recorder', {
    getSources: () => electron_1.ipcRenderer.invoke('recorder:get-sources'),
    start: (config) => electron_1.ipcRenderer.invoke('recorder:start', config),
    startArea: (config) => electron_1.ipcRenderer.invoke('recorder:start-area', config),
    stop: () => electron_1.ipcRenderer.invoke('recorder:stop'),
    getState: () => electron_1.ipcRenderer.invoke('recorder:get-state'),
    setEffects: (config) => electron_1.ipcRenderer.invoke('recorder:set-effects', config),
    getEffects: () => electron_1.ipcRenderer.invoke('effects:get'),
    onEffectsChanged: (cb) => {
        electron_1.ipcRenderer.on('effects:changed', (_event, config) => cb(config));
    },
    onStateChange: (cb) => {
        electron_1.ipcRenderer.on('recorder:state-changed', (_event, state) => cb(state));
    },
    onTimer: (cb) => {
        electron_1.ipcRenderer.on('recorder:timer', (_event, seconds) => cb(seconds));
    },
    onGlobalShortcut: (cb) => {
        electron_1.ipcRenderer.on('global-shortcut', (_event, action) => cb(action));
    },
    onFinished: (cb) => {
        electron_1.ipcRenderer.on('recorder:finished', (_event, result) => cb(result));
    },
    openOutputFolder: () => electron_1.ipcRenderer.invoke('recorder:open-output'),
    getSettings: () => electron_1.ipcRenderer.invoke('settings:get'),
    setSettings: (settings) => electron_1.ipcRenderer.invoke('settings:set', settings),
    selectOutputFolder: (kind) => electron_1.ipcRenderer.invoke('dialog:select-folder', kind),
    getFolders: () => electron_1.ipcRenderer.invoke('folders:get'),
    openFolder: (kind) => electron_1.ipcRenderer.invoke('folders:open', kind),
});
