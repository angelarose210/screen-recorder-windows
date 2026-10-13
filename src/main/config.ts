import Store from 'electron-store';
import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

export interface EffectsSettings {
  zoom: { enabled: boolean; zoomLevel: number };
  tilt: { enabled: boolean; intensity: 'subtle' | 'medium' | 'dramatic' };
  canvas: { enabled: boolean; background: string; padding: number; borderRadius: number; shadow: boolean };
  cursor: { enabled: boolean; dotSize: number; dotColor: string; clickRipple: boolean };
}

type TiltIntensity = 'subtle' | 'medium' | 'dramatic';
const TILT_INTENSITIES: TiltIntensity[] = ['subtle', 'medium', 'dramatic'];

// What the capture overlay can change: on/off per effect plus the two values people tweak most
export type OverlayEffects = {
  zoom: boolean;
  tilt: boolean;
  canvas: boolean;
  cursor: boolean;
  zoomLevel: number;
  tiltIntensity: TiltIntensity;
};

const defaultEffects: EffectsSettings = {
  zoom: { enabled: true, zoomLevel: 1.5 },
  tilt: { enabled: true, intensity: 'subtle' },
  canvas: { enabled: true, background: '#1a1a2e', padding: 48, borderRadius: 12, shadow: true },
  cursor: { enabled: true, dotSize: 10, dotColor: '#ffcc00', clickRipple: true },
};

export interface AppSettings {
  fps: 30 | 60;
  outputDir: string;
  screenshotDir: string;
  lastMode: 'quick' | 'polished';
  audioMicDefault: boolean;
  audioSystemDefault: boolean;
  effects: EffectsSettings;
}

const defaults: AppSettings = {
  fps: 30,
  outputDir: '',
  screenshotDir: '',
  lastMode: 'quick',
  audioMicDefault: true,
  audioSystemDefault: true,
  effects: defaultEffects,
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
    effects: loadEffects(),
  };
}

// Effects survive restarts and apply no matter where a recording is started from
export function loadEffects(): EffectsSettings {
  const saved = store.get('effects') ?? defaultEffects;
  return {
    zoom: { ...defaultEffects.zoom, ...saved.zoom },
    tilt: { ...defaultEffects.tilt, ...saved.tilt },
    canvas: { ...defaultEffects.canvas, ...saved.canvas },
    cursor: { ...defaultEffects.cursor, ...saved.cursor },
  };
}

export function saveEffects(effects: EffectsSettings): void {
  store.set('effects', effects);
}

export function overlayEffects(e: EffectsSettings): OverlayEffects {
  return {
    zoom: e.zoom.enabled,
    tilt: e.tilt.enabled,
    canvas: e.canvas.enabled,
    cursor: e.cursor.enabled,
    zoomLevel: e.zoom.zoomLevel,
    tiltIntensity: e.tilt.intensity,
  };
}

export function withOverlayEffects(e: EffectsSettings, t: OverlayEffects): EffectsSettings {
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

export function setSettings(partial: Partial<AppSettings>): void {
  for (const [key, value] of Object.entries(partial)) {
    store.set(key as keyof AppSettings, value);
  }
}

// Default save location: an existing E:\Screen Captures (this PC), else the home folder. Never OneDrive.
// Not "any E: drive": on other PCs E: is often a USB stick or DVD drive.
function defaultRoot(): string {
  if (fs.existsSync('E:\\Screen Captures')) return 'E:\\Screen Captures';
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
