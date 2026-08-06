import { defineConfig } from "vitest/config";

// Node environment only — the SDK is a server-side fetch client with no DOM or
// React surface, so there is no jsdom variant here (unlike the app workspaces).
// Declared explicitly rather than relying on defaults so turbo's `test` task,
// which lists `vitest.config.ts` in its `inputs`, tracks test config in its
// cache key.
export default defineConfig({
  test: {
    environment: "node",
    include: ["__tests__/**/*.test.ts"],
  },
});
