declare module 'fluent-ffmpeg' {
  import { EventEmitter } from 'events';

  interface FfmpegCommand extends EventEmitter {
    seekInput(time: number): FfmpegCommand;
    frames(count: number): FfmpegCommand;
    output(path: string): FfmpegCommand;
    on(event: string, callback: (...args: any[]) => void): FfmpegCommand;
    run(): void;
  }

  interface Ffmpeg {
    (input?: string): FfmpegCommand;
    setFfmpegPath(path: string): void;
    setFfprobePath(path: string): void;
    ffprobe(
      file: string,
      callback: (err: Error | null, data: any) => void,
    ): void;
  }

  const ffmpeg: Ffmpeg;
  export = ffmpeg;
}

declare module 'ffprobe-static' {
  const ffprobe: { path: string };
  export = ffprobe;
}

declare module 'ffmpeg-static' {
  const ffmpegPath: string;
  export = ffmpegPath;
}
