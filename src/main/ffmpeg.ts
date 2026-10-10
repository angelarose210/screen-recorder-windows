import { ChildProcess, spawn, execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { app } from 'electron';

function getFFmpegPath(): string {
  // Check bundled first
  const bundledPath = app.isPackaged
    ? path.join(process.resourcesPath, 'ffmpeg', 'ffmpeg.exe')
    : path.join(__dirname, '../../resources/ffmpeg/ffmpeg.exe');

  if (fs.existsSync(bundledPath)) return bundledPath;

  // Fall back to system FFmpeg
  try {
    const systemPath = execSync('where ffmpeg', { encoding: 'utf8' }).trim().split('\n')[0];
    if (systemPath && fs.existsSync(systemPath)) return systemPath;
  } catch {}

  return 'ffmpeg'; // hope it's on PATH
}

export class FFmpegEncoder {
  private process: ChildProcess | null = null;
  private ffmpegPath: string;

  constructor() {
    this.ffmpegPath = getFFmpegPath();
  }

  createNamedPipeServer(pipeName: string): Promise<void> {
    // On Windows, FFmpeg can read from a named pipe directly.
    // The native addon writes to the pipe, FFmpeg reads from it.
    // We just need to start FFmpeg pointing at the pipe path.
    return Promise.resolve();
  }

  startEncoding(options: {
    pipeName: string;
    width: number;
    height: number;
    fps: number;
    outputPath: string;
  }): Promise<void> {
    return new Promise((resolve, reject) => {
      const args = [
        '-y',
        '-f', 'rawvideo',
        '-pix_fmt', 'bgra',
        '-video_size', `${options.width}x${options.height}`,
        '-framerate', String(options.fps),
        '-i', options.pipeName,
        '-c:v', 'libx264',
        '-preset', 'ultrafast',
        '-crf', '23',
        '-pix_fmt', 'yuv420p',
        options.outputPath,
      ];

      this.process = spawn(this.ffmpegPath, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      this.process.on('error', (err) => {
        reject(err);
      });

      // FFmpeg outputs progress to stderr
      this.process.stderr?.on('data', () => {
        // Could parse progress here if needed
      });

      // Give FFmpeg a moment to open the pipe
      setTimeout(resolve, 500);
    });
  }

  waitForFinish(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.process) {
        resolve();
        return;
      }
      this.process.on('exit', (code) => {
        this.process = null;
        if (code === 0) resolve();
        else reject(new Error(`FFmpeg exited with code ${code}`));
      });
    });
  }

  async muxAudio(options: {
    videoPath: string;
    systemAudioPath: string | null;
    micAudioPath: string | null;
    outputPath: string;
    audioOffsetSec: number;
  }): Promise<void> {
    const args: string[] = ['-y', '-i', options.videoPath];

    const hasSystem = options.systemAudioPath !== null;
    const hasMic = options.micAudioPath !== null;

    // Video frames flow at a constant rate from the moment FFmpeg connects; audio starts
    // a little later. Shift audio by that measured gap so both share the same t=0.
    const offset = options.audioOffsetSec.toFixed(3);
    if (hasSystem) args.push('-itsoffset', offset, '-i', options.systemAudioPath!);
    if (hasMic) args.push('-itsoffset', offset, '-i', options.micAudioPath!);

    if (hasSystem && hasMic) {
      args.push(
        '-filter_complex', '[1:a][2:a]amix=inputs=2:duration=longest[aout]',
        '-map', '0:v',
        '-map', '[aout]',
      );
    } else if (hasSystem) {
      args.push('-map', '0:v', '-map', '1:a');
    } else if (hasMic) {
      args.push('-map', '0:v', '-map', '1:a');
    } else {
      args.push('-map', '0:v');
    }

    args.push(
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-shortest',
      options.outputPath,
    );

    return new Promise((resolve, reject) => {
      const proc = spawn(this.ffmpegPath, args, { stdio: ['pipe', 'pipe', 'pipe'] });
      proc.on('error', reject);
      proc.on('exit', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`FFmpeg mux exited with code ${code}`));
      });
    });
  }
}
