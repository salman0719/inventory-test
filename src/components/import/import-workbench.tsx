"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, type ChangeEvent } from "react";
import {
  confirmProductImport,
  previewProductImport,
  type ConfirmImportResult,
} from "@/app/(app)/import/actions";
import { toCsv } from "@/lib/csv";
import type { CsvImportSummary, ImportPageData } from "@/lib/csv-import";
import {
  IMPORT_FIELDS,
  IMPORT_LIMITS,
  mapHeaders,
  productTemplateRows,
  sampleValues,
  type ColumnMatch,
  type ImportEvaluation,
  type ImportField,
  type ImportOptions,
} from "@/lib/import-input";
import { formatMoney } from "@/lib/product-input";

const INPUT = "h-9 rounded border border-line bg-surface px-2 text-[13px]";
const LABEL = "text-[10px] uppercase tracking-[0.07em] text-ink-muted";
const SECONDARY =
  "inline-flex min-h-[36px] items-center justify-center rounded border border-line bg-surface px-3 text-[12px] font-medium hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50";
const PRIMARY =
  "inline-flex min-h-[36px] items-center justify-center rounded bg-accent px-3 text-[12px] font-semibold text-on-accent disabled:cursor-not-allowed disabled:bg-line disabled:text-ink-faint";

type Step = 1 | 2 | 3 | 4;

const STEPS = ["Choose a file", "Match columns", "Review", "Done"] as const;

const DEFAULT_OPTIONS: ImportOptions = {
  updateExisting: false,
  createSuppliers: false,
  createCategories: true,
  partial: false,
};

type ImportResult = Extract<ConfirmImportResult, { ok: true }>;

