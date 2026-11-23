"use client";

import { useTransition } from "react";
import { selectBusiness } from "@/app/(app)/actions";
import type { BusinessOption } from "@/lib/active-business";
import { RouteProgress } from "./route-progress";

/**
 * The demo business selector required by Gate A. Switching it must change the
 * dataset on every screen, so the choice is stored in a cookie, the whole layout is
 * revalidated and the action redirects to the dashboard.
 *
 * That redirect is a route change, which `loading.tsx` alone cannot acknowledge on
 * the screen being left, so the transition renders the same top-of-viewport bar a
 * link click does.
 */
export function BusinessSwitcher({
  businesses,
  active,
}: {
  businesses: BusinessOption[];
  active: BusinessOption | null;
}) {
  const [pending, startTransition] = useTransition();

  if (businesses.length === 0) {
    return (
      <p className="text-[12px] text-ink-muted">
        No businesses visible. Run{" "}
        <code className="font-mono">npm run db:seed</code>.
      </p>
    );
  }

  return (
    <>
      <RouteProgress active={pending} />
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2">
          <span className="hidden text-[10px] uppercase tracking-[0.07em] text-ink-muted sm:inline">
            Business
          </span>
          <select
            value={active?.id ?? ""}
            disabled={pending}
            onChange={(event) => {
              const businessId = event.target.value;
              startTransition(async () => {
                await selectBusiness(businessId);
              });
            }}
            className="h-9 max-w-[180px] rounded border border-line bg-surface px-2 text-[13px] font-medium text-ink disabled:opacity-60 sm:max-w-none"
            aria-label="Active business"
          >
            {businesses.map((business) => (
              <option key={business.id} value={business.id}>
                {business.name}
              </option>
            ))}
          </select>
        </label>
        {active ? (
          <span className="hidden rounded border border-line bg-panel px-1.5 py-0.5 text-[10px] uppercase tracking-[0.06em] text-ink-muted sm:inline">
            {active.businessType}
          </span>
        ) : null}
      </div>
    </>
  );
}
