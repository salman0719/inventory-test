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
- **DR4 — Update is a separate, opt-in choice.** SKU is the key, and the SKU and
  stock never change. Update mode applies only the values the file carries: a
  mapped column with a blank cell, or a column that is absent, keeps the stored
  value. The default supplier link is applied from the row's supplier, or from the
  supplier chosen for the file. **Revised 2026-11-26:** the original rule wrote
  every product column, so a four-column price list cleared the barcode, category,
  description, selling price and target stock and reset unit/reorder to their
  defaults. `0023_import_update_preserves_fields.sql` makes products match the
  supplier import's blank-cell rule.
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
- **DR10 — Text decoding and blank rows are explicit.** UTF-8 is strict; UTF-16
  with a BOM is decoded; invalid UTF-8 falls back to Windows-1252 with a visible
  notice. Interior blank rows are preserved and counted; the final line terminator
  is not a row. Delimiter detection runs on a blank-skipping pass, then the file is
  reparsed with that delimiter so the blanks survive.
- **DR11 — The header row is suggested, not assumed.** The first five records are
  scored as header candidates. A row must map both Product name and SKU; exact
  labels outweigh aliases, a full-width row outweighs a one-cell title, and mapped
  columns with data beneath them outweigh an empty shell. The highest score is
  preselected and labelled “Suggested”; the Header row selector remains available,
  and a headerless file gets no suggestion. No model is involved.

## Consequences

- H1 imports products only. Supplier import, product/supplier exports and the
  round-trip template are H2 and remain unbuilt.
  **Update 2026-11-26:** supplier import shipped as H2 in
  `0022_supplier_import.sql` (name is the key; an update fills only the fields the
  file carries). Supplier export and the round-trip template are still unbuilt.
- The screen is reached from Products (header and empty catalogue) and Settings;
  there is no tenth rail item.
- `0021_csv_import.sql` is local only. Hosted remains at 13 tracked migrations
  until `0013`–`0021` ship together before the code.
- The demo reset clears `csv_imports` with the rest of the business's demo data
  (`0024_reset_clears_import_history.sql`). Before that, Recent imports still
  listed runs whose products the reset had deleted; the manual checklist surfaced
  the gap.
- An import cannot blank an optional product field: a blank cell keeps the stored
  value. Clearing a value is done in the product form. This is deliberate and
  matches the supplier rule.
- The database function and its 15 tests are the authority; the 37 contract tests
  cover decoding, parsing, header suggestion, mapping and row evaluation.
