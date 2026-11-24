import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('trimmer', {
  getInfo: () => ipcRenderer.invoke('trim:get-info'),
  exportClip: (opts: { start: number; end: number; replace: boolean }) => ipcRenderer.invoke('trim:export', opts),
  showInFolder: (filePath: string) => ipcRenderer.invoke('trim:show-in-folder', filePath),
  onProgress: (cb: (fraction: number) => void) => {
    ipcRenderer.on('trim:progress', (_event, fraction) => cb(fraction));
  },
});
