type Listener = (state: UpdateState) => void;
export type UpdateState = {
    status: 'idle' | 'checking' | 'downloading' | 'ready' | 'none' | 'error';
    version?: string;
};
export declare function getUpdateState(): UpdateState;
export declare function installUpdateNow(): void;
export declare function checkForUpdates(manual?: boolean): void;
export declare function setupUpdates(listener: Listener): void;
export {};
