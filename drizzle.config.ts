import { defineConfig } from "drizzle-kit";
import { databaseUrl } from "./db/env";

export default defineConfig({
  schema: "./db/schema.ts",
  out: "./db/migrations",
  dialect: "postgresql",
  dbCredentials: { url: databaseUrl() },
  strict: false,
  verbose: true,
});
