# 0015 Product CSV import is deterministic and review-first

- **Date:** 2026-11-26
- **Status:** Accepted for the pre-MVP; H1 implemented on `feat/csv-import`
- **Supersedes for this extension:** the "import is deferred" paragraph in
  `0007-gate-c-approval.md`. Export remains in the MVP; product import is an
  extension slice, built behind the same review and database gates.

## Context

A new business often starts with a supplier's spreadsheet. Typing a catalogue is
the slowest part of onboarding, but import is also the easiest place to write
hundreds of wrong rows. `0007` deferred it because duplicate SKUs, units, partial
failure and a dry run add more surface than the validation prototype needed.

The Slice H prototype explored AI column mapping. That was considered and left
out: deterministic header and alias matching handles tidy exports, a human maps
the rest, and every row is validated before any write. No model provider, key or
per-import request is involved.

## Decisions

- **DR1 — Deterministic mapping, manual fallback.** Exact header labels and a
  finite alias table (`Trade Price`, `Qty on hand`, `UOM`) are applied
  automatically and labelled. Anything else is a manual select or Ignore. The
  prototype's value-shape proposals are not in H1.
- **DR2 — The browser parses; the server decides.** Papa Parse reads the file in
  the browser for responsiveness, but only mapped rows are posted. Preview and
  confirm run the same evaluator (`src/lib/import-input.ts`), and
  `private.import_products` validates every field again before writing.
- **DR3 — Opening stock is creation-only.** A positive `Opening stock` writes one
  `opening` movement per new product, referencing the import. An existing SKU with
  a non-zero opening quantity is refused; stock corrections go through the ledger.
- **DR4 — Update is a separate, opt-in choice.** SKU is the key. In update mode
  catalogue fields and the default supplier link change; the SKU and stock do not.
- **DR5 — Categories may be created by default; suppliers only when ticked.** Both
  are matched case-insensitively, created at most once per run, and an ambiguous
  supplier name is refused rather than guessed. The preview lists every proposed
  name.
- **DR6 — Partial import is explicit.** Errors block by default. The operator may
  tick "Import valid rows only"; the skipped count is recorded and never silently
  dropped.
- **DR7 — One import row, one activity event.** `csv_imports` is history and the
  idempotency lock: unique on `(business_id, idempotency_key)`, so a double submit
  returns the first counts. A run writes one `import.completed` event, not one per
  product.
- **DR8 — Bounded input.** 500 data rows, 40 columns, 1 MB and the form's field
  limits. Over the cap is a refusal with a sentence, never a truncated import.
- **DR9 — No AI, no third-party processing.** The file is read locally; mapped rows
  go only to this application's server. Revisiting suggestions requires a new
  decision, a provider review and Gate D approval.

## Consequences

- H1 imports products only. Supplier import, product/supplier exports and the
  round-trip template are H2 and remain unbuilt.
- The screen is reached from Products (header and empty catalogue) and Settings;
  there is no tenth rail item.
- `0021_csv_import.sql` is local only. Hosted remains at 13 tracked migrations
  until `0013`–`0021` ship together before the code.
- The demo reset deletes products and the ledger but not `csv_imports`; the import
  history therefore survives a reset. This is recorded as a known limitation, not
  hidden.
- The database function and its 12 tests are the authority; the 28 contract tests
  cover parsing, mapping and row evaluation.
