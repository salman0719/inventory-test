import { describe, expect, it } from "vitest";
import {
  LABELS_PER_PAGE,
  labelPageCount,
  scanPath,
  scanUrl,
} from "../../src/lib/product-labels";

const ID = "22222222-2222-4222-8222-222222222222";

describe("product labels", () => {
  it("encodes only the stable scan route, never mutable product facts", () => {
    expect(scanPath(ID)).toBe(`/scan/${ID}`);
    expect(scanUrl("https://inventory.example", ID)).toBe(
      `https://inventory.example/scan/${ID}`,
    );
    expect(scanUrl("https://inventory.example/", ID)).toBe(
      `https://inventory.example/scan/${ID}`,
    );
  });

  it("paginates the 3 × 7 A4 sheet", () => {
    expect(LABELS_PER_PAGE).toBe(21);
    expect(labelPageCount(0)).toBe(1);
    expect(labelPageCount(21)).toBe(1);
    expect(labelPageCount(22)).toBe(2);
  });
});
