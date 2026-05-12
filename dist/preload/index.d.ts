export interface RecorderAPI {
    getSources: () => Promise<any[]>;
    start: (config: any) => Promise<void>;
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
    openOutputFolder: () => Promise<void>;
    getSettings: () => Promise<any>;
    setSettings: (settings: any) => Promise<void>;
    selectOutputFolder: () => Promise<string | null>;
}
