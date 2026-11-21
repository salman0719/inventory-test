# saas-shell starter

Empty multi-tenant app shell. Built from scratch; core only.

Scope: docs (scope + decisions + plans + runbooks + tech-debt), compose (db + Mailpit + Adminer profile), CI order, `db/` tenants/users/memberships/audit, `src/lib` contracts, role-token CSS + one theme slot, magic-link auth, ops seams, smoke + perf-budget + E2E harness, dynamic ports.

Core stays small: tenancy, auth, docs, and guards. Add a new domain or billing module only through a decision.

Ports: no hardcoded app port. `PORT` is the single source. Run `npm run new:ports` on creation to generate `.env.local` (`PORT/APP_URL/DATABASE_URL/MAILPIT_URL` + compose host ports). `npm run dev` reads `PORT`.
