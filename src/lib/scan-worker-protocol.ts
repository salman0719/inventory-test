import type { ScanDecoder } from "./scan-device";

export type ScanWorkerRequest =
  | { type: "start"; mode: ScanDecoder }
  | { type: "frame"; buffer: ArrayBuffer; width: number; height: number };

export type ScanWorkerResponse =
  | { type: "ready"; mode: ScanDecoder }
  | { type: "fallback"; reason: string }
  | { type: "result"; value: string }
  | { type: "done" }
  | { type: "error"; message: string };
