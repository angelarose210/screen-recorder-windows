import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('snip', {
  onImage: (cb: (dataUrl: string, opts: { mode: string; allowVideo: boolean; fx?: Record<string, unknown> }) => void) => {
    ipcRenderer.on('snip:image', (_event, url, opts) => cb(url, opts));
  },
  onSwap: (cb: (dataUrl: string) => void) => {
    ipcRenderer.on('snip:swap', (_event, url) => cb(url));
  },
  drag: (d: boolean) => ipcRenderer.send('snip:drag', d),
  done: (rect: { x: number; y: number; width: number; height: number } | null, mode: string, fx: Record<string, unknown>) =>
    ipcRenderer.send('snip:done', rect, mode, fx),
  cancel: () => ipcRenderer.send('snip:cancel'),
});
