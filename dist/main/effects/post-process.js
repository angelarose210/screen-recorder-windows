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
exports.postProcessRecording = postProcessRecording;
const fs = __importStar(require("fs"));
const zoom_keyframes_1 = require("./zoom-keyframes");
const tilt_effect_1 = require("./tilt-effect");
const effects_renderer_1 = require("./effects-renderer");
const canvas_effect_1 = require("./canvas-effect");
const cursor_highlight_1 = require("./cursor-highlight");
const DEFAULT_POST_PROCESS = {
    zoom: { enabled: true },
    tilt: { enabled: true },
    canvas: { enabled: true },
    cursor: { enabled: true },
    background: undefined,
};
async function postProcessRecording(options) {
    const { rawVideoPath, cursorLogPath, outputPath, width, height, fps, duration } = options;
    const config = { ...DEFAULT_POST_PROCESS, ...options.config };
    const canvasConfig = { ...canvas_effect_1.DEFAULT_CANVAS, ...config.canvas };
    const canvasEnabled = canvasConfig.enabled;
    if (!fs.existsSync(cursorLogPath)) {
        if (canvasEnabled) {
            await (0, canvas_effect_1.applyCanvasEffect)({
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
    const cursorEvents = (0, zoom_keyframes_1.loadCursorEvents)(cursorLogPath);
    if (cursorEvents.length === 0) {
        if (canvasEnabled) {
            await (0, canvas_effect_1.applyCanvasEffect)({
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
    const cursorConfig = { ...cursor_highlight_1.DEFAULT_CURSOR_HIGHLIGHT, ...config.cursor };
    const cursorEnabled = cursorConfig.enabled;
    // Generate zoom keyframes from click events
    let zoomFrames = [];
    const zoomEnabled = config.zoom?.enabled !== false;
    if (zoomEnabled) {
        const keyframes = (0, zoom_keyframes_1.generateZoomKeyframes)(cursorEvents, config.zoom);
        zoomFrames = (0, zoom_keyframes_1.interpolateKeyframes)(keyframes, fps, duration);
    }
    // Generate tilt frames from cursor trajectory
    let tiltFrames = [];
    const tiltEnabled = config.tilt?.enabled !== false;
    if (tiltEnabled) {
        tiltFrames = (0, tilt_effect_1.generateTiltFrames)(cursorEvents, fps, duration, config.tilt);
    }
    const hasZoom = zoomFrames.length > 0 && zoomFrames.some(f => f.zoom > 1.001);
    const hasTilt = tiltFrames.length > 0 && tiltFrames.some(f => Math.abs(f.rotateX) > 0.1 || Math.abs(f.rotateY) > 0.1);
    // Pipeline: raw → motion effects → cursor highlight → canvas
    const needsMotionEffects = hasZoom || hasTilt;
    const needsMultipleSteps = [needsMotionEffects, cursorEnabled, canvasEnabled].filter(Boolean).length > 1;
    let currentInput = rawVideoPath;
    const intermediates = [];
    // Step 1: Motion effects (zoom/tilt)
    if (needsMotionEffects) {
        const stepOutput = needsMultipleSteps
            ? outputPath.replace(/\.mp4$/, '_step1_motion.mp4')
            : outputPath;
        if (stepOutput !== outputPath)
            intermediates.push(stepOutput);
        if (hasZoom && !hasTilt && !config.background) {
            await (0, effects_renderer_1.applySimpleZoom)({
                inputVideo: currentInput,
                outputVideo: stepOutput,
                width,
                height,
                fps,
                zoomFrames,
            });
        }
        else {
            await (0, effects_renderer_1.applyEffects)({
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
        if (stepOutput !== outputPath)
            intermediates.push(stepOutput);
        await (0, cursor_highlight_1.applyCursorHighlight)({
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
        await (0, canvas_effect_1.applyCanvasEffect)({
            inputVideo: currentInput,
            outputVideo: outputPath,
            width,
            height,
            fps,
            canvas: canvasConfig,
        });
    }
    else if (currentInput !== outputPath) {
        fs.copyFileSync(currentInput, outputPath);
    }
    // Clean up intermediate files
    for (const f of intermediates) {
        if (fs.existsSync(f))
            fs.unlinkSync(f);
    }
    return { outputPath, hasZoom, hasTilt, hasCanvas: canvasEnabled, hasCursor };
}
