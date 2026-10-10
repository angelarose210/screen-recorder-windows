import { ipcMain, dialog, shell, BrowserWindow, screen } from 'electron';
import { Recorder } from './recorder';
import { getSettings, setSettings, getVideosDir, getScreenshotsDir } from './config';
import { showRecordBar, updateRecordBar, closeRecordBar } from './record-bar';
import { pickRegion } from './snip';

const recorder = new Recorder();

export function registerIpcHandlers(mainWindow: BrowserWindow) {
  let restoreMainWindow = false;

  recorder.on('state-changed', (state: string) => {
    mainWindow.webContents.send('recorder:state-changed', state);
    updateRecordBar('state', state);
  });

  recorder.on('timer', (seconds: number) => {
    mainWindow.webContents.send('recorder:timer', seconds);
    updateRecordBar('timer', seconds);
  });

  // Stop from any entry point (main window, floating bar, hotkey); result goes to the renderer
  const stopRecording = async () => {
    if (recorder.getState() !== 'recording') return null;
    try {
      const result = await recorder.stop();
      mainWindow.webContents.send('recorder:finished', result);
      return result;
    } finally {
      closeRecordBar();
      if (restoreMainWindow) {
        mainWindow.showInactive();
        restoreMainWindow = false;
      }
    }
  };

  ipcMain.handle('recorder:get-sources', () => {
    return recorder.getSources();
  });

  ipcMain.handle('recorder:start', async (_event, config) => {
    restoreMainWindow = mainWindow.isVisible() && !mainWindow.isMinimized();
    await startRecording(config);
  });

  // Drag a box (same picker as screenshots), then record just that box
  ipcMain.handle('recorder:start-area', async (_event, config) => {
    if (recorder.getState() !== 'idle') return false;
    restoreMainWindow = mainWindow.isVisible() && !mainWindow.isMinimized();
    const picked = await pickRegion('Drag the area to record &middot; click for full screen &middot; Esc to cancel', mainWindow);
    if (!picked) {
      if (restoreMainWindow) mainWindow.show();
      restoreMainWindow = false;
      return false;
    }

    // Match Electron's display to the native monitor source by its physical top-left corner
    const corner = screen.dipToScreenPoint({ x: picked.display.bounds.x, y: picked.display.bounds.y });
    const monitors = recorder.getSources().filter((s: any) => s.type === 'monitor');
    const monitor = monitors.find((s: any) => Math.abs(s.x - corner.x) <= 2 && Math.abs(s.y - corner.y) <= 2) ?? monitors[0];
    if (!monitor) throw new Error('No monitor found');

    const tooSmall = !!picked.rect && (picked.rect.width < 16 || picked.rect.height < 16);
    await startRecording({ ...config, sourceId: monitor.id, region: tooSmall ? undefined : picked.rect ?? undefined });
    return true;
  });

  // Get the full window out of the way; the floating bar (hidden from capture) takes over
  const startRecording = async (config: any) => {
    const settings = getSettings();
    mainWindow.hide();
    showRecordBar(() => { stopRecording(); });
    await new Promise((r) => setTimeout(r, 250)); // let the hide finish before frames flow

    try {
      await recorder.start({
        ...config,
        fps: config.fps || settings.fps,
        outputDir: getVideosDir(),
      });
    } catch (err) {
      closeRecordBar();
      if (restoreMainWindow) mainWindow.show();
      restoreMainWindow = false;
      throw err;
    }
  };

  ipcMain.handle('recorder:stop', async () => {
    return await stopRecording();
  });

  ipcMain.handle('recorder:get-state', () => {
    return recorder.getState();
  });

  ipcMain.handle('recorder:set-effects', (_event, config) => {
    recorder.setEffectsConfig(config);
  });

  ipcMain.handle('recorder:open-output', async () => {
    await shell.openPath(getVideosDir());
  });

  ipcMain.handle('folders:get', () => ({
    videos: getVideosDir(),
    screenshots: getScreenshotsDir(),
  }));

  ipcMain.handle('folders:open', async (_event, kind: 'videos' | 'screenshots') => {
    await shell.openPath(kind === 'videos' ? getVideosDir() : getScreenshotsDir());
  });

  ipcMain.handle('settings:get', () => {
    return getSettings();
  });

  ipcMain.handle('settings:set', (_event, partial) => {
    setSettings(partial);
  });

  ipcMain.handle('dialog:select-folder', async (_event, kind: 'videos' | 'screenshots' = 'videos') => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: kind === 'videos' ? 'Save recordings to' : 'Save screenshots to',
      defaultPath: kind === 'videos' ? getVideosDir() : getScreenshotsDir(),
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const dir = result.filePaths[0];
    setSettings(kind === 'videos' ? { outputDir: dir } : { screenshotDir: dir });
    return dir;
  });
}
