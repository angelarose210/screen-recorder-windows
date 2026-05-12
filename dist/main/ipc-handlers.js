"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerIpcHandlers = registerIpcHandlers;
const electron_1 = require("electron");
const recorder_1 = require("./recorder");
const config_1 = require("./config");
const session_1 = require("./session");
const recorder = new recorder_1.Recorder();
function registerIpcHandlers(mainWindow) {
    recorder.on('state-changed', (state) => {
        mainWindow.webContents.send('recorder:state-changed', state);
    });
    recorder.on('timer', (seconds) => {
        mainWindow.webContents.send('recorder:timer', seconds);
    });
    electron_1.ipcMain.handle('recorder:get-sources', () => {
        return recorder.getSources();
    });
    electron_1.ipcMain.handle('recorder:start', async (_event, config) => {
        const settings = (0, config_1.getSettings)();
        await recorder.start({
            ...config,
            fps: config.fps || settings.fps,
            outputDir: settings.outputDir || (0, session_1.getOutputDir)(),
        });
    });
    electron_1.ipcMain.handle('recorder:stop', async () => {
        return await recorder.stop();
    });
    electron_1.ipcMain.handle('recorder:get-state', () => {
        return recorder.getState();
    });
    electron_1.ipcMain.handle('recorder:set-effects', (_event, config) => {
        recorder.setEffectsConfig(config);
    });
    electron_1.ipcMain.handle('recorder:open-output', async () => {
        const settings = (0, config_1.getSettings)();
        const dir = settings.outputDir || (0, session_1.getOutputDir)();
        await electron_1.shell.openPath(dir);
    });
    electron_1.ipcMain.handle('settings:get', () => {
        return (0, config_1.getSettings)();
    });
    electron_1.ipcMain.handle('settings:set', (_event, partial) => {
        (0, config_1.setSettings)(partial);
    });
    electron_1.ipcMain.handle('dialog:select-folder', async () => {
        const result = await electron_1.dialog.showOpenDialog(mainWindow, {
            properties: ['openDirectory'],
        });
        if (result.canceled || result.filePaths.length === 0)
            return null;
        const dir = result.filePaths[0];
        (0, config_1.setSettings)({ outputDir: dir });
        return dir;
    });
}
