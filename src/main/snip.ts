import { BrowserWindow, clipboard, desktopCapturer, ipcMain, nativeImage, Notification, screen, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { OverlayEffects, getScreenshotsDir } from './config';

// Region screenshot, Snipping Tool style: freeze the screen under the cursor,
// let the user drag a rectangle, then save PNG + copy to clipboard.

let overlay: BrowserWindow | null = null;

export function getScreenshotDir(): string {
  return getScreenshotsDir();
}

const OVERLAY_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;height:100%;overflow:hidden;cursor:crosshair;user-select:none;background:#000}
  #shot{position:fixed;inset:0;width:100%;height:100%}
  #dim{position:fixed;inset:0;background:rgba(0,0,0,.35)}
  #sel{position:fixed;display:none;outline:2px solid #4da3ff;box-shadow:0 0 0 9999px rgba(0,0,0,.35)}
  #hint{position:fixed;top:16px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:12px;
    padding:6px 12px 6px 6px;border-radius:10px;background:rgba(20,20,30,.9);color:#eee;font:13px 'Segoe UI',sans-serif;cursor:default}
  #modes{display:flex;gap:2px;background:rgba(255,255,255,.08);border-radius:7px;padding:2px}
  #modes button{border:none;border-radius:5px;padding:5px 10px;background:transparent;color:#ccc;cursor:pointer;
    font:600 13px 'Segoe UI',sans-serif}
  #modes button.on{background:#4da3ff;color:#fff}
  body.video #modes button.on{background:#e94560}
  #modes button:disabled{opacity:.35;cursor:default}
  kbd{font:11px 'Segoe UI',sans-serif;opacity:.6;margin-left:4px}
  body.video #sel{outline-color:#e94560}
  #text{white-space:nowrap}
  #fx{display:none;gap:4px;padding-left:12px;border-left:1px solid rgba(255,255,255,.15)}
  body.video #fx{display:flex}
  #fx button{border:1px solid rgba(255,255,255,.18);border-radius:12px;padding:3px 9px;background:transparent;
    color:#888;cursor:pointer;font:12px 'Segoe UI',sans-serif}
  #fx button.on{border-color:#e94560;background:rgba(233,69,96,.2);color:#fff}
  #fx .val{display:none;align-items:center;gap:1px;margin:0 4px 0 -2px}
  #fx .val.show{display:flex}
  #fx .val button{border:none;padding:3px 6px;color:#ccc;font-weight:600}
  #fx .val button:hover{color:#fff;background:rgba(255,255,255,.1)}
  #fx .val b{min-width:30px;text-align:center;font:600 12px 'Segoe UI',sans-serif;font-variant-numeric:tabular-nums}
  #fx #tiltVal{display:none;border:none;padding:3px 6px;margin:0 4px 0 -2px;color:#ccc;font-weight:600}
  #fx #tiltVal.show{display:block}
  #fx #tiltVal:hover{color:#fff;background:rgba(255,255,255,.1)}
  #size{position:fixed;display:none;padding:2px 6px;border-radius:4px;background:rgba(20,20,30,.85);color:#eee;font:12px 'Segoe UI',sans-serif}
</style></head><body>
<img id="shot"><div id="dim"></div><div id="sel"></div><div id="size"></div>
<div id="hint"><div id="modes">
  <button data-m="screenshot" title="Screenshot (S)">Screenshot<kbd>S</kbd></button>
  <button data-m="video" title="Video (V)">Video<kbd>V</kbd></button>
</div><div id="fx" title="Effects for this recording (also changes the main window settings)">
  <button data-fx="zoom" title="Auto-zoom on click (Z)">Zoom</button>
  <span class="val" id="zoomVal" title="Zoom level: scroll, or [ and ]">
    <button data-step="-1" title="Less zoom ( [ )">&minus;</button><b id="zoomTxt">1.5x</b><button data-step="1" title="More zoom ( ] )">+</button>
  </span>
  <button data-fx="tilt" title="3D tilt (T)">Tilt</button>
  <button id="tiltVal" title="Tilt intensity, click to change (I)">Subtle</button>
  <button data-fx="canvas" title="Padded background frame (B)">Background</button>
  <button data-fx="cursor" title="Cursor highlight (C)">Cursor</button>
