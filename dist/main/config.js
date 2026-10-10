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
exports.setSettings = setSettings;
exports.getVideosDir = getVideosDir;
exports.getScreenshotsDir = getScreenshotsDir;
const electron_store_1 = __importDefault(require("electron-store"));
const electron_1 = require("electron");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const defaults = {
    fps: 30,
    outputDir: '',
    screenshotDir: '',
    lastMode: 'quick',
    audioMicDefault: true,
    audioSystemDefault: true,
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
    };
}
function setSettings(partial) {
    for (const [key, value] of Object.entries(partial)) {
        store.set(key, value);
    }
}
// Default save location: the local E: data drive if present, never OneDrive
function defaultRoot() {
    if (fs.existsSync('E:\\'))
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
