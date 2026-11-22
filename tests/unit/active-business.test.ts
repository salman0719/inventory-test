import { describe, expect, it } from "vitest";
import {
  pickBusiness,
  type BusinessOption,
} from "../../src/lib/active-business";

const cafe: BusinessOption = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Demo Cafe",
  businessType: "cafe",
  currencyCode: "AUD",
  role: "owner",
};

const retail: BusinessOption = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Demo Retail",
  businessType: "retail",
  currencyCode: "AUD",
  role: "staff",
};

describe("business selection", () => {
  it("returns the business named by the cookie", () => {
    expect(pickBusiness([cafe, retail], retail.id)?.id).toBe(retail.id);
  });

  it("falls back to the first business when the cookie is missing or unknown", () => {
    expect(pickBusiness([cafe, retail], undefined)?.id).toBe(cafe.id);
    expect(pickBusiness([cafe, retail], "not-a-business")?.id).toBe(cafe.id);
    expect(pickBusiness([cafe, retail], null)?.id).toBe(cafe.id);
  });

  it("never invents a business when none are visible", () => {
    expect(pickBusiness([], retail.id)).toBeNull();
  });

  it("does not accept a business id the caller was not given", () => {
    expect(pickBusiness([cafe], retail.id)?.id).toBe(cafe.id);
  });
});
