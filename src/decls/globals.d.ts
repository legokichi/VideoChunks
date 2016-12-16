
// MediaRecorder API
interface BlobEvent extends Event {
  data: Blob;
}
declare class MediaRecorder extends EventTarget {
  constructor(stream: MediaStream, opt: any);
  start(): void;
  stop(): void;
  mimeType: string; 
  state: "inactive"|"recording"|"paused";
  stream: MediaStream;
  videoBitsPerSecond: number;
  audioBitsPerSecond: number;
  ondataavailable?: (ev: BlobEvent)=> void;
  onerror?: (ev: ErrorEvent)=> void;
  addEventListener(event: "dataavailable", callback: (ev: BlobEvent)=> any);
}


interface CanvasCaptureMediaStream extends MediaStream {
  canvas: HTMLCanvasElement;
  requestFrame();
}

interface HTMLCanvasElement {
  captureStream(frameRate: number): CanvasCaptureMediaStream;
}