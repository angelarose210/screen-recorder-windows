export interface EffectsSettings {
    zoom: {
        enabled: boolean;
        zoomLevel: number;
    };
    tilt: {
        enabled: boolean;
        intensity: 'subtle' | 'medium' | 'dramatic';
    };
    canvas: {
        enabled: boolean;
        background: string;
        padding: number;
        borderRadius: number;
        shadow: boolean;
    };
    cursor: {
        enabled: boolean;
        dotSize: number;
        dotColor: string;
        clickRipple: boolean;
    };
}
type TiltIntensity = 'subtle' | 'medium' | 'dramatic';
export type OverlayEffects = {
    zoom: boolean;
    tilt: boolean;
    canvas: boolean;
    cursor: boolean;
    zoomLevel: number;
    tiltIntensity: TiltIntensity;
};
export interface AppSettings {
    fps: 30 | 60;
    outputDir: string;
    screenshotDir: string;
    lastMode: 'quick' | 'polished';
    audioMicDefault: boolean;
    audioSystemDefault: boolean;
    effects: EffectsSettings;
}
export declare function getSettings(): AppSettings;
export declare function loadEffects(): EffectsSettings;
export declare function saveEffects(effects: EffectsSettings): void;
export declare function overlayEffects(e: EffectsSettings): OverlayEffects;
export declare function withOverlayEffects(e: EffectsSettings, t: OverlayEffects): EffectsSettings;
export declare function setSettings(partial: Partial<AppSettings>): void;
export declare function getVideosDir(): string;
export declare function getScreenshotsDir(): string;
export {};
