export interface RecorderAPI {
    getSources: () => Promise<any[]>;
    start: (config: any) => Promise<void>;
    startArea: (config: any) => Promise<boolean>;
    stop: () => Promise<{
        outputPath: string;
        cursorLogPath: string;
        effectsApplied: boolean;
    }>;
    getState: () => Promise<string>;
    setEffects: (config: any) => Promise<void>;
    onStateChange: (cb: (state: string) => void) => void;
    onTimer: (cb: (seconds: number) => void) => void;
    onGlobalShortcut: (cb: (action: string) => void) => void;
    onFinished: (cb: (result: {
        outputPath: string;
        cursorLogPath: string;
        effectsApplied: boolean;
    }) => void) => void;
    openOutputFolder: () => Promise<void>;
    getSettings: () => Promise<any>;
    setSettings: (settings: any) => Promise<void>;
    selectOutputFolder: (kind?: 'videos' | 'screenshots') => Promise<string | null>;
    getFolders: () => Promise<{
        videos: string;
        screenshots: string;
    }>;
    openFolder: (kind: 'videos' | 'screenshots') => Promise<void>;
}
