import { app, BrowserWindow, globalShortcut, Menu, nativeImage, shell, Tray } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { openCapture, registerIpcHandlers } from './ipc-handlers';
import { getScreenshotDir } from './snip';
import { getOutputDir } from './session';
import { getSettings, setSettings } from './config';
import { checkForUpdates, getUpdateState, installUpdateNow, setupUpdates } from './updater';

const isDev = process.argv.includes('--dev');
// Shell APIs (jump list, shortcuts) can't read inside app.asar, so point them at the unpacked copy
const ICON_PATH = path.join(__dirname, '../../resources/icon.ico').replace('app.asar', 'app.asar.unpacked');

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;

// One instance only: launching again (taskbar icon, jump list) forwards its args here
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => handleArgs(argv, true));
  app.whenReady().then(onReady);
}

function handleArgs(argv: string[], fromSecondInstance: boolean) {
  if (argv.includes('--snip')) {
    openCapture('screenshot');
  } else if (argv.includes('--capture')) {
    openCapture();
  } else if (argv.includes('--record-area')) {
    mainWindow?.webContents.send('global-shortcut', 'record-area');
  } else if (argv.includes('--record')) {
    // No showWindow(): recording hides it anyway and the floating bar takes over
    mainWindow?.webContents.send('global-shortcut', 'toggle-recording');
  } else if (fromSecondInstance || !argv.includes('--hidden')) {
    showWindow();
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
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
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  registerIpcHandlers(mainWindow);

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
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  // Windows blocks focus-stealing from a background process; a brief always-on-top forces it forward
  mainWindow.setAlwaysOnTop(true);
  mainWindow.focus();
  mainWindow.setAlwaysOnTop(false);
}

function updateMenuItem(): Electron.MenuItemConstructorOptions {
  const u = getUpdateState();
  if (u.status === 'ready') return { label: `Restart to update (v${u.version})`, click: installUpdateNow };
  if (u.status === 'downloading') return { label: `Downloading update v${u.version}...`, enabled: false };
  if (u.status === 'checking') return { label: 'Checking for updates...', enabled: false };
  return { label: 'Check for updates', click: () => checkForUpdates(true) };
}

function buildTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Snip screenshot\tCtrl+Alt+S', click: () => openCapture('screenshot') },
      { label: 'Start/stop recording\tCtrl+Shift+R', click: () => handleArgs(['--record'], false) },
      { label: 'Record an area\tCtrl+Shift+A', click: () => handleArgs(['--record-area'], false) },
      { label: 'Open recorder', click: showWindow },
      { type: 'separator' },
      { label: 'Open screenshots folder', click: () => shell.openPath(getScreenshotDir()) },
      { label: 'Open recordings folder', click: () => shell.openPath(getOutputDir()) },
      { type: 'separator' },
      { label: 'Start with Windows', type: 'checkbox', checked: getSettings().startAtLogin, click: (item) => setStartAtLogin(item.checked) },
      updateMenuItem(),
      { label: `Version ${app.getVersion()}`, enabled: false },
      { label: 'Quit', click: () => { quitting = true; app.quit(); } },
    ])
  );
}

// Launch hidden at sign-in so the tray icon and hotkeys are there after a restart
function setStartAtLogin(enabled: boolean) {
  setSettings({ startAtLogin: enabled });
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: enabled, args: ['--hidden'] });
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(ICON_PATH));
  tray.setToolTip('Screen Recorder: click to capture');
  buildTrayMenu();
  // Overlay opens in whichever mode (Screenshot/Video) was used last; toggle with S / V
  tray.on('click', () => openCapture());
}

function registerShortcuts() {
  const shortcuts: Array<[string, () => void]> = [
    ['CommandOrControl+Alt+S', () => openCapture('screenshot')],
    ['PrintScreen', () => openCapture('screenshot')],
    ['CommandOrControl+Shift+R', () => mainWindow?.webContents.send('global-shortcut', 'toggle-recording')],
    ['CommandOrControl+Shift+A', () => mainWindow?.webContents.send('global-shortcut', 'record-area')],
  ];
  for (const [accel, fn] of shortcuts) {
    if (!globalShortcut.register(accel, fn)) console.warn(`Shortcut ${accel} is taken by another app`);
  }
}

function onReady() {
  app.setAppUserModelId('com.screenrecorder.app');

  // Right-click the taskbar icon for these
  const exe = process.execPath;
  const appArgs = app.isPackaged ? '' : `"${app.getAppPath()}" `;
  app.setUserTasks([
    { program: exe, arguments: `${appArgs}--snip`, iconPath: ICON_PATH, iconIndex: 0, title: 'Snip screenshot', description: 'Drag to capture a region' },
    { program: exe, arguments: `${appArgs}--record`, iconPath: ICON_PATH, iconIndex: 0, title: 'Start/stop recording', description: 'Toggle screen recording' },
    { program: exe, arguments: `${appArgs}--record-area`, iconPath: ICON_PATH, iconIndex: 0, title: 'Record an area', description: 'Drag a box, then record only that area' },
  ]);

  ensureStartMenuShortcut(exe, appArgs.trim());
  setStartAtLogin(getSettings().startAtLogin);

  createWindow();
  createTray();
  registerShortcuts();
  setupUpdates(() => buildTrayMenu());
  mainWindow!.once('ready-to-show', () => handleArgs(process.argv, false));
}

// Start Menu shortcut carrying our AppUserModelId: gives notifications the right name/icon
// and is the thing to right-click > "Pin to taskbar"
function ensureStartMenuShortcut(exe: string, args: string) {
  const lnk = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Screen Recorder.lnk');
  shell.writeShortcutLink(lnk, fs.existsSync(lnk) ? 'update' : 'create', {
    target: exe,
    args,
    cwd: path.dirname(exe),
    icon: ICON_PATH,
    iconIndex: 0,
    appUserModelId: 'com.screenrecorder.app',
    description: 'Screenshots and screen recordings',
  });
}

app.on('before-quit', () => {
  quitting = true;
});

// Stay alive in the tray when the window is hidden
app.on('window-all-closed', () => {});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
