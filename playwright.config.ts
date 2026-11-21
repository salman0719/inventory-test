import { defineConfig } from "@playwright/test";
const baseURL =
  process.env.APP_URL ??
  (process.env.PORT ? `http://localhost:${process.env.PORT}` : undefined);
if (!baseURL)
  throw new Error("APP_URL or PORT must be set (no hardcoded port)");
export default defineConfig({ testDir: "./e2e", use: { baseURL } });
