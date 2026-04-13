import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
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
      "@quikit/shared/pagination": path.resolve(__dirname, "../../packages/shared/lib/pagination"),
      "@quikit/shared/constants": path.resolve(__dirname, "../../packages/shared/lib/constants"),
      "@quikit/shared/types": path.resolve(__dirname, "../../packages/shared/types/index"),
      "@quikit/shared": path.resolve(__dirname, "../../packages/shared"),
    },
  },
});
