import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Plain node. The only browser API this code touches is localStorage, and
    // the tests install a real in-memory one themselves — which is both faster
    // than booting jsdom and explicit about the single global under test.
    environment: "node",
    // Threads rather than the default forked processes: forking a Node process
    // per test file times out on Windows here.
    pool: "threads",
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
