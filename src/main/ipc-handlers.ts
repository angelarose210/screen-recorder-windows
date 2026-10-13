import { ipcMain, dialog, shell, BrowserWindow, screen } from 'electron';
import { Recorder } from './recorder';
import { getSettings, setSettings, getVideosDir, getScreenshotsDir, loadEffects, saveEffects, overlayEffects, withOverlayEffects } from './config';
import { showRecordBar, updateRecordBar, closeRecordBar, showRegionOutline } from './record-bar';
import { CaptureMode, pickRegion, saveImage } from './snip';

const recorder = new Recorder();

// One capture overlay for every entry point (tray, hotkeys, jump list, main window)
let captureImpl: ((mode: CaptureMode, config?: any) => Promise<boolean>) | null = null;
let lastMode: CaptureMode = 'screenshot';

// mode omitted = whichever mode was used last
export function openCapture(mode?: CaptureMode): Promise<boolean> {
  if (!captureImpl) return Promise.resolve(false);
  return captureImpl(mode ?? lastMode).catch((err) => {
    console.error('Capture failed:', err);
    return false;
  });
}

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
    audioPrefs = { audioMic: !!config?.audioMic, audioSystem: !!config?.audioSystem };
    restoreMainWindow = mainWindow.isVisible() && !mainWindow.isMinimized();
    await startRecording(config);
  });

  // Drag a box (same picker as screenshots), then record just that box
  // Mic/system audio picks from the main window, reused when recording from the tray
  const initial = getSettings();
  recorder.setEffectsConfig(loadEffects());
  let audioPrefs = { audioMic: initial.audioMicDefault, audioSystem: initial.audioSystemDefault };

  captureImpl = async (initialMode, config) => {
    const idle = recorder.getState() === 'idle';
    const wasVisible = mainWindow.isVisible() && !mainWindow.isMinimized();
    const picked = await pickRegion({ mode: initialMode, allowVideo: idle, fx: overlayEffects(loadEffects()) }, mainWindow);
    if (!picked) {
      if (wasVisible) mainWindow.show();
      return false;
    }
    lastMode = picked.mode;

    if (picked.mode === 'screenshot') {
      saveImage(picked.rect ? picked.image.crop(picked.rect) : picked.image);
      if (wasVisible) mainWindow.showInactive();
      return false;
    }

    // Effect chips in the overlay update the saved settings (and the main window's checkboxes)
    if (picked.fx) {
      const effects = withOverlayEffects(loadEffects(), picked.fx);
      saveEffects(effects);
      recorder.setEffectsConfig(effects);
      mainWindow.webContents.send('effects:changed', effects);
    }

    // Match Electron's display to the native monitor source by its physical top-left corner
    const corner = screen.dipToScreenPoint({ x: picked.display.bounds.x, y: picked.display.bounds.y });
    const monitors = recorder.getSources().filter((s: any) => s.type === 'monitor');
    const monitor = monitors.find((s: any) => Math.abs(s.x - corner.x) <= 2 && Math.abs(s.y - corner.y) <= 2) ?? monitors[0];
    if (!monitor) throw new Error('No monitor found');

    restoreMainWindow = wasVisible;
    const tooSmall = !!picked.rect && (picked.rect.width < 16 || picked.rect.height < 16);
    const region = tooSmall ? undefined : picked.rect ?? undefined;
    await startRecording({
      fps: 30,
      ...audioPrefs,
      ...config,
      sourceId: monitor.id,
      region,
    });
    if (region && recorder.getState() !== 'idle') {
      // region is physical px relative to the display; the outline window wants DIP screen coords
      const { bounds, scaleFactor: sf } = picked.display;
      showRegionOutline({
        x: bounds.x + region.x / sf,
        y: bounds.y + region.y / sf,
        width: region.width / sf,
        height: region.height / sf,
      });
    }
    return true;
  };

  ipcMain.handle('recorder:start-area', async (_event, config) => {
    if (recorder.getState() !== 'idle') return false;
    audioPrefs = { audioMic: !!config?.audioMic, audioSystem: !!config?.audioSystem };
    return captureImpl!('video', config);
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
    saveEffects(config);
    recorder.setEffectsConfig(config);
  });

  ipcMain.handle('effects:get', () => loadEffects());

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
