import {
  IMPORT_LIMITS,
  decodeCsvBytes,
  trimTrailingBlankRows,
  type CsvEncoding,
} from "@/lib/import-input";

/**
 * Read a chosen file into rows of text.
 *
 * This is the whole browser side of the import: size and shape are checked here so
 * a bad file is refused in one sentence, and the parsed rows go to the caller only
 * if they are usable. Parts of the file are never sent anywhere; the caller posts
 * the mapped rows it decides to keep.
 */
export type ReadCsvResult =
  | {
      ok: true;
      filename: string;
      rows: string[][];
      encoding: CsvEncoding;
      notice: string | null;
    }
  | { ok: false; error: string };

function describeReadError(
  error: { code?: string; message?: string } | undefined,
): string {
  if (error?.code === "UndetectableDelimiter") {
    return "That file is not a comma, semicolon or tab separated text file. Save it as a CSV and try again.";
  }
  return `The CSV could not be read: ${error?.message ?? "unknown error"}.`;
}

export async function readCsvFile(file: File): Promise<ReadCsvResult> {
  if (file.size > IMPORT_LIMITS.bytes) {
    return {
      ok: false,
      error: `That file is ${(file.size / 1_000_000).toFixed(1)} MB. The limit is 1 MB.`,
    };
  }

  try {
    const decoded = decodeCsvBytes(new Uint8Array(await file.arrayBuffer()));
    if (decoded.text.trim() === "") {
      return {
        ok: false,
        error: "The file is empty. Add a header row and at least one data row.",
      };
    }

    const notice =
      decoded.encoding === "utf-8"
        ? null
        : decoded.encoding === "windows-1252"
          ? "This file is not UTF-8. It was read as Windows-1252; check names with accents."
          : `This file was read as ${decoded.encoding.toUpperCase()}.`;

    const text = decoded.text;
    const Papa = (await import("papaparse")).default;
    // Detect the delimiter with blank rows removed, then parse again with the
    // detected delimiter and no skipping. This keeps interior blank rows for the
    // review's skipped count; the final line terminator is trimmed below.
    const detection = Papa.parse<string[]>(text, {
      skipEmptyLines: "greedy",
    });
    if (detection.errors.length > 0) {
      return { ok: false, error: describeReadError(detection.errors[0]) };
    }
    const parsed = Papa.parse<string[]>(text, {
      delimiter: detection.meta.delimiter || ",",
    });
    if (parsed.errors.length > 0) {
      return { ok: false, error: describeReadError(parsed.errors[0]) };
    }

    const rows = trimTrailingBlankRows(
      parsed.data.map((row) => row.map((cell) => String(cell ?? ""))),
    );
    if (rows.length < 2) {
      return {
        ok: false,
        error: "The file needs a header row and at least one data row.",
      };
    }

    const columns = Math.max(...rows.map((row) => row.length));
    if (columns > IMPORT_LIMITS.columns) {
      return {
        ok: false,
        error: `The file has ${columns} columns. The limit is ${IMPORT_LIMITS.columns}.`,
      };
    }
    if (rows.length > 600) {
      return {
        ok: false,
        error:
          "That file has more than 500 data rows. Split it before importing.",
      };
    }

    return {
      ok: true,
      filename: file.name,
      rows,
      encoding: decoded.encoding,
      notice,
    };
  } catch {
    return {
      ok: false,
      error: "The file could not be read. Save it as a CSV and try again.",
    };
  }
}
