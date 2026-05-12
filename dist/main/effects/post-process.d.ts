import { ZoomConfig } from './zoom-keyframes';
import { TiltConfig } from './tilt-effect';
import { CanvasConfig } from './canvas-effect';
import { CursorHighlightConfig } from './cursor-highlight';
export interface PostProcessConfig {
    zoom?: Partial<ZoomConfig> & {
        enabled?: boolean;
    };
    tilt?: Partial<TiltConfig> & {
        enabled?: boolean;
    };
    canvas?: Partial<CanvasConfig>;
    cursor?: Partial<CursorHighlightConfig>;
    background?: string;
}
export interface PostProcessResult {
    outputPath: string;
    hasZoom: boolean;
    hasTilt: boolean;
    hasCanvas: boolean;
    hasCursor: boolean;
}
export declare function postProcessRecording(options: {
    rawVideoPath: string;
    cursorLogPath: string;
    outputPath: string;
    width: number;
    height: number;
    fps: number;
    duration: number;
    config?: PostProcessConfig;
}): Promise<PostProcessResult>;
