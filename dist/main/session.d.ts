export interface SessionPaths {
    sessionDir: string;
    screenRaw: string;
    micRaw: string;
    systemRaw: string;
    cursorLog: string;
    finalOutput: string;
}
export declare function createSession(sessionId: string): SessionPaths;
export declare function getOutputDir(): string;
export declare function cleanupSession(sessionDir: string): void;
