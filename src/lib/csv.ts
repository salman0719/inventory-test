import type { ReportKind } from "./report-input";

/**
 * CSV writing for the report exports.
 *
 * RFC 4180 quoting, CRLF line endings for Excel, and a guard against a text cell
 * that a spreadsheet would treat as a formula. Numbers are written as numbers, so
 * a negative quantity is not mangled into text.
 */

const FORMULA_START = /^[=+@\t\r]/;
const NUMERIC = /^-?\d+(\.\d+)?$/;

export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return String(value);

  let text = value;
  const looksNumeric = NUMERIC.test(text);
  if (FORMULA_START.test(text) || (text.startsWith("-") && !looksNumeric)) {
    // A leading apostrophe keeps the cell as text when opened in a spreadsheet.
    text = `'${text}`;
  }
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toCsv(
  rows: ReadonlyArray<ReadonlyArray<string | number | null | undefined>>,
): string {
  return `${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

/** `demo-cafe-stock-2026-11-22.csv`: readable in a downloads folder. */
export function reportFilename(
  kind: ReportKind,
  businessName: string,
  date: Date = new Date(),
): string {
  const slug =
    businessName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "business";
  return `${slug}-${kind}-${date.toISOString().slice(0, 10)}.csv`;
}
