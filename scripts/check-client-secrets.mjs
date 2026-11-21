import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const roots = ["src", "scripts", "db", "e2e", "tests"];
const secretNames = [
  "GEMINI_API_KEY",
  "GROQ_API_KEY",
  "UPLOADTHING_TOKEN",
  "DATABASE_URL",
  "AUTH_SECRET",
];
// A leak is a server secret shipped under a NEXT_PUBLIC_ name, not merely any
// file that happens to mention both strings (this checker used to flag itself).
const leakPatterns = secretNames.map((name) => [
  name,
  new RegExp(`NEXT_PUBLIC_[A-Z0-9_]*${name}`),
]);

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|js|mjs|cjs)$/.test(p)) out.push(p);
  }
  return out;
}

let failed = false;
for (const r of roots) {
  for (const f of walk(r)) {
    const text = readFileSync(f, "utf8");
    for (const [name, pattern] of leakPatterns) {
      if (pattern.test(text)) {
        console.error(
          `secret leak risk: ${f} references ${name} with NEXT_PUBLIC`,
        );
        failed = true;
      }
    }
  }
}
if (failed) process.exit(1);
console.log("secrets:check ok");
