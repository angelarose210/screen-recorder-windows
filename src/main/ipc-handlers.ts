import { ipcMain, dialog, shell, BrowserWindow } from 'electron';
import { Recorder } from './recorder';
import { getSettings, setSettings } from './config';
import { getOutputDir } from './session';

const recorder = new Recorder();

export function registerIpcHandlers(mainWindow: BrowserWindow) {
  recorder.on('state-changed', (state: string) => {
    mainWindow.webContents.send('recorder:state-changed', state);
  });

  recorder.on('timer', (seconds: number) => {
    mainWindow.webContents.send('recorder:timer', seconds);
  });

  ipcMain.handle('recorder:get-sources', () => {
    return recorder.getSources();
  });

  ipcMain.handle('recorder:start', async (_event, config) => {
    const settings = getSettings();
    await recorder.start({
      ...config,
      fps: config.fps || settings.fps,
      outputDir: settings.outputDir || getOutputDir(),
    });
  });

  ipcMain.handle('recorder:stop', async () => {
    return await recorder.stop();
  });

  ipcMain.handle('recorder:get-state', () => {
    return recorder.getState();
  });

  ipcMain.handle('recorder:set-effects', (_event, config) => {
    recorder.setEffectsConfig(config);
  });

  ipcMain.handle('recorder:open-output', async () => {
    const settings = getSettings();
    const dir = settings.outputDir || getOutputDir();
    await shell.openPath(dir);
  });

  ipcMain.handle('settings:get', () => {
    return getSettings();
  });

  ipcMain.handle('settings:set', (_event, partial) => {
    setSettings(partial);
  });

  ipcMain.handle('dialog:select-folder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const dir = result.filePaths[0];
    setSettings({ outputDir: dir });
    return dir;
  });
}
