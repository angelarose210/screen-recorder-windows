import { FrameZoomData } from './zoom-keyframes';
import { FrameTiltData } from './tilt-effect';
export interface EffectsOptions {
    inputVideo: string;
    outputVideo: string;
    width: number;
    height: number;
    fps: number;
    duration: number;
    zoomFrames: FrameZoomData[];
    tiltFrames: FrameTiltData[];
    background?: string;
}
export declare function applyEffects(options: EffectsOptions): Promise<void>;
export declare function applySimpleZoom(options: {
    inputVideo: string;
    outputVideo: string;
    width: number;
    height: number;
    fps: number;
    zoomFrames: FrameZoomData[];
}): Promise<void>;
