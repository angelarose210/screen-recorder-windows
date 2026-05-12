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
exports.generateZoomKeyframes = generateZoomKeyframes;
exports.interpolateKeyframes = interpolateKeyframes;
exports.loadCursorEvents = loadCursorEvents;
const fs = __importStar(require("fs"));
const DEFAULT_CONFIG = {
    zoomLevel: 1.5,
    zoomInDuration: 0.4,
    holdDuration: 0.8,
    zoomOutDuration: 0.5,
    minTimeBetweenZooms: 1.5,
};
function easeInOutCubic(t) {
    return t < 0.5
        ? 4 * t * t * t
        : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
function generateZoomKeyframes(cursorEvents, config = {}) {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    const clicks = cursorEvents.filter(e => e.event === 'click');
    if (clicks.length === 0)
        return [];
    const keyframes = [];
    let lastZoomEnd = -Infinity;
    for (const click of clicks) {
        if (click.t - lastZoomEnd < cfg.minTimeBetweenZooms)
            continue;
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
function interpolateKeyframes(keyframes, fps, totalDuration) {
    const totalFrames = Math.ceil(totalDuration * fps);
    const frames = [];
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
function loadCursorEvents(filePath) {
    const data = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(data);
}
