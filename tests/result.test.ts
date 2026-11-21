import { describe, expect, it } from "vitest";
import { err, ok } from "@/lib/result";

describe("result", () => {
  it("wraps a value as ok", () => {
    expect(ok(1)).toEqual({ ok: true, value: 1 });
  });

  it("wraps an error as err", () => {
    expect(err("boom")).toEqual({ ok: false, error: "boom" });
  });
});
