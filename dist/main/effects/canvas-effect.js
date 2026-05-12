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
exports.DEFAULT_CANVAS = void 0;
exports.applyCanvasEffect = applyCanvasEffect;
const child_process_1 = require("child_process");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
function getFFmpegPath() {
    const bundled = path.join(__dirname, '../../../resources/ffmpeg/ffmpeg.exe');
    if (fs.existsSync(bundled))
        return bundled;
    return 'ffmpeg';
}
exports.DEFAULT_CANVAS = {
    enabled: true,
    background: '#1a1a2e',
    padding: 48,
    borderRadius: 12,
    shadow: true,
    shadowBlur: 20,
    shadowOffsetX: 0,
    shadowOffsetY: 8,
    shadowColor: '#000000',
};
function applyCanvasEffect(options) {
    return new Promise((resolve, reject) => {
        const ffmpegPath = getFFmpegPath();
        const { inputVideo, outputVideo, width, height, canvas } = options;
        const pad = canvas.padding;
        const bgColor = canvas.background.replace('#', '');
        const outW = width + pad * 2;
        const outH = height + pad * 2;
        // Simple and fast: pad with background color + optional dark border for shadow effect
        let filterComplex;
        if (canvas.shadow) {
            // Simulate shadow with a dark border around the video before padding
            filterComplex = `[0:v]pad=${width + 4}:${height + 4}:2:2:color=0x000000@0.6,pad=${outW}:${outH}:${pad - 2}:${pad - 2}:color=0x${bgColor}[out]`;
        }
        else {
            filterComplex = `[0:v]pad=${outW}:${outH}:${pad}:${pad}:color=0x${bgColor}[out]`;
        }
        const args = [
            '-y',
            '-i', inputVideo,
            '-filter_complex', filterComplex,
            '-map', '[out]',
            '-map', '0:a?',
            '-c:v', 'libx264',
            '-preset', 'fast',
            '-crf', '20',
            '-pix_fmt', 'yuv420p',
            '-c:a', 'copy',
            outputVideo,
        ];
        const proc = (0, child_process_1.spawn)(ffmpegPath, args, { stdio: ['pipe', 'pipe', 'pipe'] });
        let stderr = '';
        proc.stderr?.on('data', d => { stderr += d.toString(); });
        proc.on('error', (err) => reject(err));
        proc.on('exit', (code) => {
            if (code === 0)
                resolve();
            else
                reject(new Error(`FFmpeg canvas failed (code ${code}): ${stderr.slice(-800)}`));
        });
    });
}
