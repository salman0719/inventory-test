# 0016 Excel import is `.xlsx` only, read in the browser

- **Date:** 2026-11-26
- **Status:** Accepted for a later slice; not implemented. The shipped import
  still reads delimited text only.
- **Extends:** `0015-csv-import.md`. DR2 (browser parses, server decides) and DR8
  (bounded input) apply unchanged.
- **Relates to:** `docs/known-limitations.md` (Excel row),
  `local/feature-extension-scope/scope.html` §10.

## Context

H1 shipped comma, semicolon and tab separated text. Workbooks were deferred
because they are a second format with its own parsing, bounds and semantics, not
a different file extension on the same reader. The deferral is recorded in
`0015`, in scope §10 and in the known-limitations table.

What the shipped screen actually does with those bytes is worse than the
limitation says: `accept` narrows the picker but nothing in `readFile` checks the
extension, the MIME type or the magic bytes. A workbook that reaches the input is
decoded as Windows-1252 and parsed as text, then either fails on an unrelated
rule ("The file has 73 columns. The limit is 40.") or advances to column matching
with zip bytes as headers. Measured by replaying that read path in
`local/csv-import-lab/workbook-probe/`: a 2.4 KB `.xlsx` with 10 products reached
step 2, a 33 KB workbook failed on 73 columns, an OLE2 `.xls` reached step 2 with
2 columns.

The product decision is that Excel workbooks are worth supporting, because a new
business's catalogue usually arrives as one, and that the support is narrow.

## Decisions

- **DR1 — `.xlsx` only.** OOXML workbooks (`.xlsx`) are the supported format.
  `.xls` (BIFF8 in an OLE2 container), `.xlsb`, `.ods` and `.xlsm` are refused
  with a sentence naming the format and the way out (Save As → `.xlsx`, or CSV
  UTF-8). Rationale: `.xls` needs a different parser and a second supply-chain
  review for a format Excel has not written by default since 2007; `.xlsm` carries
  macros this application will never run.
- **DR2 — `read-excel-file` is the parser.** MIT, read-only, no styling or
  writing surface, and it does not pull a formula engine in with it. Rejected:
  the `xlsx` package, because npm stopped at 0.18.5 (2022) with
  CVE-2023-30533 (prototype pollution, fixed 0.19.3) and CVE-2024-22363 (ReDoS,
  fixed 0.20.2) unpatched there — the fixed builds exist only on
  `cdn.sheetjs.com`, which is a tarball from a vendor URL rather than a registry
  release, and that is a supply-chain decision of its own; ExcelJS, because most
  of the package is the writing and styling surface this feature does not use.
- **DR3 — The workbook is parsed in the browser, in a worker.** `0015` DR2 stands:
  only mapped rows are posted, the server re-evaluates, and
  `private.import_products` validates a third time. Workbook decoding is
  synchronous and heavier than Papa's, so it moves into a Web Worker, following
  `src/components/scan/scan-decoder.worker.ts`. The server never receives a
  workbook and never parses one.
- **DR4 — One sheet per import, chosen explicitly.** A workbook with more than one
  non-empty sheet shows a sheet picker before column matching; the first sheet is
  preselected and named. No silent "first sheet wins", and no queued
  sheet-after-sheet import in one run. The workbook filename is what import
  history records, as it does today; the sheet name belongs to the review screen,
  not to a schema change.
- **DR5 — Bounds are checked before and after parse, and the zip is not trusted.**
  `0015` DR8's 500 rows, 40 columns and cell limits still apply to the parsed
  sheet. In addition: the magic bytes must be `50 4B 03 04` (a CFB/encrypted file
  is refused with "This workbook is password protected or an old `.xls`"); the
  decompressed size and the entry count are capped before the XML is read, so a
  small zip cannot expand into an unbounded parse; and the `file.size` cap alone
  is not treated as the bound. A workbook over 1 MB is still refused, but the
  message says it is a workbook limit, not a CSV one.
- **DR6 — Cell text is normalised explicitly, and silently-wrong data is refused.**
  The known traps in `scope.html` §10 are decision points, not implementation
  details: merged cells must not turn a repeated category into a blank; a
  percentage-formatted cost must not arrive as `0.15`; a formula with no cached
  value must not become `0`; a numeric SKU or barcode must not silently lose its
  leading zeros; hidden rows, columns and sheets are read as if visible, and the
  review says so. Where a value cannot be recovered faithfully, the row is an
  error with a sentence, not a guess.
- **DR7 — No links, macros or external references are followed.** External
  workbook links, defined names and hyperlinks are inert text or ignored. Nothing
  in a workbook is executed, fetched or resolved.

## Consequences

- Nothing is built by this record. `/import` still behaves as described in
  Context: the picker hides workbooks, and bytes that get through are parsed as
  text. A magic-byte refusal in `readFile` is the small interim fix; it makes the
  screen honest and is independent of this feature, and it is also unstarted.
- `read-excel-file` is not a dependency yet, and adding it is part of that slice,
  with the usual "explain a new dependency" note in the commit.
- The download template stays CSV. A workbook template would be a second artefact
  and is not implied by accepting `.xlsx`.
- The parser choice and the `.xls` refusal must be revisited if customer
  validation shows old workbooks are common; that is a new record, not an edit to
  this one.
- Open at implementation, to be settled in code and recorded then: how a date cell
  is turned into text, whether a sheet with only a header counts as empty, and
  whether the sheet picker lives on step 1 or step 2.
