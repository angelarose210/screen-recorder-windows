import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import * as fs from 'fs';
import { FFmpegEncoder } from './ffmpeg';
import { createSession, getOutputDir, SessionPaths } from './session';
import { postProcessRecording, PostProcessConfig } from './effects/post-process';

export type RecorderState = 'idle' | 'preparing' | 'recording' | 'stopping' | 'saving';

export interface RecordingConfig {
  sourceId: string;
  fps: 30 | 60;
  audioMic: boolean;
  audioSystem: boolean;
  outputDir?: string;
  // Record only this rect of a monitor source (physical pixels, relative to the monitor)
  region?: { x: number; y: number; width: number; height: number };
}

interface NativeAddon {
  enumerateSources(): Array<{ id: string; title: string; type: string; x: number; y: number; width: number; height: number }>;
  startCapture(sourceId: string, fps: number, pipeName: string, crop?: { x: number; y: number; width: number; height: number }): boolean;
  stopCapture(): void;
  getCaptureState(): string;
  getCaptureSize(): { width: number; height: number };
  startAudioCapture(outputPath: string, type: string): boolean;
  stopAudioCapture(type: string): void;
  startCursorTracking(fps: number): void;
  stopCursorTracking(): Array<{ t: number; x: number; y: number; event: string; button?: string; delta?: number; screen_w: number; screen_h: number }>;
}

let native: NativeAddon | null = null;
// Native addon loading deferred until explicitly needed
function loadNative(): NativeAddon | null {
  if (native) return native;
  try {
    const addonPath = path.join(__dirname, '../../native/build/screen_recorder_native.node');
    native = require(addonPath);
    console.log('Native addon loaded successfully');
  } catch (err) {
    console.warn('Native addon not available:', (err as Error).message);
  }
  return native;
}

export class Recorder extends EventEmitter {
  private state: RecorderState = 'idle';
  private session: SessionPaths | null = null;
  private sessionId: string | null = null;
  private config: RecordingConfig | null = null;
  private ffmpeg: FFmpegEncoder;
  private timerInterval: NodeJS.Timeout | null = null;
  private startTime: number = 0;
  private sourceWidth: number = 0;
  private sourceHeight: number = 0;
  private effectsConfig: PostProcessConfig = {};
  private audioOffsetSec = 0;
  private captureOrigin = { x: 0, y: 0 };

  constructor() {
    super();
    this.ffmpeg = new FFmpegEncoder();
  }

  getState(): RecorderState {
    return this.state;
  }

  getElapsedSeconds(): number {
    if (this.state !== 'recording') return 0;
    return Math.floor((Date.now() - this.startTime) / 1000);
  }

  getSources() {
    const n = loadNative();
    if (!n) return [];
    return n.enumerateSources();
  }

  async start(config: RecordingConfig): Promise<void> {
    if (this.state !== 'idle') throw new Error(`Cannot start in state: ${this.state}`);
    const n = loadNative();
    if (!n) throw new Error('Native addon not loaded');

    this.setState('preparing');
    this.config = config;
    this.sessionId = uuidv4();
    this.session = createSession(this.sessionId);

    const pipeName = `\\\\.\\pipe\\screen-recorder-${this.sessionId}`;

    // Get source dimensions for FFmpeg
    const sources = n.enumerateSources();
    const source = sources.find(s => s.id === config.sourceId);
    if (!source) throw new Error('Source not found');

    // Start screen capture (creates named pipe server)
    if (config.region && source.type !== 'monitor') throw new Error('Area recording needs a monitor source');
    this.captureOrigin = config.region
      ? { x: source.x + config.region.x, y: source.y + config.region.y }
      : { x: source.type === 'monitor' ? source.x : 0, y: source.type === 'monitor' ? source.y : 0 };

    const captureOk = n.startCapture(config.sourceId, config.fps, pipeName, config.region);
    if (!captureOk) {
      throw new Error('Failed to start screen capture');
    }

    // The real frame size comes from Windows Graphics Capture, not the enumerated
    // window rect (which includes invisible borders). FFmpeg must be told the exact size.
    let size = { width: 0, height: 0 };
    for (let i = 0; i < 60 && size.width === 0; i++) {
      await new Promise(resolve => setTimeout(resolve, 50));
      size = n.getCaptureSize();
    }
    if (size.width === 0) {
      n.stopCapture();
      this.setState('idle');
      throw new Error('Screen capture did not start');
    }
    this.sourceWidth = size.width;
    this.sourceHeight = size.height;

    // Give capture thread time to create the pipe
    await new Promise(resolve => setTimeout(resolve, 200));

    // Start FFmpeg (connects to pipe as client); video t=0 is roughly when it connects
    const videoStart = Date.now();
    await this.ffmpeg.startEncoding({
      pipeName,
      width: size.width,
      height: size.height,
      fps: config.fps,
      outputPath: this.session.screenRaw,
    });

    // Start audio capture after FFmpeg is running so audio and video are aligned
    if (config.audioSystem) {
      n.startAudioCapture(this.session.systemRaw, 'loopback');
    }
    if (config.audioMic) {
      n.startAudioCapture(this.session.micRaw, 'mic');
    }

    this.audioOffsetSec = (Date.now() - videoStart) / 1000;

    // Start cursor tracking
    n.startCursorTracking(60);

    this.startTime = Date.now();
    this.setState('recording');

    // Start timer updates
    this.timerInterval = setInterval(() => {
      this.emit('timer', this.getElapsedSeconds());
    }, 1000);
  }

