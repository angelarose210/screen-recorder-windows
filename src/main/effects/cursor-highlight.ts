import { spawn, spawnSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { CursorEvent } from './zoom-keyframes';

function getFFmpegPath(): string {
  const bundled = path.join(__dirname, '../../../resources/ffmpeg/ffmpeg.exe');
  if (fs.existsSync(bundled)) return bundled;
  return 'ffmpeg';
}

export interface CursorHighlightConfig {
  enabled: boolean;
  dotSize: number;        // radius in pixels
  dotColor: string;       // hex color
  dotOpacity: number;     // 0-1
  clickRipple: boolean;   // show expanding ring on click
  rippleColor: string;    // hex color
  rippleDuration: number; // seconds for ripple animation
}

export const DEFAULT_CURSOR_HIGHLIGHT: CursorHighlightConfig = {
  enabled: true,
  dotSize: 10,
  dotColor: '#ffcc00',
  dotOpacity: 0.7,
  clickRipple: true,
  rippleColor: '#ffcc00',
  rippleDuration: 0.4,
};

function generateCursorDot(size: number, color: string, opacity: number, outputPath: string): void {
  const ffmpegPath = getFFmpegPath();
  const hex = color.replace('#', '');
  const dim = size * 4;
  const alphaVal = Math.round(opacity * 255);

  const args = [
    '-y',
    '-f', 'lavfi',
    '-i', `color=c=0x${hex}:s=${dim}x${dim}:d=1,format=rgba,geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='if(lte(sqrt(pow(X-${dim / 2},2)+pow(Y-${dim / 2},2)),${size}),${alphaVal},0)'`,
    '-frames:v', '1',
    outputPath,
  ];

  const result = spawnSync(ffmpegPath, args, { stdio: ['pipe', 'pipe', 'pipe'] });
  if (result.status !== 0) {
    throw new Error(`Failed to generate cursor dot: ${result.stderr?.toString().slice(-300)}`);
  }
}

interface CursorKeypoint {
  frame: number;
  x: number;
  y: number;
}

function buildCursorKeypoints(cursorEvents: CursorEvent[], fps: number, duration: number): CursorKeypoint[] {
  const totalFrames = Math.ceil(duration * fps);
  const keypoints: CursorKeypoint[] = [];

  let eventIdx = 0;
  let lastX = cursorEvents[0]?.x ?? 0;
  let lastY = cursorEvents[0]?.y ?? 0;
  let prevKpX = -1;
  let prevKpY = -1;

  for (let frame = 0; frame < totalFrames; frame++) {
    const t = frame / fps;

    while (eventIdx < cursorEvents.length - 1 && cursorEvents[eventIdx + 1].t <= t) {
      eventIdx++;
    }
    if (eventIdx < cursorEvents.length) {
      lastX = cursorEvents[eventIdx].x;
      lastY = cursorEvents[eventIdx].y;
    }

    // Only add keypoint when position changes significantly or at boundaries
    const dx = Math.abs(lastX - prevKpX);
    const dy = Math.abs(lastY - prevKpY);
    if (frame === 0 || frame === totalFrames - 1 || dx > 5 || dy > 5) {
      keypoints.push({ frame, x: Math.round(lastX), y: Math.round(lastY) });
      prevKpX = lastX;
      prevKpY = lastY;
    }
  }

  return keypoints;
}

function buildOverlayExpr(keypoints: CursorKeypoint[], axis: 'x' | 'y', dotDim: number): string {
  if (keypoints.length === 0) return '0';
  if (keypoints.length === 1) {
    const val = axis === 'x' ? keypoints[0].x : keypoints[0].y;
    return `${val - dotDim / 2}`;
  }

  // Build piecewise linear expression using nested if(between(n,...))
  // Limit to ~50 segments to keep expression size manageable
  const maxSegments = 50;
  let sampled = keypoints;
  if (keypoints.length > maxSegments) {
    const step = Math.ceil(keypoints.length / maxSegments);
    sampled = keypoints.filter((_, i) => i % step === 0 || i === keypoints.length - 1);
  }

  const parts: string[] = [];
  for (let i = 0; i < sampled.length - 1; i++) {
    const kp = sampled[i];
    const next = sampled[i + 1];
    const dur = next.frame - kp.frame;
    if (dur <= 0) continue;

    const startVal = (axis === 'x' ? kp.x : kp.y) - dotDim / 2;
    const endVal = (axis === 'x' ? next.x : next.y) - dotDim / 2;

    const lerp = startVal === endVal
      ? `${startVal}`
      : `${startVal}+${((endVal - startVal) / dur).toFixed(2)}*(n-${kp.frame})`;

    parts.push(`if(between(n\\,${kp.frame}\\,${next.frame})\\,${lerp}\\,`);
  }

  if (parts.length === 0) {
    const val = (axis === 'x' ? keypoints[0].x : keypoints[0].y) - dotDim / 2;
    return `${val}`;
  }

  const defaultVal = (axis === 'x' ? sampled[sampled.length - 1].x : sampled[sampled.length - 1].y) - dotDim / 2;
  return parts.join('') + `${defaultVal}` + ')'.repeat(parts.length);
}

export function applyCursorHighlight(options: {
  inputVideo: string;
  outputVideo: string;
  width: number;
  height: number;
  fps: number;
  duration: number;
  cursorEvents: CursorEvent[];
  config: CursorHighlightConfig;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const ffmpegPath = getFFmpegPath();
    const { inputVideo, outputVideo, width, height, fps, duration, cursorEvents, config } = options;

    if (cursorEvents.length === 0) {
      fs.copyFileSync(inputVideo, outputVideo);
      resolve();
      return;
    }

    const tmpDir = path.join(os.tmpdir(), 'sr_cursor_' + Date.now());
    fs.mkdirSync(tmpDir, { recursive: true });

    const dotPath = path.join(tmpDir, 'dot.png');
    const dotDim = config.dotSize * 4;

    try {
      generateCursorDot(config.dotSize, config.dotColor, config.dotOpacity, dotPath);
    } catch (err) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      reject(err);
      return;
    }

    // Build cursor position keypoints and overlay expressions
    const keypoints = buildCursorKeypoints(cursorEvents, fps, duration);
    const xExpr = buildOverlayExpr(keypoints, 'x', dotDim);
    const yExpr = buildOverlayExpr(keypoints, 'y', dotDim);

    const filters: string[] = [];

    // Overlay cursor dot with position expressions
    filters.push(`[0:v][1:v]overlay=x='${xExpr}':y='${yExpr}':format=auto:shortest=1[cursor_out]`);

    // Add click ripple effects using drawbox with fixed alpha
    if (config.clickRipple) {
      const clicks = cursorEvents.filter(e => e.event === 'click');
      const rippleHex = config.rippleColor.replace('#', '');
      const rd = config.rippleDuration;
      const maxRipples = Math.min(clicks.length, 15);

      if (maxRipples > 0) {
        let lastLabel = 'cursor_out';

        for (let i = 0; i < maxRipples; i++) {
          const click = clicks[i];
          const startT = click.t;
          const endT = startT + rd;
          const cx = click.x;
          const cy = click.y;
          const boxSize = config.dotSize * 3;

          const label = `rip${i}`;
          // Simple highlight box around click position
          filters.push(
            `[${lastLabel}]drawbox=` +
            `x=${cx - boxSize}:` +
            `y=${cy - boxSize}:` +
            `w=${boxSize * 2}:` +
            `h=${boxSize * 2}:` +
            `color=0x${rippleHex}@0.4:` +
            `t=3:` +
            `enable='between(t\\,${startT.toFixed(3)}\\,${endT.toFixed(3)})'` +
            `[${label}]`
          );
          lastLabel = label;
        }

        filters.push(`[${lastLabel}]null[out]`);
      } else {
        filters.push(`[cursor_out]null[out]`);
      }
    } else {
      filters.push(`[cursor_out]null[out]`);
    }

    const filterComplex = filters.join(';');

    const args = [
      '-y',
      '-i', inputVideo,
      '-loop', '1', '-i', dotPath,
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

    proc.on('error', (err) => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      reject(err);
    });
    proc.on('exit', (code) => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg cursor highlight failed (code ${code}): ${stderr.slice(-800)}`));
    });
  });
}
