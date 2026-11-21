# Technical Architecture

## Preferred stack

- Next.js + TypeScript
- Tailwind CSS + shadcn/ui
- Supabase PostgreSQL
- Supabase Auth
- Supabase Storage
- Vercel
- GitHub

Keep the architecture simple and suitable for a short-lived validation prototype.

## Application shape

- Next.js application for UI and server-side operations.
- Supabase PostgreSQL as the primary data store.
- Supabase Auth for sign-in and session management.
- Supabase RLS for tenant/business data isolation.
- Supabase Storage for images and optional attachments.
- Vercel for hosting and preview deployments.

Do not add a separate API server unless a concrete need emerges. Prefer server actions or route handlers for privileged and transactional operations, with clear boundaries.

## Authentication

Prototype requirements:

- Email/password sign-in.
- Logout.
- Password reset.
- Persistent sessions.
- Protected application routes.
- User-to-business membership association.
- Business selector for switching active business.

Do not implement social sign-in, MFA, complex roles, invitations, or enterprise SSO initially.

Do not create a custom authentication system. Do not add Better Auth alongside Supabase Auth.

## Storage

Use Supabase Storage rather than introducing UploadThing at this stage.

Potential buckets:

- `product-images`: product images, organised by business ID.
- `supplier-images`: optional supplier logos/images.
- `attachments`: private purchase-order or invoice attachments if later required.

Guidance:

- Store object paths and metadata in Postgres, not image binaries.
- Use public access only for assets that are intentionally public.
- Use private buckets and signed URLs for private documents.
- Validate file type and size.
- Handle upload progress, failure, retry, preview, replacement, and deletion.
- Enforce business ownership in storage policies.
- Do not build attachment handling until a real workflow needs it.

## Environments

At minimum:

- Local development.
- Supabase development project.
- Vercel preview deployment.
- Production-like demo deployment only after user approval.

Use separate environment variables. Never commit secrets. Provide `.env.example`.

## Business isolation

Every tenant-owned table should include `business_id` or have an unambiguous relationship to a tenant-owned parent.

RLS policies must ensure a user can only access businesses they are a member of. The active business ID in the UI is not a security boundary.

Add tests or explicit verification steps for cross-business access attempts.

## Server-side integrity

Use server-side validation and database constraints. Critical multi-row operations must be transactional.

For stock receiving, use a Postgres function/RPC or another transaction-safe server-side mechanism. Do not expose a privileged service key to the client.

## Observability and operations

For the prototype:

- Useful server logs for errors.
- Clear UI error messages.
- Basic audit/movement history for inventory.
- Repeatable database migrations and seed data.
- A documented reset procedure.

Avoid adding paid monitoring or analytics until approved.