</div><span id="text"></span></div>
<script>
  const shot = document.getElementById('shot'), sel = document.getElementById('sel'),
        dim = document.getElementById('dim'), size = document.getElementById('size'), hint = document.getElementById('hint');
  const text = document.getElementById('text'), buttons = document.querySelectorAll('#modes button');
  const HINTS = {
    screenshot: 'Drag to snip &middot; click for full screen &middot; Esc to cancel',
    video: 'Drag the area to record &middot; click for full screen &middot; Esc to cancel',
  };
  let start = null, rect = null, mode = 'screenshot', fx = {};
  const fxButtons = document.querySelectorAll('#fx button[data-fx]');
  const zoomVal = document.getElementById('zoomVal'), zoomTxt = document.getElementById('zoomTxt'),
        tiltVal = document.getElementById('tiltVal');
  const INTENSITIES = ['subtle', 'medium', 'dramatic'];
  function renderFx() {
    fxButtons.forEach((b) => b.classList.toggle('on', !!fx[b.dataset.fx]));
    zoomVal.classList.toggle('show', !!fx.zoom);
    zoomTxt.textContent = (fx.zoomLevel || 1.5).toFixed(1) + 'x';
    tiltVal.classList.toggle('show', !!fx.tilt);
    const t = fx.tiltIntensity || 'subtle';
    tiltVal.textContent = t[0].toUpperCase() + t.slice(1);
  }
  function stepZoom(d) {
    if (mode !== 'video' || !fx.zoom) return;
    fx.zoomLevel = Math.min(3, Math.max(1.2, Math.round(((fx.zoomLevel || 1.5) + d * 0.1) * 10) / 10));
    renderFx();
  }
  function cycleTilt() {
    if (mode !== 'video' || !fx.tilt) return;
    fx.tiltIntensity = INTENSITIES[(INTENSITIES.indexOf(fx.tiltIntensity || 'subtle') + 1) % INTENSITIES.length];
    renderFx();
  }
  zoomVal.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => stepZoom(+b.dataset.step)));
  zoomVal.addEventListener('wheel', (e) => { e.preventDefault(); stepZoom(e.deltaY < 0 ? 1 : -1); }, { passive: false });
  tiltVal.addEventListener('click', cycleTilt);
  function toggleFx(k) { if (mode !== 'video') return; fx[k] = !fx[k]; renderFx(); }
  fxButtons.forEach((b) => b.addEventListener('click', () => toggleFx(b.dataset.fx)));
  function setMode(m) {
    const b = document.querySelector('#modes button[data-m="' + m + '"]');
    if (!b || b.disabled) return;
    mode = m;
    buttons.forEach((x) => x.classList.toggle('on', x === b));
    document.body.classList.toggle('video', m === 'video');
    text.innerHTML = HINTS[m];
  }
  buttons.forEach((b) => b.addEventListener('click', () => setMode(b.dataset.m)));
  // Clicks on the toggle must not start a selection
  hint.addEventListener('mousedown', (e) => e.stopPropagation());
  hint.addEventListener('mouseup', (e) => e.stopPropagation());
  window.snip.onImage((url, opts) => {
    shot.src = url;
    fx = Object.assign({}, opts.fx || {});
    renderFx();
    document.querySelector('#modes button[data-m="video"]').disabled = !opts.allowVideo;
    setMode(opts.allowVideo ? opts.mode : 'screenshot');
  });
  window.snip.onSwap((url) => {
    shot.src = url;
    start = null; rect = null;
    sel.style.display = 'none'; size.style.display = 'none';
    dim.style.display = ''; hint.style.display = '';
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') window.snip.cancel();
    if (e.key === 's' || e.key === 'S') setMode('screenshot');
    if (e.key === 'v' || e.key === 'V') setMode('video');
    const k = { z: 'zoom', t: 'tilt', b: 'canvas', c: 'cursor' }[e.key.toLowerCase()];
    if (k) toggleFx(k);
    if (e.key === '[' || e.key === '-') stepZoom(-1);
    if (e.key === ']' || e.key === '=' || e.key === '+') stepZoom(1);
    if (e.key === 'i' || e.key === 'I') cycleTilt();
  });
  window.addEventListener('mousedown', (e) => {
    if (e.button !== 0) { window.snip.cancel(); return; }
    start = { x: e.clientX, y: e.clientY };
    window.snip.drag(true);
  });
  window.addEventListener('mousemove', (e) => {
    if (!start) return;
    const x = Math.min(start.x, e.clientX), y = Math.min(start.y, e.clientY);
    const w = Math.abs(e.clientX - start.x), h = Math.abs(e.clientY - start.y);
    rect = { x, y, width: w, height: h };
    dim.style.display = 'none'; hint.style.display = 'none';
    Object.assign(sel.style, { display: 'block', left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
    Object.assign(size.style, { display: 'block', left: x + 'px', top: Math.max(0, y - 22) + 'px' });
    size.textContent = Math.round(w * devicePixelRatio) + ' x ' + Math.round(h * devicePixelRatio);
  });
  window.addEventListener('mouseup', () => {
    if (!start) return;
    const r = rect && rect.width > 4 && rect.height > 4 ? rect : null; // tiny drag = click = full screen
    start = null;
    window.snip.drag(false);
    window.snip.done(r, mode, fx);
  });
</script></body></html>`;

export type CaptureMode = 'screenshot' | 'video';

export interface PickedRegion {
  display: Electron.Display;
  mode: CaptureMode;
  fx?: OverlayEffects; // effect toggles as left in the overlay (video mode)
  // Selection in physical pixels relative to the display's top-left; null = whole display
  rect: { x: number; y: number; width: number; height: number } | null;
  image: Electron.NativeImage;
}

// Freezes the display under the cursor and lets the user drag a box, with a Screenshot/Video
// toggle at the top. Resolves null on cancel.
export async function pickRegion(
  opts: { mode: CaptureMode; allowVideo: boolean; fx?: OverlayEffects },
  hideFirst?: BrowserWindow | null
): Promise<PickedRegion | null> {
  if (overlay) return null;

  const wasVisible = !!hideFirst && hideFirst.isVisible() && !hideFirst.isMinimized();
  if (wasVisible) {
    hideFirst!.hide();
    await new Promise((r) => setTimeout(r, 200)); // let the window fade out of the capture
  }

  let display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const first = await grabDisplay(display);
  if (!first) return null;
  let image = first;
  // Frozen frames per display, so moving back to a screen shows the same moment
  const frames = new Map<number, Electron.NativeImage>([[display.id, first]]);

  overlay = new BrowserWindow({
    ...display.bounds,
    frame: false,
    transparent: false,
    resizable: false,
    movable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    fullscreenable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/snip.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  overlay.setAlwaysOnTop(true, 'screen-saver');
  overlay.setBounds(display.bounds);

  // Multi-monitor: when the cursor moves onto another screen (and no drag is in progress),
  // move the overlay there with that screen's frozen frame.
  let dragging = false;
  let switching = false;
  ipcMain.on('snip:drag', (_e, d: boolean) => { dragging = d; });
  const follow = setInterval(async () => {
    if (!overlay || dragging || switching) return;
    const next = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    if (next.id === display.id) return;
    switching = true;
    try {
      const frame = frames.get(next.id) ?? (await grabDisplay(next));
      if (!frame || !overlay) return;
      frames.set(next.id, frame);
      display = next;
      image = frame;
      // Twice: Electron sizes a window moved across monitors with different DPI using the old scale
      overlay.setBounds(next.bounds);
      overlay.setBounds(next.bounds);
      overlay.webContents.send('snip:swap', frame.toDataURL());
      overlay.focus();
    } finally {
      switching = false;
    }
  }, 120);

  return new Promise((resolve) => {
    const cleanup = () => {
      clearInterval(follow);
      ipcMain.removeAllListeners('snip:drag');
      ipcMain.removeAllListeners('snip:done');
      ipcMain.removeAllListeners('snip:cancel');
      overlay?.destroy();
      overlay = null;
    };

    ipcMain.once('snip:cancel', () => {
      cleanup();
      resolve(null);
    });
    ipcMain.once('snip:done', (_e, r: { x: number; y: number; width: number; height: number } | null, mode: CaptureMode, fx?: OverlayEffects) => {
      cleanup();
      const sf = display.scaleFactor;
      const size = image.getSize();
      const rect = r
        ? {
            x: Math.max(0, Math.round(r.x * sf)),
            y: Math.max(0, Math.round(r.y * sf)),
            width: Math.min(size.width, Math.round(r.width * sf)),
            height: Math.min(size.height, Math.round(r.height * sf)),
          }
        : null;
      resolve({ display, mode: mode === 'video' && opts.allowVideo ? 'video' : 'screenshot', fx, rect, image });
    });

    overlay!.webContents.once('did-finish-load', () => {
      overlay?.webContents.send('snip:image', image.toDataURL(), opts);
      overlay?.show();
      overlay?.focus();
    });
    overlay!.on('blur', () => overlay?.focus());
    overlay!.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(OVERLAY_HTML));
  });
}

async function grabDisplay(display: Electron.Display): Promise<Electron.NativeImage | null> {
  const sf = display.scaleFactor;
  const thumbnailSize = { width: Math.round(display.size.width * sf), height: Math.round(display.size.height * sf) };
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize });
  const source = sources.find((s) => s.display_id === String(display.id)) ?? sources[0];
  return source ? source.thumbnail : null;
}

export function saveImage(img: Electron.NativeImage) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filePath = path.join(getScreenshotDir(), `Screenshot_${timestamp}.png`);
  fs.writeFileSync(filePath, img.toPNG());
  clipboard.writeImage(img);

  if (Notification.isSupported()) {
    const n = new Notification({
      title: 'Screenshot copied',
      body: `Saved to ${filePath}. Click to open.`,
      icon: nativeImage.createFromBuffer(img.resize({ width: 256 }).toPNG()),
      silent: true,
    });
    n.on('click', () => shell.openPath(filePath));
    n.show();
  }
}
