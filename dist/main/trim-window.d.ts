import { BrowserWindow } from 'electron';
export declare function registerMediaScheme(): void;
export declare function openTrimWindow(filePath: string): BrowserWindow;
export declare function pickAndOpenTrim(parent?: BrowserWindow | null): Promise<boolean>;
export declare function recordingSaved(filePath: string): void;
export declare function trimLastRecording(): void;
export declare function setupTrim(): void;
