import { describe, expect, it } from "vitest";
import {
  manualScanHref,
  normalizeScanInput,
  scannerSupport,
} from "../../src/lib/scan-code";

describe("scan input", () => {
  it("keeps a bare barcode or SKU as typed", () => {
    expect(normalizeScanInput("  9300675024235 ")).toBe("9300675024235");
    expect(normalizeScanInput("CAF-001")).toBe("CAF-001");
    expect(normalizeScanInput("")).toBe("");
  });

  it("extracts the id from our own QR URL", () => {
    expect(
      normalizeScanInput(
        "https://inventory.example/scan/22222222-2222-4222-8222-222222222222",
      ),
    ).toBe("22222222-2222-4222-8222-222222222222");
    expect(
      normalizeScanInput(
        "https://inventory.example/scan/22222222-2222-4222-8222-222222222222?from=label",
      ),
    ).toBe("22222222-2222-4222-8222-222222222222");
  });

  it("treats some other URL as text rather than guessing", () => {
    expect(normalizeScanInput("https://example.com/product/123")).toBe(
      "https://example.com/product/123",
    );
  });

  it("builds a manual link that encodes arbitrary codes", () => {
    expect(manualScanHref("A/B 1")).toBe("/scan?code=A%2FB%201");
    expect(manualScanHref("   ")).toBe("/scan");
  });
});

describe("scanner support", () => {
  const android =
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126";

  it("is ready only on Android with the detector and a secure context", () => {
    expect(
      scannerSupport({
        userAgent: android,
        hasBarcodeDetector: true,
        isSecureContext: true,
      }),
    ).toEqual({ kind: "ready" });
  });

  it("tells a desktop user the feature is Android-only", () => {
    const support = scannerSupport({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      hasBarcodeDetector: false,
      isSecureContext: true,
    });
    expect(support.kind).toBe("unsupported");
    if (support.kind === "unsupported") {
      expect(support.title).toMatch(/Android/);
      expect(support.message).toMatch(/type a barcode or SKU/i);
    }
  });

  it("explains insecure or detector-less Android browsers", () => {
    const insecure = scannerSupport({
      userAgent: android,
      hasBarcodeDetector: true,
      isSecureContext: false,
    });
    expect(insecure.kind).toBe("unsupported");
    if (insecure.kind === "unsupported") {
      expect(insecure.title).toMatch(/HTTPS/);
    }

    const noDetector = scannerSupport({
      userAgent: android,
      hasBarcodeDetector: false,
      isSecureContext: true,
    });
    expect(noDetector.kind).toBe("unsupported");
    if (noDetector.kind === "unsupported") {
      expect(noDetector.message).toMatch(/Chrome on Android/);
    }
  });
});
