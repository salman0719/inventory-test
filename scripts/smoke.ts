// Origin from CLI arg or APP_URL/PORT. Never hardcode a port.
const origin =
  process.argv[2] ??
  process.env.APP_URL ??
  `http://localhost:${process.env.PORT ?? ""}`;
if (!/^http:\/\/localhost:\d+$/.test(origin)) {
  console.error(`smoke needs an origin (got ${origin})`);
  process.exit(1);
}
export {};

async function check(path: string, expect: number) {
  const r = await fetch(origin + path, { redirect: "manual" });
  if (r.status !== expect)
    throw new Error(`${path} -> ${r.status}, want ${expect}`);
}
await check("/", 200);
console.log(`smoke ok against ${origin}`);
