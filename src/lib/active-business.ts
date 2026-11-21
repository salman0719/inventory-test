/**
 * The demo business selector. Until authentication exists, the chosen business is
 * a cookie; the pure part lives here so it can be tested without a request.
 */
export const BUSINESS_COOKIE = "demo_business";

export type BusinessType = "cafe" | "retail" | "other";

export type BusinessOption = {
  id: string;
  name: string;
  businessType: BusinessType;
  currencyCode: string;
};

/**
 * Resolve the selected business: an exact match on the cookie, otherwise the
 * first visible business. Never returns an id the caller was not given.
 */
export function pickBusiness(
  businesses: BusinessOption[],
  selectedId: string | undefined | null,
): BusinessOption | null {
  return (
    businesses.find((business) => business.id === selectedId) ??
    businesses[0] ??
    null
  );
}
