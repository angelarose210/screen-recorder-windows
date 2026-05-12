import { CursorEvent } from './zoom-keyframes';
export interface CursorHighlightConfig {
    enabled: boolean;
    dotSize: number;
    dotColor: string;
    dotOpacity: number;
    clickRipple: boolean;
    rippleColor: string;
    rippleDuration: number;
}
export declare const DEFAULT_CURSOR_HIGHLIGHT: CursorHighlightConfig;
export declare function applyCursorHighlight(options: {
    inputVideo: string;
    outputVideo: string;
    width: number;
    height: number;
    fps: number;
    duration: number;
    cursorEvents: CursorEvent[];
    config: CursorHighlightConfig;
}): Promise<void>;
