import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('snip', {
  onImage: (cb: (dataUrl: string, hint: string) => void) => {
    ipcRenderer.on('snip:image', (_event, url, hint) => cb(url, hint));
  },
  done: (rect: { x: number; y: number; width: number; height: number } | null) => ipcRenderer.send('snip:done', rect),
  cancel: () => ipcRenderer.send('snip:cancel'),
});
