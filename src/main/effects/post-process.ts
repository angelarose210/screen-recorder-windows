import * as path from 'path';
import * as fs from 'fs';
import { loadCursorEvents, generateZoomKeyframes, interpolateKeyframes, ZoomConfig, FrameZoomData } from './zoom-keyframes';
import { generateTiltFrames, TiltConfig, FrameTiltData } from './tilt-effect';
import { applyEffects, applySimpleZoom } from './effects-renderer';
import { applyCanvasEffect, CanvasConfig, DEFAULT_CANVAS } from './canvas-effect';
import { applyCursorHighlight, CursorHighlightConfig, DEFAULT_CURSOR_HIGHLIGHT } from './cursor-highlight';

export interface PostProcessConfig {
  zoom?: Partial<ZoomConfig> & { enabled?: boolean };
  tilt?: Partial<TiltConfig> & { enabled?: boolean };
  canvas?: Partial<CanvasConfig>;
  cursor?: Partial<CursorHighlightConfig>;
  background?: string;
}

const DEFAULT_POST_PROCESS: PostProcessConfig = {
  zoom: { enabled: true },
  tilt: { enabled: true },
  canvas: { enabled: true },
  cursor: { enabled: true },
  background: undefined,
};

export interface PostProcessResult {
  outputPath: string;
  hasZoom: boolean;
  hasTilt: boolean;
  hasCanvas: boolean;
  hasCursor: boolean;
}

export async function postProcessRecording(options: {
  rawVideoPath: string;
  cursorLogPath: string;
  outputPath: string;
  width: number;
  height: number;
  fps: number;
  duration: number;
  config?: PostProcessConfig;
}): Promise<PostProcessResult> {
  const { rawVideoPath, cursorLogPath, outputPath, width, height, fps, duration } = options;
  const config = { ...DEFAULT_POST_PROCESS, ...options.config };

  const canvasConfig: CanvasConfig = { ...DEFAULT_CANVAS, ...config.canvas };
  const canvasEnabled = canvasConfig.enabled;

  if (!fs.existsSync(cursorLogPath)) {
    if (canvasEnabled) {
      await applyCanvasEffect({
        inputVideo: rawVideoPath,
        outputVideo: outputPath,
        width,
        height,
        fps,
        canvas: canvasConfig,
      });
      return { outputPath, hasZoom: false, hasTilt: false, hasCanvas: true, hasCursor: false };
    }
    fs.copyFileSync(rawVideoPath, outputPath);
    return { outputPath, hasZoom: false, hasTilt: false, hasCanvas: false, hasCursor: false };
  }

  const cursorEvents = loadCursorEvents(cursorLogPath);

  if (cursorEvents.length === 0) {
    if (canvasEnabled) {
      await applyCanvasEffect({
        inputVideo: rawVideoPath,
        outputVideo: outputPath,
        width,
        height,
        fps,
        canvas: canvasConfig,
      });
      return { outputPath, hasZoom: false, hasTilt: false, hasCanvas: true, hasCursor: false };
    }
    fs.copyFileSync(rawVideoPath, outputPath);
    return { outputPath, hasZoom: false, hasTilt: false, hasCanvas: false, hasCursor: false };
  }

  const cursorConfig: CursorHighlightConfig = { ...DEFAULT_CURSOR_HIGHLIGHT, ...config.cursor };
  const cursorEnabled = cursorConfig.enabled;

  // Generate zoom keyframes from click events
  let zoomFrames: FrameZoomData[] = [];
  const zoomEnabled = config.zoom?.enabled !== false;
  if (zoomEnabled) {
    const keyframes = generateZoomKeyframes(cursorEvents, config.zoom);
    zoomFrames = interpolateKeyframes(keyframes, fps, duration);
  }

  // Generate tilt frames from cursor trajectory
  let tiltFrames: FrameTiltData[] = [];
  const tiltEnabled = config.tilt?.enabled !== false;
  if (tiltEnabled) {
    tiltFrames = generateTiltFrames(cursorEvents, fps, duration, config.tilt);
  }

  const hasZoom = zoomFrames.length > 0 && zoomFrames.some(f => f.zoom > 1.001);
  const hasTilt = tiltFrames.length > 0 && tiltFrames.some(f => Math.abs(f.rotateX) > 0.1 || Math.abs(f.rotateY) > 0.1);

  // Pipeline: raw → motion effects → cursor highlight → canvas
  const needsMotionEffects = hasZoom || hasTilt;
  const needsMultipleSteps = [needsMotionEffects, cursorEnabled, canvasEnabled].filter(Boolean).length > 1;

  let currentInput = rawVideoPath;
  const intermediates: string[] = [];

  // Step 1: Motion effects (zoom/tilt)
  if (needsMotionEffects) {
    const stepOutput = needsMultipleSteps
      ? outputPath.replace(/\.mp4$/, '_step1_motion.mp4')
      : outputPath;
    if (stepOutput !== outputPath) intermediates.push(stepOutput);

    if (hasZoom && !hasTilt && !config.background) {
      await applySimpleZoom({
        inputVideo: currentInput,
        outputVideo: stepOutput,
        width,
        height,
        fps,
        zoomFrames,
      });
    } else {
      await applyEffects({
        inputVideo: currentInput,
        outputVideo: stepOutput,
        width,
        height,
        fps,
        duration,
        zoomFrames,
        tiltFrames,
        background: config.background,
      });
    }
    currentInput = stepOutput;
  }

  // Step 2: Cursor highlight
  let hasCursor = false;
  if (cursorEnabled && cursorEvents.length > 1) {
    const stepOutput = canvasEnabled
      ? outputPath.replace(/\.mp4$/, '_step2_cursor.mp4')
      : outputPath;
    if (stepOutput !== outputPath) intermediates.push(stepOutput);

    await applyCursorHighlight({
      inputVideo: currentInput,
      outputVideo: stepOutput,
      width,
      height,
      fps,
      duration,
      cursorEvents,
      config: cursorConfig,
    });
    currentInput = stepOutput;
    hasCursor = true;
  }

  // Step 3: Canvas (rounded corners, shadow, background)
  if (canvasEnabled) {
    await applyCanvasEffect({
      inputVideo: currentInput,
      outputVideo: outputPath,
      width,
      height,
      fps,
      canvas: canvasConfig,
    });
  } else if (currentInput !== outputPath) {
    fs.copyFileSync(currentInput, outputPath);
  }

  // Clean up intermediate files
  for (const f of intermediates) {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }

  return { outputPath, hasZoom, hasTilt, hasCanvas: canvasEnabled, hasCursor };
}
