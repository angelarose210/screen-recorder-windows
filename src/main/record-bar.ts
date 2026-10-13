import { BrowserWindow, ipcMain, screen } from 'electron';
import Store from 'electron-store';
import * as path from 'path';

// Compact always-on-top bar shown while recording. It is excluded from screen capture
// (setContentProtection -> WDA_EXCLUDEFROMCAPTURE), so it never shows up in the video.

const BAR_W = 220;
const BAR_H = 44;

const store = new Store<{ barPos: { x: number; y: number } | null }>({
  name: 'record-bar',
  defaults: { barPos: null },
});

let bar: BrowserWindow | null = null;
let outline: BrowserWindow | null = null;

// Gap between the recorded area and the drawn frame, so the frame sits outside the capture
// even if content protection were ignored
const OUTLINE_PAD = 4;
const OUTLINE_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;height:100%;background:transparent;overflow:hidden}
  .frame{box-sizing:border-box;position:fixed;inset:0;border:2px dashed rgba(233,69,96,.55);border-radius:3px}
</style></head><body><div class="frame"></div></body></html>`;

const BAR_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;height:100%;background:transparent;overflow:hidden;user-select:none}
  .bar{box-sizing:border-box;height:${BAR_H}px;display:flex;align-items:center;gap:10px;padding:0 6px 0 10px;
    background:rgba(22,24,40,.94);border:1px solid rgba(255,255,255,.12);border-radius:22px;
    font:600 14px 'Segoe UI',sans-serif;color:#eee;-webkit-app-region:drag;cursor:move}
  .grip{color:#666;font-size:12px;letter-spacing:-2px}
  .dot{width:10px;height:10px;border-radius:50%;background:#e94560;animation:pulse 1s infinite}
  .saving .dot{background:#888;animation:none}
  .time{font-variant-numeric:tabular-nums;min-width:52px}
  .label{flex:1;font-weight:400;font-size:12px;color:#999}
  button{-webkit-app-region:no-drag;cursor:pointer;border:none;border-radius:16px;height:32px;padding:0 14px;
    background:#e94560;color:#fff;font:600 13px 'Segoe UI',sans-serif;display:flex;align-items:center;gap:6px}
  button:hover{background:#ff5a75}
  button:disabled{background:#444;cursor:default}
  .sq{width:10px;height:10px;border-radius:2px;background:#fff}
  @keyframes pulse{50%{opacity:.35}}
</style></head><body>
<div class="bar" id="bar" title="Drag to move">
  <span class="grip">⋮⋮</span><span class="dot"></span><span class="time" id="time">00:00</span>
  <span class="label" id="label">REC</span>
  <button id="stop" title="Stop recording (Ctrl+Shift+R)"><span class="sq"></span>Stop</button>
</div>
<script>
  const fmt = (s) => String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  const time = document.getElementById('time'), label = document.getElementById('label'),
        stop = document.getElementById('stop'), root = document.getElementById('bar');
  window.bar.onTimer((s) => { time.textContent = fmt(s); });
  window.bar.onState((st) => {
    const busy = st === 'stopping' || st === 'saving';
    root.classList.toggle('saving', busy);
    label.textContent = st === 'preparing' ? 'Starting' : busy ? 'Saving' : 'REC';
    stop.disabled = st !== 'recording';
  });
  stop.addEventListener('click', () => window.bar.stop());
</script></body></html>`;

function defaultPosition() {
  const d = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  return { x: Math.round(d.x + (d.width - BAR_W) / 2), y: d.y + 12 };
}

// Saved spot, unless that monitor is gone
function startPosition() {
  const saved = store.get('barPos');
  if (saved) {
    const onScreen = screen.getAllDisplays().some((d) => {
      const a = d.workArea;
      return saved.x >= a.x && saved.y >= a.y && saved.x + BAR_W <= a.x + a.width && saved.y + BAR_H <= a.y + a.height;
    });
    if (onScreen) return saved;
  }
  return defaultPosition();
}

export function showRecordBar(onStop: () => void) {
  if (bar) return;
  const pos = startPosition();
  bar = new BrowserWindow({
    x: pos.x,
    y: pos.y,
    width: BAR_W,
    height: BAR_H,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/bar.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  bar.setAlwaysOnTop(true, 'screen-saver');

  ipcMain.removeAllListeners('bar:stop');
  ipcMain.on('bar:stop', onStop);

  bar.on('moved', () => {
    if (!bar) return;
    const [x, y] = bar.getPosition();
    store.set('barPos', { x, y });
  });
  bar.once('ready-to-show', () => {
    if (!bar) return;
    // Set before AND after show: the display affinity is lost if applied before the HWND is shown
    bar.setContentProtection(true);
    bar.showInactive(); // don't steal focus from what's being recorded
    bar.setContentProtection(true);
  });
  bar.on('closed', () => {
    bar = null;
  });
  bar.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(BAR_HTML));
}

// Faint click-through frame around the recorded area. rect is in DIP screen coordinates.
export function showRegionOutline(rect: { x: number; y: number; width: number; height: number }) {
  closeRegionOutline();
  const b = {
    x: Math.round(rect.x - OUTLINE_PAD),
    y: Math.round(rect.y - OUTLINE_PAD),
    width: Math.round(rect.width + OUTLINE_PAD * 2),
    height: Math.round(rect.height + OUTLINE_PAD * 2),
  };
  outline = new BrowserWindow({
    ...b,
    frame: false,
    transparent: true,
    resizable: false,
    movable: false,
    focusable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: false,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  outline.setAlwaysOnTop(true, 'screen-saver');
  outline.setIgnoreMouseEvents(true); // clicks pass straight through to the app underneath
  outline.once('ready-to-show', () => {
    if (!outline) return;
    outline.setContentProtection(true);
    outline.showInactive();
    outline.setContentProtection(true);
    outline.setBounds(b); // Windows can nudge frameless windows on show
  });
  outline.on('closed', () => {
    outline = null;
  });
  outline.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(OUTLINE_HTML));
}

function closeRegionOutline() {
  outline?.destroy();
  outline = null;
}

export function updateRecordBar(channel: 'state' | 'timer', value: string | number) {
  bar?.webContents.send(`bar:${channel}`, value);
}

export function closeRecordBar() {
  ipcMain.removeAllListeners('bar:stop');
  bar?.destroy();
  bar = null;
  closeRegionOutline();
}
