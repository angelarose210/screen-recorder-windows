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
exports.getSettings = getSettings;
exports.loadEffects = loadEffects;
exports.saveEffects = saveEffects;
exports.overlayEffects = overlayEffects;
exports.withOverlayEffects = withOverlayEffects;
exports.setSettings = setSettings;
exports.getVideosDir = getVideosDir;
exports.getScreenshotsDir = getScreenshotsDir;
const electron_store_1 = __importDefault(require("electron-store"));
const electron_1 = require("electron");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const TILT_INTENSITIES = ['subtle', 'medium', 'dramatic'];
const defaultEffects = {
    zoom: { enabled: true, zoomLevel: 1.5 },
    tilt: { enabled: true, intensity: 'subtle' },
    canvas: { enabled: true, background: '#1a1a2e', padding: 48, borderRadius: 12, shadow: true },
    cursor: { enabled: true, dotSize: 10, dotColor: '#ffcc00', clickRipple: true },
};
const defaults = {
    fps: 30,
    outputDir: '',
    screenshotDir: '',
    lastMode: 'quick',
    audioMicDefault: true,
    audioSystemDefault: true,
    startAtLogin: true,
    effects: defaultEffects,
};
const store = new electron_store_1.default({ defaults });
function getSettings() {
    return {
        fps: store.get('fps'),
        outputDir: store.get('outputDir'),
        screenshotDir: store.get('screenshotDir'),
        lastMode: store.get('lastMode'),
        audioMicDefault: store.get('audioMicDefault'),
        audioSystemDefault: store.get('audioSystemDefault'),
        startAtLogin: store.get('startAtLogin'),
        effects: loadEffects(),
    };
}
// Effects survive restarts and apply no matter where a recording is started from
function loadEffects() {
    const saved = store.get('effects') ?? defaultEffects;
    return {
        zoom: { ...defaultEffects.zoom, ...saved.zoom },
        tilt: { ...defaultEffects.tilt, ...saved.tilt },
        canvas: { ...defaultEffects.canvas, ...saved.canvas },
        cursor: { ...defaultEffects.cursor, ...saved.cursor },
    };
}
function saveEffects(effects) {
    store.set('effects', effects);
}
function overlayEffects(e) {
    return {
        zoom: e.zoom.enabled,
        tilt: e.tilt.enabled,
        canvas: e.canvas.enabled,
        cursor: e.cursor.enabled,
        zoomLevel: e.zoom.zoomLevel,
        tiltIntensity: e.tilt.intensity,
    };
}
function withOverlayEffects(e, t) {
    return {
        zoom: {
            ...e.zoom,
            enabled: !!t.zoom,
            // Same range as the main window slider
            zoomLevel: Number.isFinite(t.zoomLevel) ? Math.min(3, Math.max(1.2, Math.round(t.zoomLevel * 10) / 10)) : e.zoom.zoomLevel,
        },
        tilt: {
            ...e.tilt,
            enabled: !!t.tilt,
            intensity: TILT_INTENSITIES.includes(t.tiltIntensity) ? t.tiltIntensity : e.tilt.intensity,
        },
        canvas: { ...e.canvas, enabled: !!t.canvas },
        cursor: { ...e.cursor, enabled: !!t.cursor },
    };
}
function setSettings(partial) {
    for (const [key, value] of Object.entries(partial)) {
        store.set(key, value);
    }
}
// Default save location: an existing E:\Screen Captures (this PC), else the home folder. Never OneDrive.
// Not "any E: drive": on other PCs E: is often a USB stick or DVD drive.
function defaultRoot() {
    if (fs.existsSync('E:\\Screen Captures'))
        return 'E:\\Screen Captures';
    return path.join(electron_1.app.getPath('home'), 'Screen Captures');
}
function ensureDir(dir) {
    fs.mkdirSync(dir, { recursive: true });
    return dir;
}
function getVideosDir() {
    return ensureDir(store.get('outputDir') || path.join(defaultRoot(), 'Videos'));
}
function getScreenshotsDir() {
    return ensureDir(store.get('screenshotDir') || path.join(defaultRoot(), 'Screenshots'));
}
