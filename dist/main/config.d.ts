export interface AppSettings {
    fps: 30 | 60;
    outputDir: string;
    lastMode: 'quick' | 'polished';
    audioMicDefault: boolean;
    audioSystemDefault: boolean;
}
export declare function getSettings(): AppSettings;
export declare function setSettings(partial: Partial<AppSettings>): void;
