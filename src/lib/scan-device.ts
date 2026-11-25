/**
 * Pure capability and device checks for the scanner. Nothing here touches the
 * camera or loads the decoder; the component uses it to decide what to offer and
 * what to warn about.
 */

export const NATIVE_SCAN_FORMATS = [
  "qr_code",
  "ean_13",
  "ean_8",
  "code_128",
  "upc_a",
  "upc_e",
] as const;

export const ZXING_SCAN_FORMATS = [
  "QRCode",
  "EAN13",
  "EAN8",
  "Code128",
  "UPCA",
  "UPCE",
] as const;

export type ScanDecoder = "native" | "wasm";

export type ScannerSupportInput = {
  hasBarcodeDetector: boolean;
  hasWebAssembly: boolean;
  hasCamera: boolean;
  hasWorker: boolean;
  isSecureContext: boolean;
};

export type ScannerSupport =
  | { kind: "ready"; decoder: ScanDecoder }
  | { kind: "unsupported"; title: string; message: string };

/**
 * Camera access is the hard requirement. The decoder is either the browser's
 * built-in detector or the lazily loaded WASM reader, but both run in a worker, so
 * a browser without workers is not supported.
 */
export function scannerSupport({
  hasBarcodeDetector,
  hasWebAssembly,
  hasCamera,
  hasWorker,
  isSecureContext,
}: ScannerSupportInput): ScannerSupport {
  if (!isSecureContext) {
    return {
      kind: "unsupported",
      title: "Camera scanning needs HTTPS",
      message:
        "Open the app over HTTPS to use the camera. Manual barcode or SKU entry still works.",
    };
  }

  if (!hasCamera) {
    return {
      kind: "unsupported",
      title: "This browser has no camera interface",
      message:
        "Use Chrome on Android for camera scanning, or type the barcode or SKU below.",
    };
  }

  if (!hasWorker) {
    return {
      kind: "unsupported",
      title: "This browser cannot run the scanner",
      message:
        "The decoder runs off the main thread. Use a current browser, or type the barcode or SKU below.",
    };
  }

  if (hasBarcodeDetector) {
    return { kind: "ready", decoder: "native" };
  }

  if (!hasWebAssembly) {
    return {
      kind: "unsupported",
      title: "This browser cannot decode barcodes",
      message:
        "It has neither the built-in detector nor WebAssembly for the fallback. Use Chrome on Android, or type the barcode or SKU below.",
    };
  }

  return { kind: "ready", decoder: "wasm" };
}

export type ScanDeviceInput = {
  userAgent: string;
  /** Chrome-only, in GB; Safari and Firefox do not expose it. */
  deviceMemory?: number;
  hardwareConcurrency?: number;
};

export type ScanDeviceProfile = {
  isChromeAndroid: boolean;
  browserLabel: string;
  tier: "low" | "standard" | "unknown";
  /** Human-readable signals that made the device look low-powered. */
  reasons: string[];
};

function isChromeOnAndroid(userAgent: string): boolean {
  if (!/Android/i.test(userAgent)) return false;
  if (!/Chrome\/\d/i.test(userAgent)) return false;
  // Chrome's Android WebView and other Chromium browsers share "Chrome/".
  return !/(SamsungBrowser|EdgA\/|OPR\/|Firefox\/|FxiOS|CriOS|;\s*wv\))/i.test(
    userAgent,
  );
}

function browserLabel(userAgent: string, chromeAndroid: boolean): string {
  if (chromeAndroid) return "Chrome on Android";
  if (/SamsungBrowser/i.test(userAgent)) return "Samsung Internet";
  if (/EdgA\/|EdgiOS\/|Edg\//i.test(userAgent)) return "Edge";
  if (/FxiOS|Firefox\//i.test(userAgent)) return "Firefox";
  if (/CriOS/i.test(userAgent)) return "Chrome on iOS";
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "Safari";
  if (/Android/i.test(userAgent)) return "this Android browser";
  return "this browser";
}

/**
 * Deliberately conservative: only call a device low-powered when it reports at
 * most 2 GB of memory or at most 2 CPU threads. Browsers that hide both stay
 * "unknown" rather than being labelled from a user-agent guess.
 */
export function assessScanDevice({
  userAgent,
  deviceMemory,
  hardwareConcurrency,
}: ScanDeviceInput): ScanDeviceProfile {
  const reasons: string[] = [];
  if (deviceMemory !== undefined && deviceMemory <= 2) {
    reasons.push(`${deviceMemory} GB of memory`);
  }
  if (hardwareConcurrency !== undefined && hardwareConcurrency <= 2) {
    reasons.push(
      `${hardwareConcurrency} CPU thread${hardwareConcurrency === 1 ? "" : "s"}`,
    );
  }

  const hasSignal =
    deviceMemory !== undefined || hardwareConcurrency !== undefined;
  const chromeAndroid = isChromeOnAndroid(userAgent);

  return {
    isChromeAndroid: chromeAndroid,
    browserLabel: browserLabel(userAgent, chromeAndroid),
    tier: reasons.length > 0 ? "low" : hasSignal ? "standard" : "unknown",
    reasons,
  };
}
