import { readFileSync } from "node:fs";

/**
 * Read `[nav-timing]` lines from a dev-server log and print p50/p95 per layer, plus
 * one total per navigation.
 *
 * A navigation's layers are logged by different parts of the server within the same
 * request. `proxy.auth` runs before the render, so it marks the start of a request:
 * every sample after it belongs to that request until the next one. Groups without a
 * tenant sample are asset or probe requests, not page renders, and are left out of
 * the totals. (Grouping by time gap does not work: requests issued back to back are
 * closer together than the samples inside one request.)
 *
 * Usage: `npm run perf:nav -- local/perf/nav-timing.log [--since=<epoch ms>]`
 *
 * `--since` drops samples logged before a marker, so a warm-up round or an earlier
 * experiment in the same file does not inflate the percentiles.
 */

const file = process.argv[2] ?? "local/perf/nav-timing.log";
const sinceArg = process.argv.find((arg) => arg.startsWith("--since="));
const since = sinceArg ? Number(sinceArg.slice("--since=".length)) : 0;

type Sample = { t: number; label: string; ms: number };

const SAMPLES: Sample[] = [];
for (const line of readFileSync(file, "utf8").split("\n")) {
  const match = /\[nav-timing\] t=(\d+) label=([\w.]+) ms=([\d.]+)/.exec(line);
  if (!match) continue;
  const sample = { t: Number(match[1]), label: match[2], ms: Number(match[3]) };
  if (sample.t < since) continue;
  SAMPLES.push(sample);
}

if (SAMPLES.length === 0) {
  console.error(
    `${file}: no [nav-timing] lines. Start the server with NAV_TIMING=1 and its stdout in the file.`,
  );
  process.exit(1);
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil((p / 100) * sorted.length) - 1),
  );
  return sorted[index] ?? 0;
}

function stats(values: number[]): string {
  return [
    String(values.length).padStart(4),
    percentile(values, 50).toFixed(1).padStart(8),
    percentile(values, 95).toFixed(1).padStart(8),
    Math.max(...values)
      .toFixed(1)
      .padStart(8),
  ].join(" ");
}

const byLabel = new Map<string, number[]>();
for (const sample of SAMPLES) {
  const values = byLabel.get(sample.label) ?? [];
  values.push(sample.ms);
  byLabel.set(sample.label, values);
}

const ORDER = [
  "proxy.auth",
  "session.auth",
  "tenant.connect",
  "tenant.setup",
  "tenant.work",
  "tenant.commit",
];

console.log(
  `${file}: ${SAMPLES.length} samples${since ? ` since ${since}` : ""}\n`,
);
console.log("layer              n     p50      p95      max");
for (const label of [
  ...ORDER,
  ...[...byLabel.keys()].filter((k) => !ORDER.includes(k)),
]) {
  const values = byLabel.get(label);
  if (!values) continue;
  console.log(`${label.padEnd(16)} ${stats(values)}`);
}

// Group samples into requests: each proxy.auth opens a new one.
const sorted = [...SAMPLES].sort((a, b) => a.t - b.t);
const groups: Sample[][] = [];
for (const sample of sorted) {
  const current = groups.at(-1);
  if (sample.label === "proxy.auth" || current === undefined)
    groups.push([sample]);
  else current.push(sample);
}

const navigations = groups.filter((group) =>
  group.some((sample) => sample.label.startsWith("tenant.")),
);
const totals = navigations.map((group) =>
  group.reduce((sum, sample) => sum + sample.ms, 0),
);
const perLayer = new Map<string, number>();
for (const sample of navigations.flat()) {
  perLayer.set(sample.label, (perLayer.get(sample.label) ?? 0) + sample.ms);
}

const transactions = navigations.map(
  (group) => group.filter((sample) => sample.label === "tenant.connect").length,
);

console.log(
  `\nnavigations (requests containing a tenant transaction): ${totals.length}`,
);
if (totals.length > 0) {
  console.log(`navigation total   ${stats(totals)}`);
  console.log(
    `tenant transactions per navigation: ${percentile(transactions, 50)} (p50), ${Math.min(...transactions)}-${Math.max(...transactions)} range`,
  );
  console.log("\nmean contribution per navigation:");
  for (const [label, total] of [...perLayer.entries()].sort(
    (a, b) => b[1] - a[1],
  )) {
    console.log(
      `  ${label.padEnd(16)} ${(total / totals.length).toFixed(1)} ms`,
    );
  }
}
