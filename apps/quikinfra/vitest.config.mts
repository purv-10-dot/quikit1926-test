import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

// QuikInfra splits its code across BOTH `./` (root: app/, lib/) and `./src/`
// (src/lib/, src/components/). The tsconfig `paths` encode that fallback
// (`"@/lib/*": ["./lib/*", "./src/lib/*"]`). A static Vite alias can't express
// the per-path "root first, else src" precedence, so we let `vite-tsconfig-paths`
// resolve `@/*` exactly the way `tsc` does — picking whichever file exists.
export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    include: ["__tests__/**/*.test.ts", "__tests__/**/*.test.tsx"],
    exclude: [
      "**/node_modules/**",
      "**/.next/**",
      "**/tests/**",
      "**/__tests__/e2e/**",
      "**/dist/**",
    ],
    // Default env is "node" (fast). DOM tests opt in per-file with the
    // directive `// @vitest-environment jsdom` at the top of the .tsx file.
    environment: "node",
    setupFiles: ["./__tests__/setup.ts"],
    clearMocks: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      include: [
        "src/lib/**/*.{ts,tsx}",
        "lib/**/*.{ts,tsx}",
        "app/api/**/*.{ts,tsx}",
        "src/components/**/*.{ts,tsx}",
      ],
      exclude: [
        "**/*.test.{ts,tsx}",
        "**/__tests__/**",
        "**/.next/**",
        "**/node_modules/**",
      ],
    },
  },
});
