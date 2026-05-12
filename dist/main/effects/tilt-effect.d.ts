import { CursorEvent } from './zoom-keyframes';
export interface TiltKeyframe {
    time: number;
    rotateX: number;
    rotateY: number;
}
export interface TiltConfig {
    intensity: 'subtle' | 'medium' | 'dramatic';
    smoothing: number;
}
export interface FrameTiltData {
    rotateX: number;
    rotateY: number;
    perspective: number;
}
export declare function generateTiltFrames(cursorEvents: CursorEvent[], fps: number, totalDuration: number, config?: Partial<TiltConfig>): FrameTiltData[];
