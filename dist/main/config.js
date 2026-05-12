"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSettings = getSettings;
exports.setSettings = setSettings;
const electron_store_1 = __importDefault(require("electron-store"));
const defaults = {
    fps: 30,
    outputDir: '',
    lastMode: 'quick',
    audioMicDefault: true,
    audioSystemDefault: true,
};
const store = new electron_store_1.default({ defaults });
function getSettings() {
    return {
        fps: store.get('fps'),
        outputDir: store.get('outputDir'),
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
