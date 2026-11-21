import { createServer } from "node:net";
import { writeFileSync, existsSync } from "node:fs";

function probeFreePort(): Promise<number> {
  return new Promise((resolve) => {
    const s = createServer();
    s.listen(0, () => {
      const addr = s.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      s.close(() => resolve(port));
    });
  });
}

async function main() {
  if (existsSync(".env.local")) {
    console.error("Refusing to overwrite existing .env.local");
    process.exit(1);
  }
  const app = await probeFreePort();
  const smokeSpare = await probeFreePort();
  const dbHost = await probeFreePort();
  const smtp = await probeFreePort();
  const mailHttp = await probeFreePort();
  const adminer = await probeFreePort();
  const lines = [
    `PORT=${app}`,
    `APP_URL=http://localhost:${app}`,
    `SMOKE_SPARE_PORT=${smokeSpare}`,
    `DATABASE_URL=postgresql://app:app@localhost:${dbHost}/app`,
    `DB_HOST_PORT=${dbHost}`,
    `MAILPIT_SMTP_PORT=${smtp}`,
    `MAILPIT_HTTP_PORT=${mailHttp}`,
    `MAILPIT_URL=http://localhost:${mailHttp}`,
    `ADMINER_PORT=${adminer}`,
    `EMAIL_FROM="starter <noreply@example.invalid>"`,
  ];
  writeFileSync(".env.local", lines.join("\n") + "\n");
  console.log(`Wrote .env.local with PORT=${app}`);
}

main();
