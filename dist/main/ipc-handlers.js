"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.openCapture = openCapture;
exports.registerIpcHandlers = registerIpcHandlers;
const electron_1 = require("electron");
const recorder_1 = require("./recorder");
const config_1 = require("./config");
const record_bar_1 = require("./record-bar");
const snip_1 = require("./snip");
const recorder = new recorder_1.Recorder();
// One capture overlay for every entry point (tray, hotkeys, jump list, main window)
let captureImpl = null;
let lastMode = 'screenshot';
// mode omitted = whichever mode was used last
function openCapture(mode) {
    if (!captureImpl)
        return Promise.resolve(false);
    return captureImpl(mode ?? lastMode).catch((err) => {
        console.error('Capture failed:', err);
        return false;
    });
}
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
        audioPrefs = { audioMic: !!config?.audioMic, audioSystem: !!config?.audioSystem };
        restoreMainWindow = mainWindow.isVisible() && !mainWindow.isMinimized();
        await startRecording(config);
    });
    // Drag a box (same picker as screenshots), then record just that box
    // Mic/system audio picks from the main window, reused when recording from the tray
    const initial = (0, config_1.getSettings)();
    recorder.setEffectsConfig((0, config_1.loadEffects)());
    let audioPrefs = { audioMic: initial.audioMicDefault, audioSystem: initial.audioSystemDefault };
    captureImpl = async (initialMode, config) => {
        const idle = recorder.getState() === 'idle';
        const wasVisible = mainWindow.isVisible() && !mainWindow.isMinimized();
        const picked = await (0, snip_1.pickRegion)({ mode: initialMode, allowVideo: idle, fx: (0, config_1.overlayEffects)((0, config_1.loadEffects)()) }, mainWindow);
        if (!picked) {
            if (wasVisible)
                mainWindow.show();
            return false;
        }
        lastMode = picked.mode;
        if (picked.mode === 'screenshot') {
            (0, snip_1.saveImage)(picked.rect ? picked.image.crop(picked.rect) : picked.image);
            if (wasVisible)
                mainWindow.showInactive();
            return false;
        }
        // Effect chips in the overlay update the saved settings (and the main window's checkboxes)
        if (picked.fx) {
            const effects = (0, config_1.withOverlayEffects)((0, config_1.loadEffects)(), picked.fx);
            (0, config_1.saveEffects)(effects);
            recorder.setEffectsConfig(effects);
            mainWindow.webContents.send('effects:changed', effects);
        }
        // Match Electron's display to the native monitor source by its physical top-left corner
        const corner = electron_1.screen.dipToScreenPoint({ x: picked.display.bounds.x, y: picked.display.bounds.y });
        const monitors = recorder.getSources().filter((s) => s.type === 'monitor');
        const monitor = monitors.find((s) => Math.abs(s.x - corner.x) <= 2 && Math.abs(s.y - corner.y) <= 2) ?? monitors[0];
        if (!monitor)
            throw new Error('No monitor found');
        restoreMainWindow = wasVisible;
        const tooSmall = !!picked.rect && (picked.rect.width < 16 || picked.rect.height < 16);
        const region = tooSmall ? undefined : picked.rect ?? undefined;
        await startRecording({
            fps: 30,
            ...audioPrefs,
            ...config,
            sourceId: monitor.id,
            region,
        });
        if (region && recorder.getState() !== 'idle') {
            // region is physical px relative to the display; the outline window wants DIP screen coords
            const { bounds, scaleFactor: sf } = picked.display;
            (0, record_bar_1.showRegionOutline)({
                x: bounds.x + region.x / sf,
                y: bounds.y + region.y / sf,
                width: region.width / sf,
                height: region.height / sf,
            });
        }
        return true;
    };
    electron_1.ipcMain.handle('recorder:start-area', async (_event, config) => {
        if (recorder.getState() !== 'idle')
            return false;
        audioPrefs = { audioMic: !!config?.audioMic, audioSystem: !!config?.audioSystem };
        return captureImpl('video', config);
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
        (0, config_1.saveEffects)(config);
        recorder.setEffectsConfig(config);
    });
    electron_1.ipcMain.handle('effects:get', () => (0, config_1.loadEffects)());
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
