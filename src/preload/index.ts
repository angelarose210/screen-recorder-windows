import { contextBridge, ipcRenderer } from 'electron';

export interface RecorderAPI {
  getSources: () => Promise<any[]>;
  start: (config: any) => Promise<void>;
  startArea: (config: any) => Promise<boolean>;
  stop: () => Promise<{ outputPath: string; cursorLogPath: string; effectsApplied: boolean }>;
  getState: () => Promise<string>;
  setEffects: (config: any) => Promise<void>;
  onStateChange: (cb: (state: string) => void) => void;
  onTimer: (cb: (seconds: number) => void) => void;
  onGlobalShortcut: (cb: (action: string) => void) => void;
  onFinished: (cb: (result: { outputPath: string; cursorLogPath: string; effectsApplied: boolean }) => void) => void;
  openOutputFolder: () => Promise<void>;
  getSettings: () => Promise<any>;
  setSettings: (settings: any) => Promise<void>;
  selectOutputFolder: (kind?: 'videos' | 'screenshots') => Promise<string | null>;
  getFolders: () => Promise<{ videos: string; screenshots: string }>;
  openFolder: (kind: 'videos' | 'screenshots') => Promise<void>;
}

contextBridge.exposeInMainWorld('recorder', {
  getSources: () => ipcRenderer.invoke('recorder:get-sources'),
  start: (config: any) => ipcRenderer.invoke('recorder:start', config),
  startArea: (config: any) => ipcRenderer.invoke('recorder:start-area', config),
  stop: () => ipcRenderer.invoke('recorder:stop'),
  getState: () => ipcRenderer.invoke('recorder:get-state'),
  setEffects: (config: any) => ipcRenderer.invoke('recorder:set-effects', config),
  onStateChange: (cb: (state: string) => void) => {
    ipcRenderer.on('recorder:state-changed', (_event, state) => cb(state));
  },
  onTimer: (cb: (seconds: number) => void) => {
    ipcRenderer.on('recorder:timer', (_event, seconds) => cb(seconds));
  },
  onGlobalShortcut: (cb: (action: string) => void) => {
    ipcRenderer.on('global-shortcut', (_event, action) => cb(action));
  },
  onFinished: (cb: (result: { outputPath: string; cursorLogPath: string; effectsApplied: boolean }) => void) => {
    ipcRenderer.on('recorder:finished', (_event, result) => cb(result));
  },
  openOutputFolder: () => ipcRenderer.invoke('recorder:open-output'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (settings: any) => ipcRenderer.invoke('settings:set', settings),
  selectOutputFolder: (kind?: 'videos' | 'screenshots') => ipcRenderer.invoke('dialog:select-folder', kind),
  getFolders: () => ipcRenderer.invoke('folders:get'),
  openFolder: (kind: 'videos' | 'screenshots') => ipcRenderer.invoke('folders:open', kind),
} satisfies RecorderAPI);
