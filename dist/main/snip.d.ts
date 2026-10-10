import { BrowserWindow } from 'electron';
export declare function getScreenshotDir(): string;
export interface PickedRegion {
    display: Electron.Display;
    rect: {
        x: number;
        y: number;
        width: number;
        height: number;
    } | null;
    image: Electron.NativeImage;
}
export declare function pickRegion(hint: string, hideFirst?: BrowserWindow | null): Promise<PickedRegion | null>;
export declare function startSnip(hideFirst?: BrowserWindow | null): Promise<void>;
