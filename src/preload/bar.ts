import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('bar', {
  onState: (cb: (state: string) => void) => {
    ipcRenderer.on('bar:state', (_event, state) => cb(state));
  },
  onTimer: (cb: (seconds: number) => void) => {
    ipcRenderer.on('bar:timer', (_event, seconds) => cb(seconds));
  },
  stop: () => ipcRenderer.send('bar:stop'),
});
