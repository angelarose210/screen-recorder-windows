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
exports.createSession = createSession;
exports.getOutputDir = getOutputDir;
exports.cleanupSession = cleanupSession;
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const electron_1 = require("electron");
const SESSIONS_DIR = path.join(process.env.LOCALAPPDATA || electron_1.app.getPath('userData'), 'ScreenRecorder', 'sessions');
function createSession(sessionId) {
    const sessionDir = path.join(SESSIONS_DIR, sessionId);
    fs.mkdirSync(sessionDir, { recursive: true });
    return {
        sessionDir,
        screenRaw: path.join(sessionDir, 'screen_raw.mp4'),
        micRaw: path.join(sessionDir, 'mic_raw.wav'),
        systemRaw: path.join(sessionDir, 'system_raw.wav'),
        cursorLog: path.join(sessionDir, 'cursor_events.json'),
        finalOutput: path.join(sessionDir, 'final.mp4'),
    };
}
function getOutputDir() {
    const dir = path.join(electron_1.app.getPath('videos'), 'ScreenRecorder');
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}
function cleanupSession(sessionDir) {
    try {
        fs.rmSync(sessionDir, { recursive: true, force: true });
    }
    catch { }
}
