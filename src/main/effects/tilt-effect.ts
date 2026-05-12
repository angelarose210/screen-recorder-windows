import { CursorEvent } from './zoom-keyframes';

export interface TiltKeyframe {
  time: number;
  rotateX: number; // degrees, vertical tilt
  rotateY: number; // degrees, horizontal tilt
}

export interface TiltConfig {
  intensity: 'subtle' | 'medium' | 'dramatic';
  smoothing: number; // frames to smooth over (higher = smoother)
}

const INTENSITY_MAP = {
  subtle: { maxAngle: 1.5, perspective: 1500 },
  medium: { maxAngle: 3.0, perspective: 1000 },
  dramatic: { maxAngle: 5.0, perspective: 800 },
};

const DEFAULT_TILT_CONFIG: TiltConfig = {
  intensity: 'subtle',
  smoothing: 15,
};

export interface FrameTiltData {
  rotateX: number;
  rotateY: number;
  perspective: number;
}

export function generateTiltFrames(
  cursorEvents: CursorEvent[],
  fps: number,
  totalDuration: number,
  config: Partial<TiltConfig> = {}
): FrameTiltData[] {
  const cfg = { ...DEFAULT_TILT_CONFIG, ...config };
  const { maxAngle, perspective } = INTENSITY_MAP[cfg.intensity];
  const totalFrames = Math.ceil(totalDuration * fps);

  if (cursorEvents.length === 0) {
    return Array(totalFrames).fill({ rotateX: 0, rotateY: 0, perspective });
  }

  // Build per-frame cursor position by sampling events at frame times
  const rawTilts: Array<{ rotateX: number; rotateY: number }> = [];

  let eventIdx = 0;
  let lastX = cursorEvents[0].x;
  let lastY = cursorEvents[0].y;
  const screenW = cursorEvents[0].screen_w;
  const screenH = cursorEvents[0].screen_h;

  for (let frame = 0; frame < totalFrames; frame++) {
    const t = frame / fps;

    // Advance to the latest event at or before this frame time
    while (eventIdx < cursorEvents.length - 1 && cursorEvents[eventIdx + 1].t <= t) {
      eventIdx++;
    }

    if (eventIdx < cursorEvents.length) {
      lastX = cursorEvents[eventIdx].x;
      lastY = cursorEvents[eventIdx].y;
    }

    // Normalize cursor position to -1..1
    const nx = (lastX / screenW) * 2 - 1; // -1 (left) to 1 (right)
    const ny = (lastY / screenH) * 2 - 1; // -1 (top) to 1 (bottom)

    // Tilt opposite to cursor direction (parallax effect)
    rawTilts.push({
      rotateY: nx * maxAngle,   // cursor right → tilt left (positive rotateY)
      rotateX: -ny * maxAngle,  // cursor down → tilt up (negative rotateX)
    });
  }

  // Apply smoothing (moving average)
  const smoothed: FrameTiltData[] = [];
  const halfWindow = Math.floor(cfg.smoothing / 2);

  for (let i = 0; i < totalFrames; i++) {
    let sumX = 0;
    let sumY = 0;
    let count = 0;

    for (let j = Math.max(0, i - halfWindow); j <= Math.min(totalFrames - 1, i + halfWindow); j++) {
      sumX += rawTilts[j].rotateX;
      sumY += rawTilts[j].rotateY;
      count++;
    }

    smoothed.push({
      rotateX: sumX / count,
      rotateY: sumY / count,
      perspective,
    });
  }

  return smoothed;
}
