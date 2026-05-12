export interface CursorEvent {
    t: number;
    x: number;
    y: number;
    event: string;
    button?: string;
    delta?: number;
    screen_w: number;
    screen_h: number;
}
export interface ZoomKeyframe {
    time: number;
    zoom: number;
    centerX: number;
    centerY: number;
}
export interface ZoomConfig {
    zoomLevel: number;
    zoomInDuration: number;
    holdDuration: number;
    zoomOutDuration: number;
    minTimeBetweenZooms: number;
}
export declare function generateZoomKeyframes(cursorEvents: CursorEvent[], config?: Partial<ZoomConfig>): ZoomKeyframe[];
export interface FrameZoomData {
    zoom: number;
    centerX: number;
    centerY: number;
}
export declare function interpolateKeyframes(keyframes: ZoomKeyframe[], fps: number, totalDuration: number): FrameZoomData[];
export declare function loadCursorEvents(filePath: string): CursorEvent[];
