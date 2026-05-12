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
}

interface NativeAddon {
  enumerateSources(): Array<{ id: string; title: string; type: string; width: number; height: number }>;
  startCapture(sourceId: string, fps: number, pipeName: string): boolean;
  stopCapture(): void;
  getCaptureState(): string;
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

    this.sourceWidth = source.width;
    this.sourceHeight = source.height;

    // Start screen capture (creates named pipe server)
    const captureOk = n.startCapture(config.sourceId, config.fps, pipeName);
    if (!captureOk) {
      throw new Error('Failed to start screen capture');
    }

    // Give capture thread time to create the pipe
    await new Promise(resolve => setTimeout(resolve, 500));

    // Start FFmpeg (connects to pipe as client)
    await this.ffmpeg.startEncoding({
      pipeName,
      width: source.width,
      height: source.height,
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

    const recordingDuration = (Date.now() - this.startTime) / 1000;

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

    const cursorEvents = n.stopCursorTracking();

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
