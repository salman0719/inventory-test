-- Retire the Phase 0 placeholder tables.
--
-- `tenants`, `users`, `memberships` and `audit_events` were scaffolding: no
-- application code ever read them, no migration ever created them, and the
-- approved model (Gate C, docs/plans/phase-3-architecture.md) is
-- businesses / business_members plus the stock ledger.
--
-- Guarded with IF EXISTS so a database that never had them migrates cleanly.

DROP TABLE IF EXISTS "audit_events" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "memberships" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "users" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "tenants" CASCADE;
