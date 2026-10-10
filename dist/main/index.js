"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const ipc_handlers_1 = require("./ipc-handlers");
const snip_1 = require("./snip");
const session_1 = require("./session");
const isDev = process.argv.includes('--dev');
// Shell APIs (jump list, shortcuts) can't read inside app.asar, so point them at the unpacked copy
const ICON_PATH = path.join(__dirname, '../../resources/icon.ico').replace('app.asar', 'app.asar.unpacked');
let mainWindow = null;
let tray = null;
let quitting = false;
// One instance only: launching again (taskbar icon, jump list) forwards its args here
if (!electron_1.app.requestSingleInstanceLock()) {
    electron_1.app.quit();
}
else {
    electron_1.app.on('second-instance', (_event, argv) => handleArgs(argv, true));
    electron_1.app.whenReady().then(onReady);
}
function handleArgs(argv, fromSecondInstance) {
    if (argv.includes('--snip')) {
        (0, snip_1.startSnip)(mainWindow);
    }
    else if (argv.includes('--record-area')) {
        mainWindow?.webContents.send('global-shortcut', 'record-area');
    }
    else if (argv.includes('--record')) {
        // No showWindow(): recording hides it anyway and the floating bar takes over
        mainWindow?.webContents.send('global-shortcut', 'toggle-recording');
    }
    else if (fromSecondInstance || !argv.includes('--hidden')) {
        showWindow();
    }
}
function createWindow() {
    mainWindow = new electron_1.BrowserWindow({
        width: 480,
        height: 760,
        resizable: true,
        frame: true,
        show: false,
        icon: ICON_PATH,
        webPreferences: {
            preload: path.join(__dirname, '../preload/index.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });
    mainWindow.setMenuBarVisibility(false);
    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
    else {
        mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
    }
    (0, ipc_handlers_1.registerIpcHandlers)(mainWindow);
    // Closing the window keeps the app in the tray so hotkeys keep working
    mainWindow.on('close', (e) => {
        if (!quitting) {
            e.preventDefault();
            mainWindow?.hide();
        }
    });
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}
function showWindow() {
    if (!mainWindow)
        return;
    if (mainWindow.isMinimized())
        mainWindow.restore();
    mainWindow.show();
    // Windows blocks focus-stealing from a background process; a brief always-on-top forces it forward
    mainWindow.setAlwaysOnTop(true);
    mainWindow.focus();
    mainWindow.setAlwaysOnTop(false);
}
function createTray() {
    tray = new electron_1.Tray(electron_1.nativeImage.createFromPath(ICON_PATH));
    tray.setToolTip('Screen Recorder');
    tray.setContextMenu(electron_1.Menu.buildFromTemplate([
        { label: 'Snip screenshot\tCtrl+Alt+S', click: () => (0, snip_1.startSnip)(mainWindow) },
        { label: 'Start/stop recording\tCtrl+Shift+R', click: () => handleArgs(['--record'], false) },
        { label: 'Record an area\tCtrl+Shift+A', click: () => handleArgs(['--record-area'], false) },
        { label: 'Open recorder', click: showWindow },
        { type: 'separator' },
        { label: 'Open screenshots folder', click: () => electron_1.shell.openPath((0, snip_1.getScreenshotDir)()) },
        { label: 'Open recordings folder', click: () => electron_1.shell.openPath((0, session_1.getOutputDir)()) },
        { type: 'separator' },
        { label: 'Quit', click: () => { quitting = true; electron_1.app.quit(); } },
    ]));
    tray.on('click', () => (0, snip_1.startSnip)(mainWindow));
}
function registerShortcuts() {
    const shortcuts = [
        ['CommandOrControl+Alt+S', () => (0, snip_1.startSnip)(mainWindow)],
        ['PrintScreen', () => (0, snip_1.startSnip)(mainWindow)],
        ['CommandOrControl+Shift+R', () => mainWindow?.webContents.send('global-shortcut', 'toggle-recording')],
        ['CommandOrControl+Shift+A', () => mainWindow?.webContents.send('global-shortcut', 'record-area')],
    ];
    for (const [accel, fn] of shortcuts) {
        if (!electron_1.globalShortcut.register(accel, fn))
            console.warn(`Shortcut ${accel} is taken by another app`);
    }
}
function onReady() {
    electron_1.app.setAppUserModelId('com.screenrecorder.app');
    // Right-click the taskbar icon for these
    const exe = process.execPath;
    const appArgs = electron_1.app.isPackaged ? '' : `"${electron_1.app.getAppPath()}" `;
    electron_1.app.setUserTasks([
        { program: exe, arguments: `${appArgs}--snip`, iconPath: ICON_PATH, iconIndex: 0, title: 'Snip screenshot', description: 'Drag to capture a region' },
        { program: exe, arguments: `${appArgs}--record`, iconPath: ICON_PATH, iconIndex: 0, title: 'Start/stop recording', description: 'Toggle screen recording' },
        { program: exe, arguments: `${appArgs}--record-area`, iconPath: ICON_PATH, iconIndex: 0, title: 'Record an area', description: 'Drag a box, then record only that area' },
    ]);
    ensureStartMenuShortcut(exe, appArgs.trim());
    createWindow();
    createTray();
    registerShortcuts();
    mainWindow.once('ready-to-show', () => handleArgs(process.argv, false));
}
// Start Menu shortcut carrying our AppUserModelId: gives notifications the right name/icon
// and is the thing to right-click > "Pin to taskbar"
function ensureStartMenuShortcut(exe, args) {
    const lnk = path.join(electron_1.app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Screen Recorder.lnk');
    electron_1.shell.writeShortcutLink(lnk, fs.existsSync(lnk) ? 'update' : 'create', {
        target: exe,
        args,
        cwd: electron_1.app.getAppPath(),
        icon: ICON_PATH,
        iconIndex: 0,
        appUserModelId: 'com.screenrecorder.app',
        description: 'Screenshots and screen recordings',
    });
}
electron_1.app.on('before-quit', () => {
    quitting = true;
});
// Stay alive in the tray when the window is hidden
electron_1.app.on('window-all-closed', () => { });
electron_1.app.on('will-quit', () => {
    electron_1.globalShortcut.unregisterAll();
});
