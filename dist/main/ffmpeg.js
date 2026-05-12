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
exports.FFmpegEncoder = void 0;
const child_process_1 = require("child_process");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const electron_1 = require("electron");
function getFFmpegPath() {
    // Check bundled first
    const bundledPath = electron_1.app.isPackaged
        ? path.join(process.resourcesPath, 'ffmpeg', 'ffmpeg.exe')
        : path.join(__dirname, '../../resources/ffmpeg/ffmpeg.exe');
    if (fs.existsSync(bundledPath))
        return bundledPath;
    // Fall back to system FFmpeg
    try {
        const systemPath = (0, child_process_1.execSync)('where ffmpeg', { encoding: 'utf8' }).trim().split('\n')[0];
        if (systemPath && fs.existsSync(systemPath))
            return systemPath;
    }
    catch { }
    return 'ffmpeg'; // hope it's on PATH
}
class FFmpegEncoder {
    process = null;
    ffmpegPath;
    constructor() {
        this.ffmpegPath = getFFmpegPath();
    }
    createNamedPipeServer(pipeName) {
        // On Windows, FFmpeg can read from a named pipe directly.
        // The native addon writes to the pipe, FFmpeg reads from it.
        // We just need to start FFmpeg pointing at the pipe path.
        return Promise.resolve();
    }
    startEncoding(options) {
        return new Promise((resolve, reject) => {
            const args = [
                '-y',
                '-f', 'rawvideo',
                '-pix_fmt', 'bgra',
                '-video_size', `${options.width}x${options.height}`,
                '-framerate', String(options.fps),
                '-i', options.pipeName,
                '-c:v', 'libx264',
                '-preset', 'ultrafast',
                '-crf', '23',
                '-pix_fmt', 'yuv420p',
                options.outputPath,
            ];
            this.process = (0, child_process_1.spawn)(this.ffmpegPath, args, {
                stdio: ['pipe', 'pipe', 'pipe'],
            });
            this.process.on('error', (err) => {
                reject(err);
            });
            // FFmpeg outputs progress to stderr
            this.process.stderr?.on('data', () => {
                // Could parse progress here if needed
            });
            // Give FFmpeg a moment to open the pipe
            setTimeout(resolve, 500);
        });
    }
    waitForFinish() {
        return new Promise((resolve, reject) => {
            if (!this.process) {
                resolve();
                return;
            }
            this.process.on('exit', (code) => {
                this.process = null;
                if (code === 0)
                    resolve();
                else
                    reject(new Error(`FFmpeg exited with code ${code}`));
            });
        });
    }
    async muxAudio(options) {
        const args = ['-y', '-i', options.videoPath];
        const hasSystem = options.systemAudioPath !== null;
        const hasMic = options.micAudioPath !== null;
        // Delay audio by 1s to compensate for video pipeline latency
        // (pipe connection + frame pool + encoding buffer)
        if (hasSystem)
            args.push('-itsoffset', '1.0', '-i', options.systemAudioPath);
        if (hasMic)
            args.push('-itsoffset', '1.0', '-i', options.micAudioPath);
        if (hasSystem && hasMic) {
            args.push('-filter_complex', '[1:a][2:a]amix=inputs=2:duration=longest[aout]', '-map', '0:v', '-map', '[aout]');
        }
        else if (hasSystem) {
            args.push('-map', '0:v', '-map', '1:a');
        }
        else if (hasMic) {
            args.push('-map', '0:v', '-map', '1:a');
        }
        else {
            args.push('-map', '0:v');
        }
        args.push('-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', options.outputPath);
        return new Promise((resolve, reject) => {
            const proc = (0, child_process_1.spawn)(this.ffmpegPath, args, { stdio: ['pipe', 'pipe', 'pipe'] });
            proc.on('error', reject);
            proc.on('exit', (code) => {
                if (code === 0)
                    resolve();
                else
                    reject(new Error(`FFmpeg mux exited with code ${code}`));
            });
        });
    }
}
exports.FFmpegEncoder = FFmpegEncoder;