  setEffectsConfig(config: PostProcessConfig) {
    this.effectsConfig = config;
  }

  async stop(): Promise<{ outputPath: string; cursorLogPath: string; effectsApplied: boolean }> {
    if (this.state !== 'recording') throw new Error(`Cannot stop in state: ${this.state}`);
    const n = loadNative();
    if (!n || !this.session || !this.config) throw new Error('Invalid state');

    const recordingDuration = (Date.now() - this.startTime) / 1000 + this.audioOffsetSec;

    this.setState('stopping');

    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }

    // Stop all captures
    n.stopCapture();

    if (this.config.audioSystem) {
      n.stopAudioCapture('loopback');
    }
    if (this.config.audioMic) {
      n.stopAudioCapture('mic');
    }

    // Cursor timestamps start when tracking starts; shift them onto the video's clock
    // and, for monitor/area recordings, onto the video's pixel space (effects assume x/y in 0..screen_w)
    const origin = this.captureOrigin;
    const remap = !!this.config.region || origin.x !== 0 || origin.y !== 0;
    const cursorEvents = n.stopCursorTracking().map(e => ({
      ...e,
      t: e.t + this.audioOffsetSec,
      ...(remap ? { x: e.x - origin.x, y: e.y - origin.y, screen_w: this.sourceWidth, screen_h: this.sourceHeight } : {}),
    }));

    // Write cursor log
    fs.writeFileSync(this.session.cursorLog, JSON.stringify(cursorEvents, null, 2));

    this.setState('saving');

    // Wait for FFmpeg to finish encoding the video
    await this.ffmpeg.waitForFinish();

    // Mux audio into intermediate file
    const hasSystem = this.config.audioSystem && fs.existsSync(this.session.systemRaw);
    const hasMic = this.config.audioMic && fs.existsSync(this.session.micRaw);

    const outputDir = this.config.outputDir || getOutputDir();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const finalPath = path.join(outputDir, `recording_${timestamp}.mp4`);

    let muxedPath = this.session.screenRaw;

    if (hasSystem || hasMic) {
      muxedPath = path.join(this.session.sessionDir, 'muxed.mp4');
      await this.ffmpeg.muxAudio({
        videoPath: this.session.screenRaw,
        systemAudioPath: hasSystem ? this.session.systemRaw : null,
        micAudioPath: hasMic ? this.session.micRaw : null,
        outputPath: muxedPath,
        audioOffsetSec: this.audioOffsetSec,
      });
    }

    // Apply post-processing effects (zoom + tilt)
    let effectsApplied = false;
    try {
      console.log('Post-processing config:', JSON.stringify(this.effectsConfig));
      console.log('Post-processing params:', { muxedPath, finalPath, width: this.sourceWidth, height: this.sourceHeight, fps: this.config.fps, duration: recordingDuration });
      const result = await postProcessRecording({
        rawVideoPath: muxedPath,
        cursorLogPath: this.session.cursorLog,
        outputPath: finalPath,
        width: this.sourceWidth,
        height: this.sourceHeight,
        fps: this.config.fps,
        duration: recordingDuration,
        config: this.effectsConfig,
      });
      effectsApplied = result.hasZoom || result.hasTilt || result.hasCanvas || result.hasCursor;
    } catch (err) {
      console.error('Post-processing failed:', (err as Error).message);
      fs.copyFileSync(muxedPath, finalPath);
    }

    // Copy cursor log to output
    const cursorOutputPath = path.join(outputDir, `recording_${timestamp}_cursor.json`);
    fs.copyFileSync(this.session.cursorLog, cursorOutputPath);

    this.setState('idle');

    return {
      outputPath: finalPath,
      cursorLogPath: cursorOutputPath,
      effectsApplied,
    };
  }

  private setState(state: RecorderState) {
    this.state = state;
    this.emit('state-changed', state);
  }
}
