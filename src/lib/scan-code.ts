/**
 * Camera scans arrive as either a bare manufacturer barcode, a typed SKU, or the
 * full URL encoded in our own QR label. Only the last segment of a `/scan/` URL is
 * the code; every other URL is treated as text so the server can refuse it.
 */
export function normalizeScanInput(raw: string): string {
  const value = raw.trim();
  if (value === "") return "";

  try {
    const url = new URL(value);
    if (url.pathname.startsWith("/scan/")) {
      const segment = url.pathname.slice("/scan/".length).split("/")[0] ?? "";
      return decodeURIComponent(segment).trim();
    }
  } catch {
    // Not a URL: a barcode or SKU, which is the common case.
  }

  return value;
}

export function manualScanHref(raw: string): string {
  const code = normalizeScanInput(raw);
  return code === "" ? "/scan" : `/scan?code=${encodeURIComponent(code)}`;
}
