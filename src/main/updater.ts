import { app, Notification } from 'electron';
import { autoUpdater } from 'electron-updater';

// Installed copies pull new versions from GitHub Releases: download in the background,
// install on next quit (or right away from the notification / tray menu).

type Listener = (state: UpdateState) => void;
export type UpdateState = { status: 'idle' | 'checking' | 'downloading' | 'ready' | 'none' | 'error'; version?: string };

let state: UpdateState = { status: 'idle' };
let onChange: Listener = () => {};
let manualCheck = false;

function set(next: UpdateState) {
  state = next;
  onChange(state);
}

function notify(title: string, body: string, onClick?: () => void) {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title, body, silent: true });
  if (onClick) n.on('click', onClick);
  n.show();
}

export function getUpdateState() {
  return state;
}

export function installUpdateNow() {
  if (state.status === 'ready') autoUpdater.quitAndInstall(true, true);
}

export function checkForUpdates(manual = false) {
  if (!app.isPackaged) {
    if (manual) notify('Updates', 'Updates only work in the installed app.');
    return;
  }
  if (state.status === 'checking' || state.status === 'downloading' || state.status === 'ready') {
    if (manual && state.status === 'ready') installUpdateNow();
    return;
  }
  manualCheck = manual;
  set({ status: 'checking' });
  autoUpdater.checkForUpdates().catch((err) => {
    console.error('Update check failed:', err);
    set({ status: 'error' });
    if (manualCheck) notify('Update check failed', String(err?.message ?? err).slice(0, 200));
  });
}

export function setupUpdates(listener: Listener) {
  onChange = listener;
  if (!app.isPackaged) return;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => set({ status: 'downloading', version: info.version }));
  autoUpdater.on('update-not-available', () => {
    set({ status: 'none' });
    if (manualCheck) notify('Screen Recorder is up to date', `You have version ${app.getVersion()}.`);
  });
  autoUpdater.on('update-downloaded', (info) => {
    set({ status: 'ready', version: info.version });
    notify(`Update ready: v${info.version}`, 'Click to restart and update now, or it installs next time you quit.', installUpdateNow);
  });
  autoUpdater.on('error', (err) => {
    console.error('Updater error:', err);
    set({ status: 'error' });
  });

  // Shortly after launch, then every 6 hours (the app lives in the tray for days)
  setTimeout(() => checkForUpdates(), 10_000);
  setInterval(() => checkForUpdates(), 6 * 60 * 60 * 1000);
}
