import { describe, expect, it } from "vitest";
import { assessScanDevice, scannerSupport } from "../../src/lib/scan-device";

const chromeAndroid =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile Safari/537.36";
const desktopChrome =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36";
const iphone =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1";

const baseSupport = {
  hasBarcodeDetector: true,
  hasWebAssembly: true,
  hasCamera: true,
  hasWorker: true,
  isSecureContext: true,
};

describe("scanner support", () => {
  it("prefers the built-in detector", () => {
    expect(scannerSupport(baseSupport)).toEqual({
      kind: "ready",
      decoder: "native",
    });
  });

  it("uses the WASM reader when the detector is missing", () => {
    expect(
      scannerSupport({ ...baseSupport, hasBarcodeDetector: false }),
    ).toEqual({ kind: "ready", decoder: "wasm" });
  });

  it("refuses a browser with neither decoder", () => {
    const support = scannerSupport({
      ...baseSupport,
      hasBarcodeDetector: false,
      hasWebAssembly: false,
    });
    expect(support.kind).toBe("unsupported");
    if (support.kind === "unsupported") {
      expect(support.title).toMatch(/cannot decode/i);
      expect(support.message).toMatch(/Chrome on Android/);
    }
  });

  it("explains missing HTTPS, camera or worker support", () => {
    const insecure = scannerSupport({
      ...baseSupport,
      isSecureContext: false,
    });
    expect(insecure.kind).toBe("unsupported");
    if (insecure.kind === "unsupported")
      expect(insecure.title).toMatch(/HTTPS/);

    const noCamera = scannerSupport({ ...baseSupport, hasCamera: false });
    expect(noCamera.kind).toBe("unsupported");
    if (noCamera.kind === "unsupported") {
      expect(noCamera.message).toMatch(/type the barcode or SKU/i);
    }

    const noWorker = scannerSupport({ ...baseSupport, hasWorker: false });
    expect(noWorker.kind).toBe("unsupported");
    if (noWorker.kind === "unsupported") {
      expect(noWorker.message).toMatch(/main thread/i);
    }
  });
});

describe("scan device profile", () => {
  it("recognises Chrome on Android and gives it no browser advisory", () => {
    const device = assessScanDevice({
      userAgent: chromeAndroid,
      deviceMemory: 8,
      hardwareConcurrency: 8,
    });
    expect(device.isChromeAndroid).toBe(true);
    expect(device.browserLabel).toBe("Chrome on Android");
    expect(device.tier).toBe("standard");
  });

  it("does not mistake other Android browsers for Chrome", () => {
    const samsung =
      "Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S918B) AppleWebKit/537.36 SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36";
    const webview =
      "Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36";

    expect(assessScanDevice({ userAgent: samsung }).isChromeAndroid).toBe(
      false,
    );
    expect(assessScanDevice({ userAgent: samsung }).browserLabel).toBe(
      "Samsung Internet",
    );
    expect(assessScanDevice({ userAgent: webview }).isChromeAndroid).toBe(
      false,
    );
  });

  it("labels a desktop or iPhone browser for the advisory", () => {
    expect(assessScanDevice({ userAgent: desktopChrome }).browserLabel).toBe(
      "this browser",
    );
    expect(assessScanDevice({ userAgent: iphone }).browserLabel).toBe("Safari");
  });

  it("flags low memory or very few CPU threads", () => {
    const lowMemory = assessScanDevice({
      userAgent: chromeAndroid,
      deviceMemory: 2,
      hardwareConcurrency: 8,
    });
    expect(lowMemory.tier).toBe("low");
    expect(lowMemory.reasons).toEqual(["2 GB of memory"]);

    const lowCpu = assessScanDevice({
      userAgent: chromeAndroid,
      deviceMemory: 4,
      hardwareConcurrency: 2,
    });
    expect(lowCpu.tier).toBe("low");
    expect(lowCpu.reasons).toEqual(["2 CPU threads"]);
  });

  it("does not guess when the browser hides both signals", () => {
    const device = assessScanDevice({ userAgent: iphone });
    expect(device.tier).toBe("unknown");
    expect(device.reasons).toEqual([]);
  });
});
