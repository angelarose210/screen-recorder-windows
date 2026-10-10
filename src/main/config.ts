import Store from 'electron-store';
import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

export interface AppSettings {
  fps: 30 | 60;
  outputDir: string;
  screenshotDir: string;
  lastMode: 'quick' | 'polished';
  audioMicDefault: boolean;
  audioSystemDefault: boolean;
}

const defaults: AppSettings = {
  fps: 30,
  outputDir: '',
  screenshotDir: '',
  lastMode: 'quick',
  audioMicDefault: true,
  audioSystemDefault: true,
};

const store = new Store<AppSettings>({ defaults });

export function getSettings(): AppSettings {
  return {
    fps: store.get('fps'),
    outputDir: store.get('outputDir'),
    screenshotDir: store.get('screenshotDir'),
    lastMode: store.get('lastMode'),
    audioMicDefault: store.get('audioMicDefault'),
    audioSystemDefault: store.get('audioSystemDefault'),
  };
}

export function setSettings(partial: Partial<AppSettings>): void {
  for (const [key, value] of Object.entries(partial)) {
    store.set(key as keyof AppSettings, value);
  }
}

// Default save location: the local E: data drive if present, never OneDrive
function defaultRoot(): string {
  if (fs.existsSync('E:\\')) return 'E:\\Screen Captures';
  return path.join(app.getPath('home'), 'Screen Captures');
}

function ensureDir(dir: string): string {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function getVideosDir(): string {
  return ensureDir(store.get('outputDir') || path.join(defaultRoot(), 'Videos'));
}

export function getScreenshotsDir(): string {
  return ensureDir(store.get('screenshotDir') || path.join(defaultRoot(), 'Screenshots'));
}
