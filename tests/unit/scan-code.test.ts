import { describe, expect, it } from "vitest";
import { manualScanHref, normalizeScanInput } from "../../src/lib/scan-code";

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
