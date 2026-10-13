import { BrowserWindow } from 'electron';
import { OverlayEffects } from './config';
export declare function getScreenshotDir(): string;
export type CaptureMode = 'screenshot' | 'video';
export interface PickedRegion {
    display: Electron.Display;
    mode: CaptureMode;
    fx?: OverlayEffects;
    rect: {
        x: number;
        y: number;
        width: number;
        height: number;
    } | null;
    image: Electron.NativeImage;
}
export declare function pickRegion(opts: {
    mode: CaptureMode;
    allowVideo: boolean;
    fx?: OverlayEffects;
}, hideFirst?: BrowserWindow | null): Promise<PickedRegion | null>;
export declare function saveImage(img: Electron.NativeImage): void;
