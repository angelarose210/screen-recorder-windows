import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { app } from 'electron';

let cached: string | null = null;

// Installed builds ship ffmpeg.exe in resources/ffmpeg; dev uses the repo copy, then PATH
export function getFFmpegPath(): string {
  if (cached) return cached;
  const bundled = app.isPackaged
    ? path.join(process.resourcesPath, 'ffmpeg', 'ffmpeg.exe')
    : path.join(app.getAppPath(), 'resources', 'ffmpeg', 'ffmpeg.exe');
  if (fs.existsSync(bundled)) return (cached = bundled);

  try {
    const systemPath = execSync('where ffmpeg', { encoding: 'utf8' }).trim().split(/\r?\n/)[0];
    if (systemPath && fs.existsSync(systemPath)) return (cached = systemPath);
  } catch {}

  return 'ffmpeg';
}
