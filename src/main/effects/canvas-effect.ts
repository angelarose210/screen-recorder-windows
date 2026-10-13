import { spawn, spawnSync } from 'child_process';
import * as path from 'path';
import { getFFmpegPath } from '../ffmpeg-path';
import * as fs from 'fs';
import * as os from 'os';


export interface CanvasConfig {
  enabled: boolean;
  background: string;
  padding: number;
  borderRadius: number;
  shadow: boolean;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  shadowColor: string;
}

export const DEFAULT_CANVAS: CanvasConfig = {
  enabled: true,
  background: '#1a1a2e',
  padding: 48,
  borderRadius: 12,
  shadow: true,
  shadowBlur: 20,
  shadowOffsetX: 0,
  shadowOffsetY: 8,
  shadowColor: '#000000',
};

export function applyCanvasEffect(options: {
  inputVideo: string;
  outputVideo: string;
  width: number;
  height: number;
  fps: number;
  canvas: CanvasConfig;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const ffmpegPath = getFFmpegPath();
    const { inputVideo, outputVideo, width, height, canvas } = options;

    const pad = canvas.padding;
    const bgColor = canvas.background.replace('#', '');
    const outW = width + pad * 2;
    const outH = height + pad * 2;

    // Simple and fast: pad with background color + optional dark border for shadow effect
    let filterComplex: string;

    if (canvas.shadow) {
      // Simulate shadow with a dark border around the video before padding
      filterComplex = `[0:v]pad=${width + 4}:${height + 4}:2:2:color=0x000000@0.6,pad=${outW}:${outH}:${pad - 2}:${pad - 2}:color=0x${bgColor}[out]`;
    } else {
      filterComplex = `[0:v]pad=${outW}:${outH}:${pad}:${pad}:color=0x${bgColor}[out]`;
    }

    const args = [
      '-y',
      '-i', inputVideo,
      '-filter_complex', filterComplex,
      '-map', '[out]',
      '-map', '0:a?',
      '-c:v', 'libx264',
      '-preset', 'fast',
      '-crf', '20',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'copy',
      outputVideo,
    ];

    const proc = spawn(ffmpegPath, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr?.on('data', d => { stderr += d.toString(); });

    proc.on('error', (err) => reject(err));
    proc.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg canvas failed (code ${code}): ${stderr.slice(-800)}`));
    });
  });
}
