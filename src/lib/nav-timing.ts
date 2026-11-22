/**
 * Navigation timing for the Stage 3 measurement.
 *
 * A request's perceived wait is spread across three places: the proxy's auth check
 * (before the app may send a byte), the page's own session lookup, and the tenant
 * transactions the page opens to read data. This module times them without changing
 * what they do, so the p50/p95 numbers come from the real path rather than a
 * benchmark that resembles it.
 *
 * Off unless `NAV_TIMING=1`, because an always-on measurement is a cost and a log
 * nobody asked for. When it is off, `timed` returns the callback untouched — the
 * only difference is one function call.
 *
 * Each sample is one stdout line:
 *
 *   [nav-timing] t=<epoch ms> label=<name> ms=<number>
 *
 * `scripts/nav-timing-report.ts` reads those lines back and prints percentiles.
 * Nothing is written to the database, the response or the client.
 */

const ENABLED = process.env.NAV_TIMING === "1";

/** True when samples are being logged; the report says so when there are none. */
export const timingEnabled = ENABLED;

export async function timed<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<T> {
  if (!ENABLED) return fn();

  const start = performance.now();
  try {
    return await fn();
  } finally {
    const ms = (performance.now() - start).toFixed(2);
    console.log(`[nav-timing] t=${Date.now()} label=${label} ms=${ms}`);
  }
}
