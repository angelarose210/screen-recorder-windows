"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.Recorder = void 0;
const events_1 = require("events");
const uuid_1 = require("uuid");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const ffmpeg_1 = require("./ffmpeg");
const session_1 = require("./session");
const post_process_1 = require("./effects/post-process");
let native = null;
// Native addon loading deferred until explicitly needed
function loadNative() {
    if (native)
        return native;
    try {
        const addonPath = path.join(__dirname, '../../native/build/screen_recorder_native.node');
        native = require(addonPath);
        console.log('Native addon loaded successfully');
    }
    catch (err) {
        console.warn('Native addon not available:', err.message);
    }
    return native;
}
class Recorder extends events_1.EventEmitter {
    state = 'idle';
    session = null;
    sessionId = null;
    config = null;
    ffmpeg;
    timerInterval = null;
    startTime = 0;
    sourceWidth = 0;
    sourceHeight = 0;
    effectsConfig = {};
    constructor() {
        super();
        this.ffmpeg = new ffmpeg_1.FFmpegEncoder();
    }
    getState() {
        return this.state;
    }
    getElapsedSeconds() {
        if (this.state !== 'recording')
            return 0;
        return Math.floor((Date.now() - this.startTime) / 1000);
    }
    getSources() {
        const n = loadNative();
        if (!n)
            return [];
        return n.enumerateSources();
    }
    async start(config) {
        if (this.state !== 'idle')
            throw new Error(`Cannot start in state: ${this.state}`);
        const n = loadNative();
        if (!n)
            throw new Error('Native addon not loaded');
        this.setState('preparing');
        this.config = config;
        this.sessionId = (0, uuid_1.v4)();
        this.session = (0, session_1.createSession)(this.sessionId);
        const pipeName = `\\\\.\\pipe\\screen-recorder-${this.sessionId}`;
        // Get source dimensions for FFmpeg
        const sources = n.enumerateSources();
        const source = sources.find(s => s.id === config.sourceId);
        if (!source)
            throw new Error('Source not found');
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
    setEffectsConfig(config) {
        this.effectsConfig = config;
    }
    async stop() {
        if (this.state !== 'recording')
            throw new Error(`Cannot stop in state: ${this.state}`);
        const n = loadNative();
        if (!n || !this.session || !this.config)
            throw new Error('Invalid state');
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
        const outputDir = this.config.outputDir || (0, session_1.getOutputDir)();
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
            const result = await (0, post_process_1.postProcessRecording)({
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
        }
        catch (err) {
            console.error('Post-processing failed:', err.message);
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
    setState(state) {
        this.state = state;
        this.emit('state-changed', state);
    }
}
exports.Recorder = Recorder;
