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
exports.registerMediaScheme = registerMediaScheme;
exports.openTrimWindow = openTrimWindow;
exports.pickAndOpenTrim = pickAndOpenTrim;
exports.recordingSaved = recordingSaved;
exports.trimLastRecording = trimLastRecording;
exports.setupTrim = setupTrim;
const electron_1 = require("electron");
const crypto_1 = require("crypto");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const stream_1 = require("stream");
const ffmpeg_1 = require("./ffmpeg");
const config_1 = require("./config");
const isDev = process.argv.includes('--dev');
const ICON_PATH = path.join(__dirname, '../../resources/icon.ico').replace('app.asar', 'app.asar.unpacked');
const VIDEO_TYPES = {
    '.mp4': 'video/mp4',
    '.m4v': 'video/mp4',
    '.mov': 'video/quicktime',
    '.webm': 'video/webm',
    '.mkv': 'video/x-matroska',
};
// media://clip/<token> serves only files a trim window was opened with
const clips = new Map();
const windows = new Map();
// Must run before app 'ready'. stream: true lets the <video> element seek with range requests.
function registerMediaScheme() {
    electron_1.protocol.registerSchemesAsPrivileged([
        { scheme: 'media', privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true } },
    ]);
}
function serveClip(request) {
    const token = new URL(request.url).pathname.slice(1);
    const filePath = clips.get(token);
    if (!filePath || !fs.existsSync(filePath))
        return new Response('Not found', { status: 404 });
    const size = fs.statSync(filePath).size;
    const type = VIDEO_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream';
    const range = /bytes=(\d*)-(\d*)/.exec(request.headers.get('range') ?? '');
    if (!range) {
        const body = stream_1.Readable.toWeb(fs.createReadStream(filePath));
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
    const body = stream_1.Readable.toWeb(fs.createReadStream(filePath, { start, end }));
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
function openTrimWindow(filePath) {
    const token = (0, crypto_1.randomUUID)();
    clips.set(token, filePath);
    const win = new electron_1.BrowserWindow({
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
    if (isDev)
        win.loadURL('http://localhost:5173/trim.html');
    else
        win.loadFile(path.join(__dirname, '../renderer/trim.html'));
    return win;
}
async function pickAndOpenTrim(parent) {
    const options = {
        title: 'Pick a video to trim',
        defaultPath: (0, config_1.getVideosDir)(),
        properties: ['openFile'],
        filters: [{ name: 'Videos', extensions: Object.keys(VIDEO_TYPES).map((e) => e.slice(1)) }],
    };
    const result = parent ? await electron_1.dialog.showOpenDialog(parent, options) : await electron_1.dialog.showOpenDialog(options);
    if (result.canceled || result.filePaths.length === 0)
        return false;
    openTrimWindow(result.filePaths[0]);
    return true;
}
let lastRecording = null;
// Held so the click handler isn't garbage collected while the toast sits in Action Center
let savedNotice = null;
// After every recording: remember it for "Trim last recording" and offer the trimmer
function recordingSaved(filePath) {
    lastRecording = filePath;
    if (!electron_1.Notification.isSupported())
        return;
    savedNotice = new electron_1.Notification({
        title: 'Recording saved',
        body: `${path.basename(filePath)}\nClick to trim the start or end.`,
        silent: true,
    });
    savedNotice.on('click', () => openTrimWindow(filePath));
    savedNotice.show();
}
// This session's last recording, else the newest in the videos folder (so it survives restarts).
// Names carry a UTC timestamp, so name order is time order; trimmed copies don't match.
function findLastRecording() {
    if (lastRecording && fs.existsSync(lastRecording))
        return lastRecording;
    try {
        const dir = (0, config_1.getVideosDir)();
        const newest = fs
            .readdirSync(dir)
            .filter((f) => /^recording_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.mp4$/.test(f))
            .sort()
            .pop();
        return newest ? path.join(dir, newest) : null;
    }
    catch {
        return null;
    }
}
function trimLastRecording() {
    const file = findLastRecording();
    if (file)
        openTrimWindow(file);
    else
        pickAndOpenTrim();
}
// "clip.mp4" -> "clip-trimmed.mp4", then "clip-trimmed-2.mp4" if that exists
function trimmedName(filePath) {
    const dir = path.dirname(filePath);
    const base = path.basename(filePath, path.extname(filePath));
    let candidate = path.join(dir, `${base}-trimmed.mp4`);
    for (let n = 2; fs.existsSync(candidate); n++)
        candidate = path.join(dir, `${base}-trimmed-${n}.mp4`);
    return candidate;
}
async function replaceFile(original, replacement) {
    // Old copy goes to the Recycle Bin so a bad trim can be undone
    for (let attempt = 0;; attempt++) {
        try {
            await electron_1.shell.trashItem(original);
            break;
        }
        catch (err) {
            if (attempt >= 4)
                throw err;
            await new Promise((r) => setTimeout(r, 250));
        }
    }
    await fs.promises.rename(replacement, original);
}
function setupTrim() {
    electron_1.protocol.handle('media', serveClip);
    electron_1.ipcMain.handle('trim:get-info', (event) => {
        const state = windows.get(event.sender.id);
        if (!state)
            return null;
        return {
            filePath: state.filePath,
            fileName: path.basename(state.filePath),
            src: `media://clip/${state.token}`,
            canReplace: path.extname(state.filePath).toLowerCase() === '.mp4',
        };
    });
    electron_1.ipcMain.handle('trim:export', async (event, opts) => {
        const state = windows.get(event.sender.id);
        if (!state)
            throw new Error('No video open');
        if (state.busy)
            throw new Error('Already saving');
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
            await (0, ffmpeg_1.trimVideo)({
                inputPath: state.filePath,
                outputPath: target,
                start,
                end,
                onProgress: (f) => {
                    if (!event.sender.isDestroyed())
                        event.sender.send('trim:progress', f);
                },
            });
            if (!replace)
                return { outputPath: target };
            await replaceFile(state.filePath, target);
            return { outputPath: state.filePath };
        }
        catch (err) {
            fs.promises.rm(target, { force: true }).catch(() => { });
            throw err;
        }
        finally {
            state.busy = false;
        }
    });
    electron_1.ipcMain.handle('trim:show-in-folder', (_event, filePath) => {
        electron_1.shell.showItemInFolder(filePath);
    });
}
