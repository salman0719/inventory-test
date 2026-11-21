# 0002 Product baseline

- **Date:** 2026-11-21
- **Status:** Accepted
- **Context:** The project brief for the inventory pre-MVP kit, now distributed
  into `docs/`, records the decisions that were settled before any code.
- **Decision:** Adopt the following as the starting baseline.
- **Approved by:** Project owner (brief), recorded on import.

## Two switchable demo businesses

- **Status:** Accepted
- Demo Cafe and Demo Retail share one generic inventory engine.
- The selector changes business context. Database isolation is enforced through
  RLS, not by the selector.

## Core inventory and purchasing only

- **Status:** Accepted
- Product catalogue, suppliers, stock movements, purchase orders, partial
  receiving, dashboard and basic reports are in scope.
- Recipes, POS/accounting integrations, forecasting, manufacturing and complex
  ERP are excluded. See `docs/product-scope.md`.

## One primary agent

- **Status:** Accepted
- One primary agent owns the workflow. It may use tools internally but does not
  create a multi-agent process unless the user approves.

## Supabase Storage as the storage default

- **Status:** Accepted as default direction
- Use Supabase Storage for product images and optional attachments. Do not add
  UploadThing. Depends on the stack decision in `0003-stack-target.md`.

## Supabase Auth as the auth default

- **Status:** Accepted as default direction
- Use Supabase Auth. Do not add Better Auth alongside it, and do not build a
  custom authentication system. Depends on `0003-stack-target.md`.
