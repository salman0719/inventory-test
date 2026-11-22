import { readFileSync } from "node:fs";

/**
 * Read `[nav-timing]` lines from a dev-server log and print p50/p95 per layer.
 *
 * There is deliberately no per-navigation total: a page's layout and page renders
 * overlap, so summing their samples counts the same wall-clock time twice and reads
 * higher than the request took. The honest end-to-end number is measured at the
 * client, in the page, against the same navigations.
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

// Tenant transactions per page load. Each transaction logs one `tenant.connect`,
// and each request starts at its `proxy.auth`, so the count needs grouping even
// though no combined timing is reported.
const sorted = [...SAMPLES].sort((a, b) => a.t - b.t);
const groups: Sample[][] = [];
for (const sample of sorted) {
  const current = groups.at(-1);
  if (sample.label === "proxy.auth" || current === undefined)
    groups.push([sample]);
  else current.push(sample);
}

const navigations = groups
  .filter((group) => group.some((sample) => sample.label.startsWith("tenant.")))
  .map((group) => group.filter((sample) => sample.label === "tenant.connect"));

if (navigations.length > 0) {
  const counts = navigations.map((group) => group.length);
  console.log(
    `\ntenant transactions per page load: p50 ${percentile(counts, 50)}, ` +
      `p95 ${percentile(counts, 95)}, range ${Math.min(...counts)}-${Math.max(...counts)}`,
  );
}
