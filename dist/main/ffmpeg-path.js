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
exports.getFFmpegPath = getFFmpegPath;
const child_process_1 = require("child_process");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const electron_1 = require("electron");
let cached = null;
// Installed builds ship ffmpeg.exe in resources/ffmpeg; dev uses the repo copy, then PATH
function getFFmpegPath() {
    if (cached)
        return cached;
    const bundled = electron_1.app.isPackaged
        ? path.join(process.resourcesPath, 'ffmpeg', 'ffmpeg.exe')
        : path.join(electron_1.app.getAppPath(), 'resources', 'ffmpeg', 'ffmpeg.exe');
    if (fs.existsSync(bundled))
        return (cached = bundled);
    try {
        const systemPath = (0, child_process_1.execSync)('where ffmpeg', { encoding: 'utf8' }).trim().split(/\r?\n/)[0];
        if (systemPath && fs.existsSync(systemPath))
            return (cached = systemPath);
    }
    catch { }
    return 'ffmpeg';
}
