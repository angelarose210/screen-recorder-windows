import { BrowserWindow } from 'electron';
import { CaptureMode } from './snip';
export declare function openCapture(mode?: CaptureMode): Promise<boolean>;
export declare function registerIpcHandlers(mainWindow: BrowserWindow): void;
