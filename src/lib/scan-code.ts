/**
 * Camera scans arrive as either a bare manufacturer barcode, a typed SKU, or the
 * full URL encoded in our own QR label. Only the last segment of a `/scan/` URL is
 * the code; every other URL is treated as text so the server can refuse it.
 */
export function normalizeScanInput(raw: string): string {
  const value = raw.trim();
  if (value === "") return "";

  try {
    const url = new URL(value);
    if (url.pathname.startsWith("/scan/")) {
      const segment = url.pathname.slice("/scan/".length).split("/")[0] ?? "";
      return decodeURIComponent(segment).trim();
    }
  } catch {
    // Not a URL: a barcode or SKU, which is the common case.
  }

  return value;
}

export function manualScanHref(raw: string): string {
  const code = normalizeScanInput(raw);
  return code === "" ? "/scan" : `/scan?code=${encodeURIComponent(code)}`;
}

export type ScannerSupportInput = {
  userAgent: string;
  hasBarcodeDetector: boolean;
  isSecureContext: boolean;
};

export type ScannerSupport =
  { kind: "ready" } | { kind: "unsupported"; title: string; message: string };

/**
 * The camera path is deliberately Android-only. The app still offers manual entry
 * on every platform, so an unsupported device gets a short note rather than a dead
 * end. This is a capability check, not a security boundary: the server always
 * resolves the code through the session and RLS.
 */
export function scannerSupport({
  userAgent,
  hasBarcodeDetector,
  isSecureContext,
}: ScannerSupportInput): ScannerSupport {
  if (!/android/i.test(userAgent)) {
    return {
      kind: "unsupported",
      title: "Camera scanning is available on Android",
      message:
        "Open this page in Chrome on an Android phone to scan labels. On this device you can still type a barcode or SKU below.",
    };
  }

  if (!isSecureContext) {
    return {
      kind: "unsupported",
      title: "Camera scanning needs HTTPS",
      message:
        "Open the app over HTTPS to use the camera. Manual barcode or SKU entry still works.",
    };
  }

  if (!hasBarcodeDetector) {
    return {
      kind: "unsupported",
      title: "This browser cannot scan barcodes",
      message:
        "Use Chrome on Android for camera scanning, or type the barcode or SKU below.",
    };
  }

  return { kind: "ready" };
}
