import { EventEmitter } from 'events';
import { PostProcessConfig } from './effects/post-process';
export type RecorderState = 'idle' | 'preparing' | 'recording' | 'stopping' | 'saving';
export interface RecordingConfig {
    sourceId: string;
    fps: 30 | 60;
    audioMic: boolean;
    audioSystem: boolean;
    outputDir?: string;
    region?: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
}
export declare class Recorder extends EventEmitter {
    private state;
    private session;
    private sessionId;
    private config;
    private ffmpeg;
    private timerInterval;
    private startTime;
    private sourceWidth;
    private sourceHeight;
    private effectsConfig;
    private audioOffsetSec;
    private captureOrigin;
    constructor();
    getState(): RecorderState;
    getElapsedSeconds(): number;
    getSources(): {
        id: string;
        title: string;
        type: string;
        x: number;
        y: number;
        width: number;
        height: number;
    }[];
    start(config: RecordingConfig): Promise<void>;
    setEffectsConfig(config: PostProcessConfig): void;
    stop(): Promise<{
        outputPath: string;
        cursorLogPath: string;
        effectsApplied: boolean;
    }>;
    private setState;
}
