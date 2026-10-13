"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUpdateState = getUpdateState;
exports.installUpdateNow = installUpdateNow;
exports.checkForUpdates = checkForUpdates;
exports.setupUpdates = setupUpdates;
const electron_1 = require("electron");
const electron_updater_1 = require("electron-updater");
let state = { status: 'idle' };
let onChange = () => { };
let manualCheck = false;
function set(next) {
    state = next;
    onChange(state);
}
function notify(title, body, onClick) {
    if (!electron_1.Notification.isSupported())
        return;
    const n = new electron_1.Notification({ title, body, silent: true });
    if (onClick)
        n.on('click', onClick);
    n.show();
}
function getUpdateState() {
    return state;
}
function installUpdateNow() {
    if (state.status === 'ready')
        electron_updater_1.autoUpdater.quitAndInstall(true, true);
}
function checkForUpdates(manual = false) {
    if (!electron_1.app.isPackaged) {
        if (manual)
            notify('Updates', 'Updates only work in the installed app.');
        return;
    }
    if (state.status === 'checking' || state.status === 'downloading' || state.status === 'ready') {
        if (manual && state.status === 'ready')
            installUpdateNow();
        return;
    }
    manualCheck = manual;
    set({ status: 'checking' });
    electron_updater_1.autoUpdater.checkForUpdates().catch((err) => {
        console.error('Update check failed:', err);
        set({ status: 'error' });
        if (manualCheck)
            notify('Update check failed', String(err?.message ?? err).slice(0, 200));
    });
}
function setupUpdates(listener) {
    onChange = listener;
    if (!electron_1.app.isPackaged)
        return;
    electron_updater_1.autoUpdater.autoDownload = true;
    electron_updater_1.autoUpdater.autoInstallOnAppQuit = true;
    electron_updater_1.autoUpdater.on('update-available', (info) => set({ status: 'downloading', version: info.version }));
    electron_updater_1.autoUpdater.on('update-not-available', () => {
        set({ status: 'none' });
        if (manualCheck)
            notify('Screen Recorder is up to date', `You have version ${electron_1.app.getVersion()}.`);
    });
    electron_updater_1.autoUpdater.on('update-downloaded', (info) => {
        set({ status: 'ready', version: info.version });
        notify(`Update ready: v${info.version}`, 'Click to restart and update now, or it installs next time you quit.', installUpdateNow);
    });
    electron_updater_1.autoUpdater.on('error', (err) => {
        console.error('Updater error:', err);
        set({ status: 'error' });
    });
    // Shortly after launch, then every 6 hours (the app lives in the tray for days)
    setTimeout(() => checkForUpdates(), 10_000);
    setInterval(() => checkForUpdates(), 6 * 60 * 60 * 1000);
}
