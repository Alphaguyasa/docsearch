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

/**
 * Which generation backend src/lib/llm.ts uses. The two generation API keys are
 * validated conditionally below: only the selected provider's key is required,
 * so a Gemini-only deployment needs no Anthropic key and vice versa.
 */
const generationProvider = z.enum(["anthropic", "gemini"]);

const envSchema = z
  .object({
    SUPABASE_URL: z.string().url("must be a valid URL"),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "must not be empty"),
    VOYAGE_API_KEY: z.string().min(1, "must not be empty"),
    // Generation keys are optional at the schema level; the superRefine below
    // requires whichever one GENERATION_PROVIDER selects.
    ANTHROPIC_API_KEY: z.string().min(1, "must not be empty").optional(),
    GEMINI_API_KEY: z.string().min(1, "must not be empty").optional(),
    GENERATION_PROVIDER: generationProvider.default("anthropic"),
  })
  .superRefine((val, ctx) => {
    if (val.GENERATION_PROVIDER === "anthropic" && !val.ANTHROPIC_API_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["ANTHROPIC_API_KEY"],
        message: "required when GENERATION_PROVIDER=anthropic",
      });
    }
    if (val.GENERATION_PROVIDER === "gemini" && !val.GEMINI_API_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["GEMINI_API_KEY"],
        message: "required when GENERATION_PROVIDER=gemini",
      });
    }
  });

export type Config = z.infer<typeof envSchema>;
export type GenerationProvider = z.infer<typeof generationProvider>;

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
