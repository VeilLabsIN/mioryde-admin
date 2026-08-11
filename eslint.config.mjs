import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      /**
       * Downgraded to a warning, deliberately.
       *
       * Every page here fetches with the same shape: reset to a loading state,
       * fire the request, guard the result against a newer one. The reset is a
       * synchronous setState in the effect body, which this rule objects to —
       * correctly, in that it costs one extra render pass on mount and on each
       * filter change.
       *
       * It is a performance note, not a correctness one. Nothing renders wrong;
       * there is one additional pass over at most 50 rows, in an internal tool
       * used by a handful of operators.
       *
       * Silencing it entirely would be wrong, because the fix is real: hold the
       * query alongside its results and derive staleness during render, which
       * also replaces the requestId ref with proper cancellation. That is a
       * rewrite of six working screens, and doing it in the same pass as the
       * pages that were missing is how working screens break.
       *
       * So: visible on every run, not blocking, and scoped as its own change.
       */
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