export function ImportWorkbench({
  data,
  currency,
}: {
  data: ImportPageData;
  currency: string;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filename, setFilename] = useState("");
  const [rows, setRows] = useState<string[][]>([]);
  const [headerRow, setHeaderRow] = useState(1);
  const [mapping, setMapping] = useState<ColumnMatch[]>([]);
  const [defaultSupplierId, setDefaultSupplierId] = useState("");
  const [options, setOptions] = useState<ImportOptions>(DEFAULT_OPTIONS);
  const [evaluation, setEvaluation] = useState<ImportEvaluation | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );

  const headers = rows[headerRow - 1] ?? [];
  const dataRowCount = Math.max(rows.length - headerRow, 0);
  const mapped = new Set(
    mapping
      .map((match) => match.field)
      .filter((field): field is ImportField => field !== null),
  );
  const mappingComplete = mapped.has("name") && mapped.has("sku");
  const openingCount =
    evaluation?.rows.filter(
      (row) => row.status === "new" && Number(row.values?.opening ?? 0) > 0,
    ).length ?? 0;

  function buildRequest(nextOptions: ImportOptions) {
    return {
      filename: filename.trim() === "" ? "products.csv" : filename,
      rowOffset: headerRow + 1,
      rows: rows.slice(headerRow),
      mapping: mapping.map((match) => ({
        index: match.index,
        field: match.field,
      })),
      defaultSupplierId: defaultSupplierId === "" ? null : defaultSupplierId,
      options: nextOptions,
      idempotencyKey,
    };
  }

  async function readFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setError(null);
    if (file.size > IMPORT_LIMITS.bytes) {
      setError(
        `That file is ${(file.size / 1_000_000).toFixed(1)} MB. The limit is 1 MB.`,
      );
      return;
    }

    try {
      const text = await file.text();
      const Papa = (await import("papaparse")).default;
      const parsed = Papa.parse<string[]>(text, {
        skipEmptyLines: "greedy",
      });
      if (parsed.errors.length > 0) {
        setError(
          `The CSV could not be read: ${parsed.errors[0]?.message ?? "unknown error"}.`,
        );
        return;
      }

      const parsedRows = parsed.data.map((row) =>
        row.map((cell) => String(cell ?? "")),
      );
      if (parsedRows.length < 2) {
        setError("The file needs a header row and at least one product row.");
        return;
      }

      const columns = Math.max(...parsedRows.map((row) => row.length));
      if (columns > IMPORT_LIMITS.columns) {
        setError(
          `The file has ${columns} columns. The limit is ${IMPORT_LIMITS.columns}.`,
        );
        return;
      }
      if (parsedRows.length > 600) {
        setError(
          "That file has more than 500 product rows. Split it before importing.",
        );
        return;
      }

      const firstMapping = mapHeaders(parsedRows[0] ?? []);
      setRows(parsedRows);
      setFilename(file.name);
      setHeaderRow(1);
      setMapping(firstMapping);
      setDefaultSupplierId("");
      setOptions(DEFAULT_OPTIONS);
      setEvaluation(null);
      setResult(null);
      setIdempotencyKey(crypto.randomUUID());
      setStep(2);
    } catch {
      setError("The file could not be read. Save it as a CSV and try again.");
    }
  }

  function chooseHeaderRow(value: number) {
    setHeaderRow(value);
    setMapping(mapHeaders(rows[value - 1] ?? []));
    setEvaluation(null);
  }

  function chooseField(index: number, field: ImportField | "") {
    setMapping((current) =>
      current.map((match, currentIndex) => {
        if (currentIndex === index) {
          return { ...match, field: field === "" ? null : field, source: null };
        }
        if (field !== "" && match.field === field) {
          return { ...match, field: null, source: null };
        }
        return match;
      }),
    );
  }

  async function preview(nextOptions: ImportOptions = options) {
    setError(null);
    if (!mappingComplete) {
      setError("Map Product name and SKU before checking the file.");
      return;
    }
    if (dataRowCount > IMPORT_LIMITS.rows) {
      setError(
        `This file has ${dataRowCount} product rows. The limit is ${IMPORT_LIMITS.rows}; split it before importing.`,
      );
      return;
    }

    setBusy(true);
    try {
      const response = await previewProductImport(buildRequest(nextOptions));
      if (!response.ok) {
        setError(response.error);
        return;
      }
      setEvaluation(response.evaluation);
      setStep(3);
    } catch {
      setError("The file could not be checked. Reload and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function changeOption(key: keyof ImportOptions, value: boolean) {
    const next = { ...options, [key]: value };
    setOptions(next);
    if (key === "partial") return;
    await preview(next);
  }

  async function confirm() {
    setError(null);
    setBusy(true);
    try {
      const response = await confirmProductImport(buildRequest(options));
      if (!response.ok) {
        setError(response.error);
        return;
      }
      setResult(response);
      setStep(4);
      router.refresh();
    } catch {
      setError("The import was not saved. Reload and try again.");
    } finally {
      setBusy(false);
    }
  }

  function anotherFile() {
    setStep(1);
    setRows([]);
    setFilename("");
    setMapping([]);
    setHeaderRow(1);
    setDefaultSupplierId("");
    setOptions(DEFAULT_OPTIONS);
    setEvaluation(null);
    setResult(null);
    setError(null);
    setIdempotencyKey(crypto.randomUUID());
  }

  function downloadTemplate() {
    const blob = new Blob([toCsv(productTemplateRows())], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "product-import-template.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex max-w-[980px] flex-col gap-3">
      <ol className="flex flex-wrap gap-1.5" aria-label="Import steps">
        {STEPS.map((label, index) => {
          const number = (index + 1) as Step;
          const current = step === number;
          const complete = step > number;
          return (
            <li
              key={label}
              aria-current={current ? "step" : undefined}
              className={`flex items-center gap-1.5 rounded border px-2 py-1 text-[11px] ${
                current
                  ? "border-accent bg-accent-soft text-accent"
                  : complete
                    ? "border-success/40 bg-success-soft text-success"
                    : "border-line bg-surface text-ink-muted"
              }`}
            >
              <span className="grid h-5 w-5 place-items-center rounded-full border border-current font-mono text-[10px]">
                {number}
              </span>
              {label}
            </li>
          );
        })}
      </ol>

      {error ? (
        <p
          role="alert"
          className="rounded border border-danger/40 bg-danger-soft px-3 py-2 text-[12px] text-danger"
        >
          {error}
        </p>
      ) : null}

      {step === 1 ? (
        <>
          <div className="grid gap-3 min-[760px]:grid-cols-2">
            <section className="rounded border border-line bg-surface">
              <header className="border-b border-line px-3 py-2">
                <h2 className="text-[13px] font-semibold">Upload a CSV</h2>
                <p className="text-[11px] text-ink-muted">
                  One row per product. The file is read in this browser; only
                  the mapped rows are sent to be checked.
                </p>
              </header>
              <div className="flex flex-col gap-2 px-3 py-3">
                <label className={`${PRIMARY} w-fit cursor-pointer`}>
                  Choose a CSV
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".csv,text/csv"
                    className="sr-only"
                    onChange={readFile}
                  />
                </label>
                <p className="text-[11px] text-ink-muted">
                  {IMPORT_LIMITS.rows} rows, {IMPORT_LIMITS.columns} columns and
                  1 MB maximum. Comma, semicolon and tab separated files are
                  read.
                </p>
              </div>
            </section>

            <section className="rounded border border-line bg-surface">
              <header className="border-b border-line px-3 py-2">
                <h2 className="text-[13px] font-semibold">
                  Start from the template
                </h2>
                <p className="text-[11px] text-ink-muted">
                  The template, the import and a future export share one column
                  list, so a template file maps without changes.
                </p>
              </header>
              <div className="flex flex-col gap-2 px-3 py-3">
                <button
                  type="button"
                  onClick={downloadTemplate}
                  className={`${SECONDARY} w-fit`}
                >
                  Download template
                </button>
                <p className="text-[11px] text-ink-muted">
                  Required columns: Product name and SKU. Unit, cost and reorder
                  level have defaults.
                </p>
              </div>
            </section>
          </div>

          <History history={data.history} />
        </>
      ) : null}

      {step === 2 ? (
        <section className="rounded border border-line bg-surface">
          <header className="flex flex-wrap items-start gap-x-3 gap-y-1 border-b border-line px-3 py-2">
            <div>
              <h2 className="text-[13px] font-semibold">Match your columns</h2>
              <p className="text-[11px] text-ink-muted">
                {filename} · {dataRowCount} product row
                {dataRowCount === 1 ? "" : "s"} · {headers.length} column
                {headers.length === 1 ? "" : "s"}
              </p>
            </div>
            <button
              type="button"
              className={`${SECONDARY} ml-auto`}
              onClick={anotherFile}
            >
              Choose another file
            </button>
          </header>

          <div className="flex flex-wrap items-end gap-3 border-b border-line px-3 py-2.5">
            <label className="flex flex-col gap-1">
              <span className={LABEL}>Header row</span>
              <select
                value={headerRow}
                onChange={(event) =>
                  chooseHeaderRow(Number(event.target.value))
                }
                className={INPUT}
              >
                {Array.from(
                  { length: Math.min(5, Math.max(rows.length - 1, 1)) },
                  (_, index) => index + 1,
                ).map((number) => (
                  <option key={number} value={number}>
                    Line {number}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex min-w-[240px] flex-col gap-1">
              <span className={LABEL}>Supplier for rows without one</span>
              <select
                value={defaultSupplierId}
                onChange={(event) => setDefaultSupplierId(event.target.value)}
                className={INPUT}
              >
                <option value="">Use a Supplier column</option>
                {data.suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="table-wrap overflow-x-auto">
            <table className="w-full min-w-[640px] text-[12px]">
              <thead>
                <tr className="border-b border-line bg-panel text-left text-[10px] uppercase tracking-[0.07em] text-ink-muted">
                  <th className="px-3 py-1.5 font-medium">CSV column</th>
                  <th className="px-3 py-1.5 font-medium">Sample values</th>
                  <th className="px-3 py-1.5 font-medium">Import as</th>
                </tr>
              </thead>
              <tbody>
                {mapping.map((match) => (
                  <tr
                    key={match.index}
                    className="border-b border-line last:border-0"
                  >
                    <td className="px-3 py-2 align-top">
                      <span className="font-medium">
                        {headers[match.index]?.trim() || "(blank header)"}
                      </span>
                      {match.field ? (
                        <span
                          className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                            match.source === "header" ||
                            match.source === "alias"
                              ? "bg-success-soft text-success"
                              : "bg-warning-soft text-warning"
                          }`}
                        >
                          {match.source === "header"
                            ? "Header"
                            : match.source === "alias"
                              ? "Alias"
                              : "Manual"}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 align-top text-ink-muted">
                      {sampleValues(rows.slice(headerRow), match.index).join(
                        " · ",
                      ) || "—"}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <select
                        aria-label={`Import ${headers[match.index] ?? "column"} as`}
                        value={match.field ?? ""}
                        onChange={(event) =>
                          chooseField(
                            match.index,
                            event.target.value as ImportField | "",
                          )
                        }
                        className={`${INPUT} w-full min-w-[180px]`}
                      >
                        <option value="">Ignore this column</option>
                        {IMPORT_FIELDS.map((field) => (
                          <option key={field.key} value={field.key}>
                            {field.label}
                            {field.required ? " (required)" : ""}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-line px-3 py-2.5">
            <p className="text-[11px] text-ink-muted">
              {mappingComplete
                ? "Product name and SKU are mapped."
                : "Map Product name and SKU to continue."}
            </p>
            <div className="ml-auto flex items-center gap-2">
              <button type="button" className={SECONDARY} onClick={anotherFile}>
                Back
              </button>
              <button
                type="button"
                className={PRIMARY}
                disabled={busy || !mappingComplete}
                onClick={() => preview()}
              >
                {busy ? "Checking…" : "Continue to review"}
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {step === 3 && evaluation ? (
        <ReviewStep
          evaluation={evaluation}
          options={options}
          busy={busy}
          currency={currency}
          openingCount={openingCount}
          onChangeOption={changeOption}
          onBack={() => {
            setError(null);
            setStep(2);
          }}
          onConfirm={confirm}
        />
      ) : null}

      {step === 4 && result ? (
        <>
          <section className="rounded border border-success/40 bg-success-soft px-4 py-3">
            <h2 className="text-[14px] font-semibold text-success">
              Import complete
            </h2>
            <p className="mt-0.5 text-[12px] text-ink">
              {result.imported} new product
              {result.imported === 1 ? "" : "s"}
              {result.updated > 0 ? `, ${result.updated} updated` : ""}
              {result.openingMovements > 0
                ? `, ${result.openingMovements} opening balance${
                    result.openingMovements === 1 ? "" : "s"
                  } written`
                : ""}
              {result.skipped > 0 ? `, ${result.skipped} skipped` : ""}.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Link
                href="/products"
                className="inline-flex min-h-[36px] items-center rounded bg-accent px-3 text-[12px] font-semibold text-on-accent"
              >
                Open products
              </Link>
              <Link
                href="/activity"
                className="inline-flex min-h-[36px] items-center rounded border border-line bg-surface px-3 text-[12px] font-medium hover:border-accent hover:text-accent"
              >
                View activity
              </Link>
              <button
                type="button"
                className="min-h-[36px] px-2 text-[12px] font-medium text-ink-muted hover:text-accent"
                onClick={anotherFile}
              >
                Import another file
              </button>
            </div>
          </section>

          <History history={data.history} />
        </>
      ) : null}
    </div>
  );
}

function ReviewStep({
  evaluation,
  options,
  busy,
  currency,
  openingCount,
  onChangeOption,
  onBack,
  onConfirm,
}: {
  evaluation: ImportEvaluation;
  options: ImportOptions;
  busy: boolean;
  currency: string;
  openingCount: number;
  onChangeOption: (key: keyof ImportOptions, value: boolean) => void;
  onBack: () => void;
  onConfirm: () => void;
}) {
  const { counts } = evaluation;
  const importable = counts.newRows + counts.updateRows;
  const skipped = counts.errorRows + counts.skippedRows;
  const errors = evaluation.rows
    .filter((row) => row.status === "error")
    .flatMap((row) => row.errors.map((message) => ({ row, message })));
  const warnings = evaluation.rows
    .filter((row) => row.warnings.length > 0)
    .flatMap((row) => row.warnings.map((message) => ({ row, message })));
  const preview = evaluation.rows
    .filter((row) => row.status === "new" || row.status === "update")
    .slice(0, 10);

  return (
    <section className="rounded border border-line bg-surface">
      <header className="border-b border-line px-3 py-2">
        <h2 className="text-[13px] font-semibold">Review the import</h2>
        <p className="text-[11px] text-ink-muted">
          Every row is checked against the current catalogue. Nothing is written
          until you confirm.
        </p>
      </header>

      <dl className="grid grid-cols-2 gap-2 px-3 py-2.5 min-[680px]:grid-cols-6">
        <Figure label="Rows" value={counts.totalRows} />
        <Figure label="New" value={counts.newRows} tone="success" />
        <Figure label="Update" value={counts.updateRows} />
        <Figure label="Opening" value={openingCount} />
        <Figure label="Skipped" value={counts.skippedRows} />
        <Figure label="Errors" value={counts.errorRows} tone="danger" />
      </dl>

      {errors.length > 0 ? (
        <div className="mx-3 mb-2.5 rounded border border-danger/40 bg-danger-soft px-2.5 py-2">
          <p className="text-[12px] font-medium text-danger">
            {counts.errorRows} row{counts.errorRows === 1 ? "" : "s"} cannot be
            imported
          </p>
          <ul className="mt-1 space-y-0.5 text-[11px] text-danger">
            {errors.slice(0, 30).map(({ row, message }, index) => (
              <li key={`${row.rowNumber}-${index}`}>
                Line {row.rowNumber}: {message}
              </li>
            ))}
          </ul>
          {errors.length > 30 ? (
            <p className="mt-1 text-[11px] text-danger">
              and {errors.length - 30} more. Fix the file and upload it again,
              or import only the valid rows.
            </p>
          ) : null}
        </div>
      ) : null}

      {warnings.length > 0 ? (
        <div className="mx-3 mb-2.5 rounded border border-warning/40 bg-warning-soft px-2.5 py-2">
          <p className="text-[12px] font-medium text-warning">
            {counts.warningRows} row{counts.warningRows === 1 ? "" : "s"} with a
            warning
          </p>
          <ul className="mt-1 space-y-0.5 text-[11px] text-warning">
            {warnings.slice(0, 8).map(({ row, message }, index) => (
              <li key={`${row.rowNumber}-warning-${index}`}>
                Line {row.rowNumber}: {message}
              </li>
            ))}
          </ul>
          {warnings.length > 8 ? (
            <p className="mt-1 text-[11px] text-warning">
              and {warnings.length - 8} more.
            </p>
          ) : null}
        </div>
      ) : null}

      {evaluation.newCategories.length > 0 ||
      evaluation.newSuppliers.length > 0 ? (
        <div className="mx-3 mb-2.5 rounded border border-line bg-panel px-2.5 py-2 text-[11px]">
          {evaluation.newCategories.length > 0 ? (
            <p>
              <span className="font-medium">New categories:</span>{" "}
              {evaluation.newCategories.join(", ")}
            </p>
          ) : null}
          {evaluation.newSuppliers.length > 0 ? (
            <p className="mt-0.5">
              <span className="font-medium">New suppliers:</span>{" "}
              {evaluation.newSuppliers.join(", ")}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="table-wrap mx-3 mb-2.5 overflow-x-auto rounded border border-line">
        <table className="w-full min-w-[560px] text-[12px]">
          <thead>
            <tr className="border-b border-line bg-panel text-left text-[10px] uppercase tracking-[0.07em] text-ink-muted">
              <th className="px-2 py-1.5 font-medium">Line</th>
              <th className="px-2 py-1.5 font-medium">Product</th>
              <th className="px-2 py-1.5 font-medium">SKU</th>
              <th className="px-2 py-1.5 text-right font-medium">Opening</th>
              <th className="px-2 py-1.5 text-right font-medium">Cost</th>
              <th className="px-2 py-1.5 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {preview.map((row) => (
              <tr
                key={row.rowNumber}
                className="border-b border-line last:border-0"
              >
                <td className="px-2 py-1.5 font-mono text-[11px] text-ink-muted">
                  {row.rowNumber}
                </td>
                <td className="px-2 py-1.5">{row.name}</td>
                <td className="px-2 py-1.5 font-mono">{row.sku}</td>
                <td className="px-2 py-1.5 text-right font-mono">
                  {row.values?.opening ?? "0"}
                </td>
                <td className="px-2 py-1.5 text-right font-mono">
                  {formatMoney(row.values?.costPrice ?? "0", currency)}
                </td>
                <td className="px-2 py-1.5">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                      row.status === "update"
                        ? "bg-warning-soft text-warning"
                        : "bg-success-soft text-success"
                    }`}
                  >
                    {row.status === "update" ? "Update" : "New"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {importable > preview.length ? (
          <p className="border-t border-line px-2 py-1 text-[11px] text-ink-muted">
            and {importable - preview.length} more valid row
            {importable - preview.length === 1 ? "" : "s"}.
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2 border-t border-line px-3 py-2.5">
        <label className="flex items-start gap-2 text-[12px]">
          <input
            type="checkbox"
            checked={options.updateExisting}
            onChange={(event) =>
              onChangeOption("updateExisting", event.target.checked)
            }
            disabled={busy}
            className="mt-0.5"
          />
          <span>
            <span className="font-medium">Update existing products</span>
            <span className="block text-[11px] text-ink-muted">
              SKU is the key. Catalogue fields are refreshed; stock is never
              changed.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-2 text-[12px]">
          <input
            type="checkbox"
            checked={options.createSuppliers}
            onChange={(event) =>
              onChangeOption("createSuppliers", event.target.checked)
            }
            disabled={busy}
            className="mt-0.5"
          />
          <span>
            <span className="font-medium">Create missing suppliers</span>
            <span className="block text-[11px] text-ink-muted">
              Off by default. The names that would be created are listed above.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-2 text-[12px]">
          <input
            type="checkbox"
            checked={options.createCategories}
            onChange={(event) =>
              onChangeOption("createCategories", event.target.checked)
            }
            disabled={busy}
            className="mt-0.5"
          />
          <span>
            <span className="font-medium">Create missing categories</span>
            <span className="block text-[11px] text-ink-muted">
              Blank categories stay empty; an existing name is reused.
            </span>
          </span>
        </label>

        {counts.errorRows > 0 ? (
          <label className="flex items-start gap-2 text-[12px]">
            <input
              type="checkbox"
              checked={options.partial}
              onChange={(event) =>
                onChangeOption("partial", event.target.checked)
              }
              disabled={busy}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium text-warning">
                Import valid rows only
              </span>
              <span className="block text-[11px] text-ink-muted">
                Skips {counts.errorRows} invalid row
                {counts.errorRows === 1 ? "" : "s"} and {counts.skippedRows}{" "}
                blank row
                {counts.skippedRows === 1 ? "" : "s"}. The skipped count is kept
                in history.
              </span>
            </span>
          </label>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 pt-0.5">
          <button type="button" className={SECONDARY} onClick={onBack}>
            Back to matching
          </button>
          <button
            type="button"
            className={`${PRIMARY} ml-auto`}
            disabled={
              busy ||
              importable === 0 ||
              (counts.errorRows > 0 && !options.partial)
            }
            onClick={onConfirm}
          >
            {busy
              ? "Importing…"
              : counts.errorRows > 0 && !options.partial
                ? `Fix ${counts.errorRows} row${
                    counts.errorRows === 1 ? "" : "s"
                  } to continue`
                : counts.errorRows > 0
                  ? `Import ${importable} valid, skip ${skipped}`
                  : `Import ${importable} product${
                      importable === 1 ? "" : "s"
                    }`}
          </button>
        </div>
      </div>
    </section>
  );
}

function Figure({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "success" | "danger";
}) {
  return (
    <div>
      <dt className={LABEL}>{label}</dt>
      <dd
        className={`font-mono text-[15px] ${
          tone === "success"
            ? "text-success"
            : tone === "danger" && value > 0
              ? "text-danger"
              : ""
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function History({ history }: { history: CsvImportSummary[] }) {
  if (history.length === 0) return null;

  return (
    <section className="rounded border border-line bg-surface">
      <header className="border-b border-line px-3 py-2">
        <h2 className="text-[13px] font-semibold">Recent imports</h2>
        <p className="text-[11px] text-ink-muted">
          The last eight runs in this business.
        </p>
      </header>
      <ul className="divide-y divide-line">
        {history.map((entry) => (
          <li
            key={entry.id}
            className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-3 py-1.5 text-[12px]"
          >
            <span className="font-medium">{entry.filename}</span>
            <span className="font-mono text-[11px] text-ink-faint">
              {entry.createdAt.slice(0, 10)}
            </span>
            <span className="ml-auto text-[11px] text-ink-muted">
              {entry.importedRows} new · {entry.updatedRows} updated ·{" "}
              {entry.skippedRows} skipped
              {entry.openingMovements > 0
                ? ` · ${entry.openingMovements} opening`
                : ""}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
