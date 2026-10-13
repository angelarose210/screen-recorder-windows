import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('snip', {
  onImage: (cb: (dataUrl: string, opts: { mode: string; allowVideo: boolean; fx?: Record<string, unknown> }) => void) => {
    ipcRenderer.on('snip:image', (_event, url, opts) => cb(url, opts));
  },
  done: (rect: { x: number; y: number; width: number; height: number } | null, mode: string, fx: Record<string, unknown>) =>
    ipcRenderer.send('snip:done', rect, mode, fx),
  cancel: () => ipcRenderer.send('snip:cancel'),
});
