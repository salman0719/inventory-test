import {
  NATIVE_SCAN_FORMATS,
  ZXING_SCAN_FORMATS,
  type ScanDecoder,
} from "../../lib/scan-device";
import type {
  ScanWorkerRequest,
  ScanWorkerResponse,
} from "../../lib/scan-worker-protocol";

/**
 * Decoding happens here, never on the UI thread. `ImageData` is transferred from
 * the camera loop, so a slow frame cannot block the page.
 *
 * Native `BarcodeDetector` is the default. The WASM reader is a dynamic import and
 * is only loaded after the worker has been asked for it, so Chrome Android never
 * pays for it. The `.wasm` file is served by this app from `/zxing/`; the package's
 * default CDN path is deliberately not used.
 */

type NativeBarcode = { rawValue: string };
type NativeDetector = {
  detect(source: ImageData): Promise<NativeBarcode[]>;
};
type NativeDetectorConstructor = {
  new (options?: { formats?: string[] }): NativeDetector;
  getSupportedFormats?: () => Promise<string[]>;
};

type ZxingReader = typeof import("zxing-wasm/reader");

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<ScanWorkerRequest>) => void) | null;
  postMessage(message: ScanWorkerResponse): void;
};

let mode: ScanDecoder | null = null;
let nativeDetector: NativeDetector | null = null;
let zxing: ZxingReader | null = null;

function post(message: ScanWorkerResponse): void {
  scope.postMessage(message);
}

async function start(requested: ScanDecoder): Promise<void> {
  if (requested === "native") {
    try {
      const Detector = (
        self as unknown as { BarcodeDetector?: NativeDetectorConstructor }
      ).BarcodeDetector;
      if (!Detector) {
        post({ type: "fallback", reason: "native-unavailable" });
        return;
      }

      const supported = Detector.getSupportedFormats
        ? await Detector.getSupportedFormats()
        : [...NATIVE_SCAN_FORMATS];
      const formats = NATIVE_SCAN_FORMATS.filter((format) =>
        supported.includes(format),
      );
      if (formats.length === 0) {
        post({ type: "fallback", reason: "native-formats-unavailable" });
        return;
      }

      nativeDetector = new Detector({ formats: [...formats] });
      mode = "native";
      post({ type: "ready", mode });
    } catch {
      post({ type: "fallback", reason: "native-init-failed" });
    }
    return;
  }

  try {
    const reader = await import("zxing-wasm/reader");
    await reader.prepareZXingModule({
      overrides: {
        locateFile: (path: string, prefix: string) =>
          path.endsWith(".wasm") ? "/zxing/zxing_reader.wasm" : prefix + path,
      },
      fireImmediately: true,
    });
    zxing = reader;
    mode = "wasm";
    post({ type: "ready", mode });
  } catch {
    post({
      type: "error",
      message: "The on-device decoder could not start.",
    });
  }
}

async function decode(message: Extract<ScanWorkerRequest, { type: "frame" }>) {
  if (mode === null) return;

  let image: ImageData;
  try {
    image = new ImageData(
      new Uint8ClampedArray(message.buffer),
      message.width,
      message.height,
    );
  } catch {
    post({ type: "done" });
    return;
  }

  try {
    if (mode === "native" && nativeDetector) {
      const found = await nativeDetector.detect(image);
      const value = found.find((barcode) => barcode.rawValue.trim());
      if (value) {
        post({ type: "result", value: value.rawValue });
      } else {
        post({ type: "done" });
      }
      return;
    }

    if (mode === "wasm" && zxing) {
      const results = await zxing.readBarcodes(image, {
        formats: [...ZXING_SCAN_FORMATS],
        maxNumberOfSymbols: 1,
      });
      const value = results.find((result) => result.text.trim());
      if (value) {
        post({ type: "result", value: value.text });
      } else {
        post({ type: "done" });
      }
    }
  } catch {
    if (mode === "native") {
      post({ type: "fallback", reason: "native-detect-failed" });
    } else {
      // One undecodable frame is not fatal; keep the loop running.
      post({ type: "done" });
    }
  }
}

scope.onmessage = (event) => {
  const message = event.data;
  if (message.type === "start") {
    void start(message.mode);
    return;
  }
  if (message.type === "frame") {
    void decode(message);
  }
};
