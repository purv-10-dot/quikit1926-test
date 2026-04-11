import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    include: ["__tests__/**/*.test.ts"],
    environment: "node",
    clearMocks: true,
  },
  resolve: {
    alias: {
      "@quikit/database": path.resolve(__dirname, "../database"),
      "@quikit/shared": path.resolve(__dirname, "../shared"),
    },
  },
});
