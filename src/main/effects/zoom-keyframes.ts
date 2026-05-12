import * as fs from 'fs';

export interface CursorEvent {
  t: number;
  x: number;
  y: number;
  event: string;
  button?: string;
  delta?: number;
  screen_w: number;
  screen_h: number;
}

export interface ZoomKeyframe {
  time: number;       // seconds
  zoom: number;       // 1.0 = no zoom, 2.0 = 2x zoom
  centerX: number;    // 0-1 normalized
  centerY: number;    // 0-1 normalized
}

export interface ZoomConfig {
  zoomLevel: number;       // target zoom (1.2 - 3.0)
  zoomInDuration: number;  // seconds to zoom in (0.3 - 0.8)
  holdDuration: number;    // seconds to hold zoom (0.5 - 2.0)
  zoomOutDuration: number; // seconds to zoom out (0.3 - 0.8)
  minTimeBetweenZooms: number; // minimum gap between zoom events
}

const DEFAULT_CONFIG: ZoomConfig = {
  zoomLevel: 1.5,
  zoomInDuration: 0.4,
  holdDuration: 0.8,
  zoomOutDuration: 0.5,
  minTimeBetweenZooms: 1.5,
};

function easeInOutCubic(t: number): number {
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export function generateZoomKeyframes(
  cursorEvents: CursorEvent[],
  config: Partial<ZoomConfig> = {}
): ZoomKeyframe[] {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const clicks = cursorEvents.filter(e => e.event === 'click');

  if (clicks.length === 0) return [];

  const keyframes: ZoomKeyframe[] = [];
  let lastZoomEnd = -Infinity;

  for (const click of clicks) {
    if (click.t - lastZoomEnd < cfg.minTimeBetweenZooms) continue;

    const cx = click.x / click.screen_w;
    const cy = click.y / click.screen_h;

    const zoomStart = click.t;
    const holdStart = zoomStart + cfg.zoomInDuration;
    const zoomOutStart = holdStart + cfg.holdDuration;
    const zoomEnd = zoomOutStart + cfg.zoomOutDuration;

    // Keyframe just before zoom (ensure we're at 1.0)
    if (keyframes.length === 0 || keyframes[keyframes.length - 1].time < zoomStart - 0.01) {
      keyframes.push({ time: zoomStart, zoom: 1.0, centerX: cx, centerY: cy });
    }

    // Zoom in complete
    keyframes.push({ time: holdStart, zoom: cfg.zoomLevel, centerX: cx, centerY: cy });

    // Hold end (still zoomed)
    keyframes.push({ time: zoomOutStart, zoom: cfg.zoomLevel, centerX: cx, centerY: cy });

    // Zoom out complete
    keyframes.push({ time: zoomEnd, zoom: 1.0, centerX: cx, centerY: cy });

    lastZoomEnd = zoomEnd;
  }

  return keyframes;
}

export interface FrameZoomData {
  zoom: number;
  centerX: number;
  centerY: number;
}

export function interpolateKeyframes(
  keyframes: ZoomKeyframe[],
  fps: number,
  totalDuration: number
): FrameZoomData[] {
  const totalFrames = Math.ceil(totalDuration * fps);
  const frames: FrameZoomData[] = [];

  if (keyframes.length === 0) {
    for (let i = 0; i < totalFrames; i++) {
      frames.push({ zoom: 1.0, centerX: 0.5, centerY: 0.5 });
    }
    return frames;
  }

  for (let frame = 0; frame < totalFrames; frame++) {
    const t = frame / fps;

    // Find surrounding keyframes
    let kfBefore = keyframes[0];
    let kfAfter = keyframes[keyframes.length - 1];

    for (let i = 0; i < keyframes.length - 1; i++) {
      if (keyframes[i].time <= t && keyframes[i + 1].time >= t) {
        kfBefore = keyframes[i];
        kfAfter = keyframes[i + 1];
        break;
      }
    }

    if (t <= keyframes[0].time) {
      frames.push({ zoom: 1.0, centerX: keyframes[0].centerX, centerY: keyframes[0].centerY });
      continue;
    }

    if (t >= keyframes[keyframes.length - 1].time) {
      frames.push({ zoom: 1.0, centerX: kfAfter.centerX, centerY: kfAfter.centerY });
      continue;
    }

    const segmentDuration = kfAfter.time - kfBefore.time;
    const progress = segmentDuration > 0 ? (t - kfBefore.time) / segmentDuration : 0;
    const eased = easeInOutCubic(Math.max(0, Math.min(1, progress)));

    frames.push({
      zoom: kfBefore.zoom + (kfAfter.zoom - kfBefore.zoom) * eased,
      centerX: kfBefore.centerX + (kfAfter.centerX - kfBefore.centerX) * eased,
      centerY: kfBefore.centerY + (kfAfter.centerY - kfBefore.centerY) * eased,
    });
  }

  return frames;
}

export function loadCursorEvents(filePath: string): CursorEvent[] {
  const data = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(data);
}
