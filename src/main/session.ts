import * as path from 'path';
import * as fs from 'fs';
import { app } from 'electron';
import { getVideosDir } from './config';

const SESSIONS_DIR = path.join(
  process.env.LOCALAPPDATA || app.getPath('userData'),
  'ScreenRecorder',
  'sessions'
);

export interface SessionPaths {
  sessionDir: string;
  screenRaw: string;
  micRaw: string;
  systemRaw: string;
  cursorLog: string;
  finalOutput: string;
}

export function createSession(sessionId: string): SessionPaths {
  const sessionDir = path.join(SESSIONS_DIR, sessionId);
  fs.mkdirSync(sessionDir, { recursive: true });

  return {
    sessionDir,
    screenRaw: path.join(sessionDir, 'screen_raw.mp4'),
    micRaw: path.join(sessionDir, 'mic_raw.wav'),
    systemRaw: path.join(sessionDir, 'system_raw.wav'),
    cursorLog: path.join(sessionDir, 'cursor_events.json'),
    finalOutput: path.join(sessionDir, 'final.mp4'),
  };
}

export function getOutputDir(): string {
  return getVideosDir();
}

export function cleanupSession(sessionDir: string): void {
  try {
    fs.rmSync(sessionDir, { recursive: true, force: true });
  } catch {}
}
