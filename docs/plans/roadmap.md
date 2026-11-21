# Roadmap and Approval Gates

This is a staged plan. Do not skip approval gates to save time.

Slice-level progress, the current phase and the next action live in
`docs/implementation-status.md`. Keep this file as the plan, not the log.

## Phase 0: Repository and project discovery

**Goal:** Understand the starting point before changing anything.

Tasks:

- Inspect the repository, existing code, package manager, deployment state, and current conventions.
- Read all project instructions.
- Identify missing information and existing constraints.
- Do not overwrite existing work without explaining why.

Deliverable:

- Short repository assessment.
- Proposed immediate plan.
- List of assumptions and questions.

Approval: not required for inspection. Ask before destructive changes.

## Phase 1: Product and public-source research

**Goal:** Define the product around real small-business workflows.

Tasks:

- Research public product pages, public help centres, public documentation, public API documentation, and public videos from relevant inventory products.
- Include Australian SMB context where evidence is available.
- Compare common workflows and terminology.
- Identify likely baseline expectations and potential gaps for small operators.
- Do not access restricted competitor environments or use a service contrary to its terms.

Deliverables:

- `docs/competitor-research.md`
- Prioritised feature list.
- User personas and core jobs-to-be-done.
- Initial product assumptions and risks.
- Proposed navigation and user journeys.

Approval Gate A: user reviews the discovery findings and confirms scope.

## Phase 2: Interactive design exploration

**Goal:** Explore alternatives before committing to a visual direction.

Create at least three distinct, interactive design directions. They should be usable prototypes with clickable navigation and representative screens, not static mockups.

Each direction should include:

- Dashboard.
- Products list and product detail.
- Inventory view and stock adjustment.
- Supplier list/detail.
- Purchase order list and receiving flow.

Explore meaningful differences in:

- Visual identity and colour palette.
- Navigation model.
- Dashboard hierarchy.
- Table density versus cards.
- Use of drawers, modals, inline editing, and full-page forms.
- Filters and search.
- Mobile behaviour.
- Empty and error states.

Deliverables:

- Three interactive alternatives.
- Pros and cons for each.
- Recommendation and rationale.
- Proposed design tokens and reusable components for the selected direction.

Approval Gate B: user chooses or combines a direction. Do not build the complete product UI before this approval.

## Phase 3: Architecture and data design

**Goal:** Make critical design decisions before implementation.

Deliverables:

- Architecture diagram or concise architecture description.
- Database schema and relationships.
- RLS and tenant isolation plan.
- Stock ledger design.
- Transactional receiving design.
- Auth and storage approach.
- Deployment/environment plan.
- Testing plan.
- Main risks and mitigations.

Approval Gate C: user approves architecture and schema.

## Phase 4: Infrastructure setup

**Goal:** Prepare the smallest viable development and deployment environment.

Tasks:

- GitHub repository and branch strategy.
- Supabase project and environment variables.
- Database migrations and seed process.
- Supabase Auth setup.
- Supabase Storage buckets and policies.
- Vercel project and preview deployment.

Before any account changes:

- Explain the action.
- Identify permissions and cost implications.
- Ask for approval before paid resources, billing changes, plan upgrades, or public deployment.

Approval Gate D: user approves infrastructure actions and deployment target.

## Phase 5: Core implementation

Recommended order:

1. App shell, navigation, responsive layout, business selector.
2. Database schema, RLS, seed data, and reset workflow.
3. Authentication and protected routes.
4. Products and categories.
5. Suppliers.
6. Stock ledger and inventory screens.
7. Purchase orders and transactional receiving.
8. Dashboard derived from real data.
9. Reports, search, filters, CSV import/export.
10. Product image upload and remaining storage UX.

Implement in small vertical slices. Each slice should be usable and tested.

Progress: slice 1 (shell, navigation, responsive layout, business selector) is
implemented locally and uncommitted, awaiting a layout review before
authentication. See `docs/implementation-status.md`.

## Phase 6: Validation and hardening

Tasks:

- Test all key user journeys.
- Verify partial and full receiving.
- Verify no stock is added twice.
- Verify business switching and tenant isolation.
- Test empty, loading, validation, and error states.
- Test responsive behaviour.
- Verify seeded data and repeatable reset.
- Run automated tests and fix critical defects.
- Deploy a reviewable demo only after approval.

Deliverables:

- Test results.
- Known limitations.
- Demo walkthrough.
- Updated implementation status.

## Phase 7: Customer validation

Tasks:

- Demonstrate to one or two familiar potential customers.
- Observe what they understand without explanation.
- Ask about their current process and pain points.
- Record objections, missing workflows, and willingness to trial/pay.
- Separate actual customer statements from agent interpretation.

Deliverable:

- Completed `docs/customer-validation.md`.
- Prioritised changes.
- Recommendation on whether to proceed to a production MVP.

## Suggested time budget

A rough planning estimate, not a promise:

- Discovery: 1 to 2 days.
- Design exploration: 1 to 2 days.
- Architecture and setup: 1 to 2 days.
- Core build: 3 to 5 days.
- Validation and polish: 1 to 2 days.

The schedule depends on agent capability, integration friction, review turnaround, and scope discipline. Do not sacrifice stock correctness or tenant isolation to meet a date.
