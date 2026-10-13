import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    // The live suite makes real model calls; it only runs via `npm run test:live`.
    exclude: process.env.ELLIS_LIVE ? [] : ["test/live/**"],
    testTimeout: 20_000,
  },
});
