import { contextBridge, ipcRenderer } from 'electron';

export interface RecorderAPI {
  getSources: () => Promise<any[]>;
  start: (config: any) => Promise<void>;
  stop: () => Promise<{ outputPath: string; cursorLogPath: string; effectsApplied: boolean }>;
  getState: () => Promise<string>;
  setEffects: (config: any) => Promise<void>;
  onStateChange: (cb: (state: string) => void) => void;
  onTimer: (cb: (seconds: number) => void) => void;
  onGlobalShortcut: (cb: (action: string) => void) => void;
  openOutputFolder: () => Promise<void>;
  getSettings: () => Promise<any>;
  setSettings: (settings: any) => Promise<void>;
  selectOutputFolder: () => Promise<string | null>;
}

contextBridge.exposeInMainWorld('recorder', {
  getSources: () => ipcRenderer.invoke('recorder:get-sources'),
  start: (config: any) => ipcRenderer.invoke('recorder:start', config),
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
  openOutputFolder: () => ipcRenderer.invoke('recorder:open-output'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (settings: any) => ipcRenderer.invoke('settings:set', settings),
  selectOutputFolder: () => ipcRenderer.invoke('dialog:select-folder'),
} satisfies RecorderAPI);
