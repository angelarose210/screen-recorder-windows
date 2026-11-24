import { BrowserWindow, dialog, ipcMain, Notification, protocol, shell } from 'electron';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';
import { trimVideo } from './ffmpeg';
import { getVideosDir } from './config';

const isDev = process.argv.includes('--dev');
const ICON_PATH = path.join(__dirname, '../../resources/icon.ico').replace('app.asar', 'app.asar.unpacked');

const VIDEO_TYPES: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
};

// media://clip/<token> serves only files a trim window was opened with
const clips = new Map<string, string>();
const windows = new Map<number, { token: string; filePath: string; busy: boolean }>();

// Must run before app 'ready'. stream: true lets the <video> element seek with range requests.
export function registerMediaScheme() {
  protocol.registerSchemesAsPrivileged([
    { scheme: 'media', privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true } },
  ]);
}

function serveClip(request: Request): Response {
  const token = new URL(request.url).pathname.slice(1);
  const filePath = clips.get(token);
  if (!filePath || !fs.existsSync(filePath)) return new Response('Not found', { status: 404 });

  const size = fs.statSync(filePath).size;
  const type = VIDEO_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
  const range = /bytes=(\d*)-(\d*)/.exec(request.headers.get('range') ?? '');
  if (!range) {
    const body = Readable.toWeb(fs.createReadStream(filePath)) as ReadableStream;
    return new Response(body, {
      status: 200,
      headers: { 'Content-Type': type, 'Content-Length': String(size), 'Accept-Ranges': 'bytes' },
    });
  }

  // "bytes=-500" means the last 500 bytes
  let start = range[1] ? Number(range[1]) : size - Number(range[2]);
  let end = range[1] && range[2] ? Number(range[2]) : size - 1;
  start = Math.max(0, start);
  end = Math.min(end, size - 1);
  if (start > end) {
    return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
  }
  const body = Readable.toWeb(fs.createReadStream(filePath, { start, end })) as ReadableStream;
  return new Response(body, {
    status: 206,
    headers: {
      'Content-Type': type,
      'Content-Length': String(end - start + 1),
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Accept-Ranges': 'bytes',
    },
  });
}

export function openTrimWindow(filePath: string) {
  const token = randomUUID();
  clips.set(token, filePath);

  const win = new BrowserWindow({
    width: 1000,
    height: 700,
    minWidth: 640,
    minHeight: 480,
    title: `Trim - ${path.basename(filePath)}`,
    backgroundColor: '#1a1a2e',
    icon: ICON_PATH,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/trim.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setMenuBarVisibility(false);
  const id = win.webContents.id;
  windows.set(id, { token, filePath, busy: false });
  win.on('closed', () => {
    windows.delete(id);
    clips.delete(token);
  });
  win.once('ready-to-show', () => {
    win.show();
    win.focus();
  });

  if (isDev) win.loadURL('http://localhost:5173/trim.html');
  else win.loadFile(path.join(__dirname, '../renderer/trim.html'));
  return win;
}

export async function pickAndOpenTrim(parent?: BrowserWindow | null): Promise<boolean> {
  const options: Electron.OpenDialogOptions = {
    title: 'Pick a video to trim',
    defaultPath: getVideosDir(),
    properties: ['openFile'],
    filters: [{ name: 'Videos', extensions: Object.keys(VIDEO_TYPES).map((e) => e.slice(1)) }],
  };
  const result = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options);
  if (result.canceled || result.filePaths.length === 0) return false;
  openTrimWindow(result.filePaths[0]);
  return true;
}

let lastRecording: string | null = null;
// Held so the click handler isn't garbage collected while the toast sits in Action Center
let savedNotice: Notification | null = null;

// After every recording: remember it for "Trim last recording" and offer the trimmer
export function recordingSaved(filePath: string) {
  lastRecording = filePath;
  if (!Notification.isSupported()) return;
  savedNotice = new Notification({
    title: 'Recording saved',
    body: `${path.basename(filePath)}\nClick to trim the start or end.`,
    silent: true,
  });
  savedNotice.on('click', () => openTrimWindow(filePath));
  savedNotice.show();
}

// This session's last recording, else the newest in the videos folder (so it survives restarts).
// Names carry a UTC timestamp, so name order is time order; trimmed copies don't match.
function findLastRecording(): string | null {
  if (lastRecording && fs.existsSync(lastRecording)) return lastRecording;
  try {
    const dir = getVideosDir();
    const newest = fs
      .readdirSync(dir)
      .filter((f) => /^recording_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.mp4$/.test(f))
      .sort()
      .pop();
    return newest ? path.join(dir, newest) : null;
  } catch {
    return null;
  }
}

export function trimLastRecording() {
  const file = findLastRecording();
  if (file) openTrimWindow(file);
  else pickAndOpenTrim();
}

// "clip.mp4" -> "clip-trimmed.mp4", then "clip-trimmed-2.mp4" if that exists
function trimmedName(filePath: string): string {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath, path.extname(filePath));
  let candidate = path.join(dir, `${base}-trimmed.mp4`);
  for (let n = 2; fs.existsSync(candidate); n++) candidate = path.join(dir, `${base}-trimmed-${n}.mp4`);
  return candidate;
}

async function replaceFile(original: string, replacement: string) {
  // Old copy goes to the Recycle Bin so a bad trim can be undone
  for (let attempt = 0; ; attempt++) {
    try {
      await shell.trashItem(original);
      break;
    } catch (err) {
      if (attempt >= 4) throw err;
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  await fs.promises.rename(replacement, original);
}

export function setupTrim() {
  protocol.handle('media', serveClip);

  ipcMain.handle('trim:get-info', (event) => {
    const state = windows.get(event.sender.id);
    if (!state) return null;
    return {
      filePath: state.filePath,
      fileName: path.basename(state.filePath),
      src: `media://clip/${state.token}`,
      canReplace: path.extname(state.filePath).toLowerCase() === '.mp4',
    };
  });

  ipcMain.handle('trim:export', async (event, opts: { start: number; end: number; replace: boolean }) => {
    const state = windows.get(event.sender.id);
    if (!state) throw new Error('No video open');
    if (state.busy) throw new Error('Already saving');
    const { start, end } = opts;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end - start < 0.1) {
      throw new Error('Pick a longer section');
    }

    const replace = opts.replace && path.extname(state.filePath).toLowerCase() === '.mp4';
    const target = replace
      ? path.join(path.dirname(state.filePath), `.${path.basename(state.filePath, '.mp4')}.trimming.mp4`)
      : trimmedName(state.filePath);

    state.busy = true;
    try {
      await trimVideo({
        inputPath: state.filePath,
        outputPath: target,
        start,
        end,
        onProgress: (f) => {
          if (!event.sender.isDestroyed()) event.sender.send('trim:progress', f);
        },
      });
      if (!replace) return { outputPath: target };
      await replaceFile(state.filePath, target);
      return { outputPath: state.filePath };
    } catch (err) {
      fs.promises.rm(target, { force: true }).catch(() => {});
      throw err;
    } finally {
      state.busy = false;
    }
  });

  ipcMain.handle('trim:show-in-folder', (_event, filePath: string) => {
    shell.showItemInFolder(filePath);
  });
}
