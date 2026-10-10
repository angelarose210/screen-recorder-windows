export interface AppSettings {
    fps: 30 | 60;
    outputDir: string;
    screenshotDir: string;
    lastMode: 'quick' | 'polished';
    audioMicDefault: boolean;
    audioSystemDefault: boolean;
}
export declare function getSettings(): AppSettings;
export declare function setSettings(partial: Partial<AppSettings>): void;
export declare function getVideosDir(): string;
export declare function getScreenshotsDir(): string;
