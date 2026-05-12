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
exports.applyEffects = applyEffects;
exports.applySimpleZoom = applySimpleZoom;
const child_process_1 = require("child_process");
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
function getFFmpegPath() {
    const bundled = path.join(__dirname, '../../../resources/ffmpeg/ffmpeg.exe');
    if (fs.existsSync(bundled))
        return bundled;
    return 'ffmpeg';
}
function buildZoomExpression(frames, fps) {
    if (frames.length === 0) {
        return { zoom: '1', x: 'iw/2', y: 'ih/2' };
    }
    // Find frames where zoom is active (zoom > 1.001)
    // Only keep transition keypoints: start of zoom, peak, end of zoom
    const keypoints = [];
    keypoints.push({ frame: 0, zoom: frames[0].zoom, cx: frames[0].centerX, cy: frames[0].centerY });
    for (let i = 1; i < frames.length - 1; i++) {
        const prev = frames[i - 1];
        const curr = frames[i];
        const next = frames[i + 1];
        const zoomChanging = Math.abs(curr.zoom - prev.zoom) > 0.005 || Math.abs(next.zoom - curr.zoom) > 0.005;
        const isTransition = (prev.zoom <= 1.001 && curr.zoom > 1.001) ||
            (curr.zoom > 1.001 && next.zoom <= 1.001) ||
            (Math.sign(curr.zoom - prev.zoom) !== Math.sign(next.zoom - curr.zoom) && Math.abs(curr.zoom - 1) > 0.01);
        if (isTransition || (zoomChanging && i % Math.max(1, Math.floor(frames.length / 25)) === 0)) {
            keypoints.push({ frame: i, zoom: curr.zoom, cx: curr.centerX, cy: curr.centerY });
        }
    }
    keypoints.push({ frame: frames.length - 1, zoom: frames[frames.length - 1].zoom, cx: frames[frames.length - 1].centerX, cy: frames[frames.length - 1].centerY });
    // Cap at 30 keypoints max
    let sampled = keypoints;
    if (keypoints.length > 30) {
        const step = Math.ceil(keypoints.length / 30);
        sampled = keypoints.filter((_, i) => i % step === 0 || i === keypoints.length - 1);
    }
    // Build piecewise expression
    const zoomParts = [];
    const xParts = [];
    const yParts = [];
    for (let i = 0; i < sampled.length - 1; i++) {
        const kp = sampled[i];
        const next = sampled[i + 1];
        const sf = kp.frame;
        const ef = next.frame;
        const dur = ef - sf;
        if (dur <= 0)
            continue;
        if (Math.abs(kp.zoom - 1) < 0.001 && Math.abs(next.zoom - 1) < 0.001)
            continue;
        const zExpr = kp.zoom === next.zoom
            ? `${kp.zoom.toFixed(3)}`
            : `${kp.zoom.toFixed(3)}+(${(next.zoom - kp.zoom).toFixed(4)})*((on-${sf})/${dur})`;
        const xExpr = `${kp.cx.toFixed(4)}+(${(next.cx - kp.cx).toFixed(4)})*((on-${sf})/${dur})`;
        const yExpr = `${kp.cy.toFixed(4)}+(${(next.cy - kp.cy).toFixed(4)})*((on-${sf})/${dur})`;
        zoomParts.push(`if(between(on,${sf},${ef}),${zExpr},`);
        xParts.push(`if(between(on,${sf},${ef}),${xExpr},`);
        yParts.push(`if(between(on,${sf},${ef}),${yExpr},`);
    }
    if (zoomParts.length === 0) {
        return { zoom: '1', x: '0.5', y: '0.5' };
    }
    const zoomExpr = zoomParts.join('') + '1' + ')'.repeat(zoomParts.length);
    const xExpr = xParts.join('') + '0.5' + ')'.repeat(xParts.length);
    const yExpr = yParts.join('') + '0.5' + ')'.repeat(yParts.length);
    return { zoom: zoomExpr, x: xExpr, y: yExpr };
}
function applyEffects(options) {
    return new Promise((resolve, reject) => {
        const ffmpegPath = getFFmpegPath();
        const { inputVideo, outputVideo, width, height, fps, zoomFrames, tiltFrames, background } = options;
        const filters = [];
        // Apply zoom using zoompan filter
        if (zoomFrames.length > 0 && zoomFrames.some(f => f.zoom > 1.001)) {
            const expr = buildZoomExpression(zoomFrames, fps);
            // zoompan: z=zoom level, x/y = top-left corner of crop area
            // x = (centerX * iw) - (iw/zoom/2), y = (centerY * ih) - (ih/zoom/2)
            const zFilter = `zoompan=z='${expr.zoom}':x='(${expr.x})*iw-iw/(2*zoom)':y='(${expr.y})*ih-ih/(2*zoom)':d=1:s=${width}x${height}:fps=${fps}`;
            filters.push(zFilter);
        }
        // Apply 3D tilt using perspective filter
        if (tiltFrames.length > 0 && tiltFrames.some(f => Math.abs(f.rotateX) > 0.1 || Math.abs(f.rotateY) > 0.1)) {
            // Use a subtle perspective transform based on average tilt
            // For per-frame tilt, we'd need sendcmd which is complex
            // Instead, apply a gentle static perspective based on the dominant motion direction
            const avgRotX = tiltFrames.reduce((s, f) => s + f.rotateX, 0) / tiltFrames.length;
            const avgRotY = tiltFrames.reduce((s, f) => s + f.rotateY, 0) / tiltFrames.length;
            // Convert rotation to corner offsets for perspective filter
            const offsetX = Math.round(avgRotY * 3); // pixels
            const offsetY = Math.round(avgRotX * 3);
            if (Math.abs(offsetX) > 1 || Math.abs(offsetY) > 1) {
                // perspective filter: x0:y0:x1:y1:x2:y2:x3:y3
                // corners: top-left, top-right, bottom-left, bottom-right
                const x0 = Math.max(0, offsetX);
                const y0 = Math.max(0, offsetY);
                const x1 = width - Math.max(0, -offsetX);
                const y1 = Math.max(0, -offsetY);
                const x2 = Math.max(0, -offsetX);
                const y2 = height - Math.max(0, -offsetY);
                const x3 = width - Math.max(0, offsetX);
                const y3 = height - Math.max(0, offsetY);
                filters.push(`perspective=${x0}:${y0}:${x1}:${y1}:${x2}:${y2}:${x3}:${y3}:interpolation=linear`);
            }
        }
        // Add background padding if needed
        if (background) {
            const padColor = background.replace('#', '');
            filters.push(`pad=w=${width}+80:h=${height}+80:x=40:y=40:color=${padColor}`);
            filters.push(`scale=${width}:${height}`);
        }
        if (filters.length === 0) {
            // No effects to apply, just copy
            fs.copyFileSync(inputVideo, outputVideo);
            resolve();
            return;
        }
        const filterComplex = filters.join(',');
        const args = [
            '-y',
            '-i', inputVideo,
            '-vf', filterComplex,
            '-c:v', 'libx264',
            '-preset', 'fast',
            '-crf', '20',
            '-pix_fmt', 'yuv420p',
            '-c:a', 'copy',
            outputVideo,
        ];
        const proc = (0, child_process_1.spawn)(ffmpegPath, args, { stdio: ['pipe', 'pipe', 'pipe'] });
        let stderr = '';
        proc.stderr?.on('data', d => { stderr += d.toString(); });
        proc.on('error', (err) => reject(err));
        proc.on('exit', (code) => {
            if (code === 0)
                resolve();
            else
                reject(new Error(`FFmpeg effects failed (code ${code}): ${stderr.slice(-500)}`));
        });
    });
}
function applySimpleZoom(options) {
    return new Promise((resolve, reject) => {
        const ffmpegPath = getFFmpegPath();
        const { inputVideo, outputVideo, width, height, fps, zoomFrames } = options;
        // Sample keypoints where zoom changes, capped at 30
        const keypoints = [];
        let lastZoom = 1.0;
        for (let i = 0; i < zoomFrames.length; i++) {
            const f = zoomFrames[i];
            if (Math.abs(f.zoom - lastZoom) > 0.01 || i === 0 || i === zoomFrames.length - 1) {
                keypoints.push({ frame: i, zoom: f.zoom, cx: f.centerX, cy: f.centerY });
                lastZoom = f.zoom;
            }
        }
        let sampled = keypoints;
        if (keypoints.length > 30) {
            const step = Math.ceil(keypoints.length / 30);
            sampled = keypoints.filter((_, i) => i % step === 0 || i === keypoints.length - 1);
        }
        let zExpr = '1';
        let xExpr = `iw/2-(iw/zoom/2)`;
        let yExpr = `ih/2-(ih/zoom/2)`;
        if (sampled.length > 1) {
            const parts = [];
            for (let i = 0; i < sampled.length - 1; i++) {
                const kp = sampled[i];
                const next = sampled[i + 1];
                const dur = next.frame - kp.frame;
                if (dur <= 0)
                    continue;
                const lerp = kp.zoom === next.zoom
                    ? `${kp.zoom.toFixed(3)}`
                    : `${kp.zoom.toFixed(3)}+${((next.zoom - kp.zoom) / dur).toFixed(6)}*(on-${kp.frame})`;
                parts.push(`if(between(on,${kp.frame},${next.frame}),${lerp},`);
            }
            if (parts.length > 0) {
                zExpr = parts.join('') + '1' + ')'.repeat(parts.length);
            }
            const xParts = [];
            const yParts = [];
            for (let i = 0; i < sampled.length - 1; i++) {
                const kp = sampled[i];
                const next = sampled[i + 1];
                const dur = next.frame - kp.frame;
                if (dur <= 0)
                    continue;
                const cxLerp = kp.cx === next.cx
                    ? `${kp.cx.toFixed(4)}`
                    : `${kp.cx.toFixed(4)}+${((next.cx - kp.cx) / dur).toFixed(6)}*(on-${kp.frame})`;
                const cyLerp = kp.cy === next.cy
                    ? `${kp.cy.toFixed(4)}`
                    : `${kp.cy.toFixed(4)}+${((next.cy - kp.cy) / dur).toFixed(6)}*(on-${kp.frame})`;
                xParts.push(`if(between(on,${kp.frame},${next.frame}),${cxLerp},`);
                yParts.push(`if(between(on,${kp.frame},${next.frame}),${cyLerp},`);
            }
            if (xParts.length > 0) {
                const cxExpr = xParts.join('') + '0.5' + ')'.repeat(xParts.length);
                const cyExpr = yParts.join('') + '0.5' + ')'.repeat(yParts.length);
                xExpr = `(${cxExpr})*iw-(iw/zoom/2)`;
                yExpr = `(${cyExpr})*ih-(ih/zoom/2)`;
            }
        }
        const filter = `zoompan=z='${zExpr}':x='${xExpr}':y='${yExpr}':d=1:s=${width}x${height}:fps=${fps}`;
        const args = [
            '-y',
            '-i', inputVideo,
            '-vf', filter,
            '-c:v', 'libx264',
            '-preset', 'fast',
            '-crf', '20',
            '-pix_fmt', 'yuv420p',
            '-c:a', 'copy',
            outputVideo,
        ];
        const proc = (0, child_process_1.spawn)(ffmpegPath, args, { stdio: ['pipe', 'pipe', 'pipe'] });
        let stderr = '';
        proc.stderr?.on('data', d => { stderr += d.toString(); });
        proc.on('error', (err) => reject(err));
        proc.on('exit', (code) => {
            if (code === 0)
                resolve();
            else
                reject(new Error(`FFmpeg zoom failed (code ${code}): ${stderr.slice(-500)}`));
        });
    });
}
