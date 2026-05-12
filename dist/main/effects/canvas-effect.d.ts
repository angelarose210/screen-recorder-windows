export interface CanvasConfig {
    enabled: boolean;
    background: string;
    padding: number;
    borderRadius: number;
    shadow: boolean;
    shadowBlur: number;
    shadowOffsetX: number;
    shadowOffsetY: number;
    shadowColor: string;
}
export declare const DEFAULT_CANVAS: CanvasConfig;
export declare function applyCanvasEffect(options: {
    inputVideo: string;
    outputVideo: string;
    width: number;
    height: number;
    fps: number;
    canvas: CanvasConfig;
}): Promise<void>;
