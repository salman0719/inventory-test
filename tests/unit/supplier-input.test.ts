import { describe, expect, it } from "vitest";
import { supplierInputSchema } from "../../src/lib/supplier-input";

const valid = {
  name: "Fresh Fields Produce",
  contactName: "",
  email: "",
  phone: "",
  address: "",
  notes: "",
  leadTimeDays: "",
};

function parse(overrides: Partial<typeof valid>) {
  return supplierInputSchema.safeParse({ ...valid, ...overrides });
}

describe("supplier input", () => {
  it("accepts a name on its own", () => {
    const result = parse({});
    expect(result.success).toBe(true);
    expect(result.data?.name).toBe("Fresh Fields Produce");
  });

  it("turns blank optionals into null", () => {
    const result = parse({});
    expect(result.data?.contactName).toBeNull();
    expect(result.data?.email).toBeNull();
    expect(result.data?.phone).toBeNull();
    expect(result.data?.address).toBeNull();
    expect(result.data?.notes).toBeNull();
  });

  it("requires a name", () => {
    expect(parse({ name: "   " }).success).toBe(false);
  });

  it("validates an email only when one is given", () => {
    expect(parse({ email: "orders@freshfields.invalid" }).success).toBe(true);
    expect(parse({ email: "not-an-email" }).success).toBe(false);
  });

  it("keeps the other fields as free text", () => {
    const result = parse({ phone: "02 5550 3142", address: "12 Kembla Rd" });
    expect(result.data?.phone).toBe("02 5550 3142");
    expect(result.data?.address).toBe("12 Kembla Rd");
  });

  it("reads a blank lead time as unknown", () => {
    expect(parse({}).data?.leadTimeDays).toBeNull();
  });

  it("accepts whole days from 0 to 365", () => {
    expect(parse({ leadTimeDays: "0" }).data?.leadTimeDays).toBe(0);
    expect(parse({ leadTimeDays: "2" }).data?.leadTimeDays).toBe(2);
    expect(parse({ leadTimeDays: "365" }).data?.leadTimeDays).toBe(365);
  });

  it("refuses a lead time that is not whole days in range", () => {
    expect(parse({ leadTimeDays: "366" }).success).toBe(false);
    expect(parse({ leadTimeDays: "-1" }).success).toBe(false);
    expect(parse({ leadTimeDays: "2.5" }).success).toBe(false);
    expect(parse({ leadTimeDays: "two" }).success).toBe(false);
  });
});
