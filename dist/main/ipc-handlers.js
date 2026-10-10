"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerIpcHandlers = registerIpcHandlers;
const electron_1 = require("electron");
const recorder_1 = require("./recorder");
const config_1 = require("./config");
const record_bar_1 = require("./record-bar");
const snip_1 = require("./snip");
const recorder = new recorder_1.Recorder();
function registerIpcHandlers(mainWindow) {
    let restoreMainWindow = false;
    recorder.on('state-changed', (state) => {
        mainWindow.webContents.send('recorder:state-changed', state);
        (0, record_bar_1.updateRecordBar)('state', state);
    });
    recorder.on('timer', (seconds) => {
        mainWindow.webContents.send('recorder:timer', seconds);
        (0, record_bar_1.updateRecordBar)('timer', seconds);
    });
    // Stop from any entry point (main window, floating bar, hotkey); result goes to the renderer
    const stopRecording = async () => {
        if (recorder.getState() !== 'recording')
            return null;
        try {
            const result = await recorder.stop();
            mainWindow.webContents.send('recorder:finished', result);
            return result;
        }
        finally {
            (0, record_bar_1.closeRecordBar)();
            if (restoreMainWindow) {
                mainWindow.showInactive();
                restoreMainWindow = false;
            }
        }
    };
    electron_1.ipcMain.handle('recorder:get-sources', () => {
        return recorder.getSources();
    });
    electron_1.ipcMain.handle('recorder:start', async (_event, config) => {
        restoreMainWindow = mainWindow.isVisible() && !mainWindow.isMinimized();
        await startRecording(config);
    });
    // Drag a box (same picker as screenshots), then record just that box
    electron_1.ipcMain.handle('recorder:start-area', async (_event, config) => {
        if (recorder.getState() !== 'idle')
            return false;
        restoreMainWindow = mainWindow.isVisible() && !mainWindow.isMinimized();
        const picked = await (0, snip_1.pickRegion)('Drag the area to record &middot; click for full screen &middot; Esc to cancel', mainWindow);
        if (!picked) {
            if (restoreMainWindow)
                mainWindow.show();
            restoreMainWindow = false;
            return false;
        }
        // Match Electron's display to the native monitor source by its physical top-left corner
        const corner = electron_1.screen.dipToScreenPoint({ x: picked.display.bounds.x, y: picked.display.bounds.y });
        const monitors = recorder.getSources().filter((s) => s.type === 'monitor');
        const monitor = monitors.find((s) => Math.abs(s.x - corner.x) <= 2 && Math.abs(s.y - corner.y) <= 2) ?? monitors[0];
        if (!monitor)
            throw new Error('No monitor found');
        const tooSmall = !!picked.rect && (picked.rect.width < 16 || picked.rect.height < 16);
        await startRecording({ ...config, sourceId: monitor.id, region: tooSmall ? undefined : picked.rect ?? undefined });
        return true;
    });
    // Get the full window out of the way; the floating bar (hidden from capture) takes over
    const startRecording = async (config) => {
        const settings = (0, config_1.getSettings)();
        mainWindow.hide();
        (0, record_bar_1.showRecordBar)(() => { stopRecording(); });
        await new Promise((r) => setTimeout(r, 250)); // let the hide finish before frames flow
        try {
            await recorder.start({
                ...config,
                fps: config.fps || settings.fps,
                outputDir: (0, config_1.getVideosDir)(),
            });
        }
        catch (err) {
            (0, record_bar_1.closeRecordBar)();
            if (restoreMainWindow)
                mainWindow.show();
            restoreMainWindow = false;
            throw err;
        }
    };
    electron_1.ipcMain.handle('recorder:stop', async () => {
        return await stopRecording();
    });
    electron_1.ipcMain.handle('recorder:get-state', () => {
        return recorder.getState();
    });
    electron_1.ipcMain.handle('recorder:set-effects', (_event, config) => {
        recorder.setEffectsConfig(config);
    });
    electron_1.ipcMain.handle('recorder:open-output', async () => {
        await electron_1.shell.openPath((0, config_1.getVideosDir)());
    });
    electron_1.ipcMain.handle('folders:get', () => ({
        videos: (0, config_1.getVideosDir)(),
        screenshots: (0, config_1.getScreenshotsDir)(),
    }));
    electron_1.ipcMain.handle('folders:open', async (_event, kind) => {
        await electron_1.shell.openPath(kind === 'videos' ? (0, config_1.getVideosDir)() : (0, config_1.getScreenshotsDir)());
    });
    electron_1.ipcMain.handle('settings:get', () => {
        return (0, config_1.getSettings)();
    });
    electron_1.ipcMain.handle('settings:set', (_event, partial) => {
        (0, config_1.setSettings)(partial);
    });
    electron_1.ipcMain.handle('dialog:select-folder', async (_event, kind = 'videos') => {
        const result = await electron_1.dialog.showOpenDialog(mainWindow, {
            title: kind === 'videos' ? 'Save recordings to' : 'Save screenshots to',
            defaultPath: kind === 'videos' ? (0, config_1.getVideosDir)() : (0, config_1.getScreenshotsDir)(),
            properties: ['openDirectory', 'createDirectory'],
        });
        if (result.canceled || result.filePaths.length === 0)
            return null;
        const dir = result.filePaths[0];
        (0, config_1.setSettings)(kind === 'videos' ? { outputDir: dir } : { screenshotDir: dir });
        return dir;
    });
}
