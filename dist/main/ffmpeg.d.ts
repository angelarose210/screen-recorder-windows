export declare class FFmpegEncoder {
    private process;
    private ffmpegPath;
    constructor();
    createNamedPipeServer(pipeName: string): Promise<void>;
    startEncoding(options: {
        pipeName: string;
        width: number;
        height: number;
        fps: number;
        outputPath: string;
    }): Promise<void>;
    waitForFinish(): Promise<void>;
    muxAudio(options: {
        videoPath: string;
        systemAudioPath: string | null;
        micAudioPath: string | null;
        outputPath: string;
        audioOffsetSec: number;
    }): Promise<void>;
}
