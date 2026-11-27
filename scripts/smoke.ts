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

function get(path: string) {
  // Manual redirects: the redirect is part of what this checks.
  return fetch(origin + path, { redirect: "manual" });
}

/*
 * `/` is the entry route. Smoke has no session, so the middleware sends the
 * visitor to `/sign-in`; that 307 is the expected answer. A 200 stays valid for
 * the day `/` renders something signed-out. `/sign-in` itself must render.
 */
const root = await get("/");
if (root.status === 307) {
  const location = root.headers.get("location") ?? "";
  if (!location.endsWith("/sign-in"))
    throw new Error(
      `/ -> 307 to ${location || "(no location)"}, want /sign-in`,
    );
} else if (root.status !== 200) {
  throw new Error(`/ -> ${root.status}, want 200 or a 307 to /sign-in`);
}

const signIn = await get("/sign-in");
if (signIn.status !== 200)
  throw new Error(`/sign-in -> ${signIn.status}, want 200`);

console.log(`smoke ok against ${origin}`);
