// Plain typescript-eslint + React hooks rather than eslint-config-next: the Next
// plugin pulls in fast-glob -> micromatch -> braces, which carries a high-severity
// advisory with no fixed release (GHSA-vfj7-8cjw-p6xm). See CLAUDE.md, safety rules.
import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      ".next/**", "node_modules/**", "coverage/**", "corpus/**", "public/**",
      "eval/runs/**", "eval/.cache/**", "next-env.d.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Node scripts and the Next runtime both provide these.
      "no-undef": "off",
      // `catch {}` around localStorage etc.: failing quietly is the intent.
      "no-empty": ["error", { allowEmptyCatch: true }],
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
);
