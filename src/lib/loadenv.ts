/**
 * CLI-only env loader. tsx does not auto-load dotenv files, so the CLI scripts
 * import this FIRST — before env.ts runs its validation — to populate
 * process.env from .env.local (then .env). Next.js loads these files itself, so
 * app code must never import this module.
 */
import { existsSync } from "node:fs";

for (const file of [".env.local", ".env"]) {
  if (existsSync(file)) process.loadEnvFile(file);
}
