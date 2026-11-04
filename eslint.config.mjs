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
      // react-hooks 7 adds the React Compiler rules. These three flag patterns the
      // app uses on purpose today (reading localStorage into state on mount, a ref
      // read while rendering the people list, Date.now in the /stats server page).
      // Turning them on means changing components, so it is its own ROADMAP item (51);
      // the other new rules are on and pass.
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/refs": "off",
      "react-hooks/purity": "off",
      // Node scripts and the Next runtime both provide these.
      "no-undef": "off",
      // `catch {}` around localStorage etc.: failing quietly is the intent.
      "no-empty": ["error", { allowEmptyCatch: true }],
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
);
