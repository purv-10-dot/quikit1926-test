import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    include: ["__tests__/**/*.test.ts", "__tests__/**/*.test.tsx"],
    exclude: [
      "**/node_modules/**",
      "**/.next/**",
      "**/__tests__/e2e/**",
      "**/dist/**",
    ],
    environment: "node",
    setupFiles: ["./__tests__/setup.ts"],
    clearMocks: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
      "@quikit/database": path.resolve(__dirname, "../../packages/database"),
      "@quikit/auth": path.resolve(__dirname, "../../packages/auth"),
      "@quikit/ui": path.resolve(__dirname, "../../packages/ui"),
      "@quikit/shared": path.resolve(__dirname, "../../packages/shared"),
    },
  },
});
