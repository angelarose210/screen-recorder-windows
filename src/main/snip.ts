import { BrowserWindow, clipboard, desktopCapturer, ipcMain, nativeImage, Notification, screen, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { getScreenshotsDir } from './config';

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
  #hint{position:fixed;top:16px;left:50%;transform:translateX(-50%);padding:6px 12px;border-radius:6px;
    background:rgba(20,20,30,.85);color:#eee;font:13px 'Segoe UI',sans-serif}
  #size{position:fixed;display:none;padding:2px 6px;border-radius:4px;background:rgba(20,20,30,.85);color:#eee;font:12px 'Segoe UI',sans-serif}
</style></head><body>
<img id="shot"><div id="dim"></div><div id="sel"></div><div id="size"></div>
<div id="hint"></div>
<script>
  const shot = document.getElementById('shot'), sel = document.getElementById('sel'),
        dim = document.getElementById('dim'), size = document.getElementById('size'), hint = document.getElementById('hint');
  let start = null, rect = null;
  window.snip.onImage((url, text) => { shot.src = url; hint.innerHTML = text; });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') window.snip.cancel(); });
  window.addEventListener('mousedown', (e) => {
    if (e.button !== 0) { window.snip.cancel(); return; }
    start = { x: e.clientX, y: e.clientY };
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
    window.snip.done(r);
  });
</script></body></html>`;

export interface PickedRegion {
  display: Electron.Display;
  // Selection in physical pixels relative to the display's top-left; null = whole display
  rect: { x: number; y: number; width: number; height: number } | null;
  image: Electron.NativeImage;
}

// Freezes the display under the cursor and lets the user drag a box. Resolves null on cancel.
export async function pickRegion(hint: string, hideFirst?: BrowserWindow | null): Promise<PickedRegion | null> {
  if (overlay) return null;

  const wasVisible = !!hideFirst && hideFirst.isVisible() && !hideFirst.isMinimized();
  if (wasVisible) {
    hideFirst!.hide();
    await new Promise((r) => setTimeout(r, 200)); // let the window fade out of the capture
  }

  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const sf = display.scaleFactor;
  const thumbSize = {
    width: Math.round(display.size.width * sf),
    height: Math.round(display.size.height * sf),
  };

  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: thumbSize });
  const source = sources.find((s) => s.display_id === String(display.id)) ?? sources[0];
  if (!source) return null;
  const image = source.thumbnail;

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

  return new Promise((resolve) => {
    const cleanup = () => {
      ipcMain.removeAllListeners('snip:done');
      ipcMain.removeAllListeners('snip:cancel');
      overlay?.destroy();
      overlay = null;
    };

    ipcMain.once('snip:cancel', () => {
      cleanup();
      resolve(null);
    });
    ipcMain.once('snip:done', (_e, r: { x: number; y: number; width: number; height: number } | null) => {
      cleanup();
      const size = image.getSize();
      const rect = r
        ? {
            x: Math.max(0, Math.round(r.x * sf)),
            y: Math.max(0, Math.round(r.y * sf)),
            width: Math.min(size.width, Math.round(r.width * sf)),
            height: Math.min(size.height, Math.round(r.height * sf)),
          }
        : null;
      resolve({ display, rect, image });
    });

    overlay!.webContents.once('did-finish-load', () => {
      overlay?.webContents.send('snip:image', image.toDataURL(), hint);
      overlay?.show();
      overlay?.focus();
    });
    overlay!.on('blur', () => overlay?.focus());
    overlay!.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(OVERLAY_HTML));
  });
}

export async function startSnip(hideFirst?: BrowserWindow | null): Promise<void> {
  const picked = await pickRegion('Drag to snip &middot; click for full screen &middot; Esc to cancel', hideFirst);
  if (!picked) return;
  saveImage(picked.rect ? picked.image.crop(picked.rect) : picked.image);
}

function saveImage(img: Electron.NativeImage) {
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
