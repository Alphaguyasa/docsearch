/**
 * Environment configuration, validated once at module load.
 *
 * Per CLAUDE.md: secrets are read from process.env and validated on startup —
 * we fail loudly here, never silently at request time. Importing this module
 * (directly or transitively) is enough to trigger validation.
 *
 * Server-only: these values include the Supabase service role key. Never import
 * this module into a client component.
 */
import { z } from "zod";

const envSchema = z.object({
  SUPABASE_URL: z.string().url("must be a valid URL"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "must not be empty"),
  ANTHROPIC_API_KEY: z.string().min(1, "must not be empty"),
  VOYAGE_API_KEY: z.string().min(1, "must not be empty"),
});

export type Config = z.infer<typeof envSchema>;

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Build a message that names each offending variable, so a missing key is
  // obvious on startup rather than surfacing as a cryptic failure later.
  const details = parsed.error.issues
    .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
    .join("\n");

  throw new Error(
    `Invalid environment configuration. Fix the following variable(s) ` +
      `(see .env.example):\n${details}`,
  );
}

export const config: Config = parsed.data;
