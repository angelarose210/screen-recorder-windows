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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.showRecordBar = showRecordBar;
exports.updateRecordBar = updateRecordBar;
exports.closeRecordBar = closeRecordBar;
const electron_1 = require("electron");
const electron_store_1 = __importDefault(require("electron-store"));
const path = __importStar(require("path"));
// Compact always-on-top bar shown while recording. It is excluded from screen capture
// (setContentProtection -> WDA_EXCLUDEFROMCAPTURE), so it never shows up in the video.
const BAR_W = 220;
const BAR_H = 44;
const store = new electron_store_1.default({
    name: 'record-bar',
    defaults: { barPos: null },
});
let bar = null;
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
    const d = electron_1.screen.getDisplayNearestPoint(electron_1.screen.getCursorScreenPoint()).workArea;
    return { x: Math.round(d.x + (d.width - BAR_W) / 2), y: d.y + 12 };
}
// Saved spot, unless that monitor is gone
function startPosition() {
    const saved = store.get('barPos');
    if (saved) {
        const onScreen = electron_1.screen.getAllDisplays().some((d) => {
            const a = d.workArea;
            return saved.x >= a.x && saved.y >= a.y && saved.x + BAR_W <= a.x + a.width && saved.y + BAR_H <= a.y + a.height;
        });
        if (onScreen)
            return saved;
    }
    return defaultPosition();
}
function showRecordBar(onStop) {
    if (bar)
        return;
    const pos = startPosition();
    bar = new electron_1.BrowserWindow({
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
    electron_1.ipcMain.removeAllListeners('bar:stop');
    electron_1.ipcMain.on('bar:stop', onStop);
    bar.on('moved', () => {
        if (!bar)
            return;
        const [x, y] = bar.getPosition();
        store.set('barPos', { x, y });
    });
    bar.once('ready-to-show', () => {
        if (!bar)
            return;
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
function updateRecordBar(channel, value) {
    bar?.webContents.send(`bar:${channel}`, value);
}
function closeRecordBar() {
    electron_1.ipcMain.removeAllListeners('bar:stop');
    bar?.destroy();
    bar = null;
}
