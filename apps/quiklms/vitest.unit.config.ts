/**
 * Node-only test config — runs everything under `__tests__/unit` and
 * `__tests__/api` WITHOUT `@vitejs/plugin-react`.
 *
 * WHY IT EXISTS. The committed `vitest.config.ts` loads `@vitejs/plugin-react`,
 * which JSX component tests genuinely need. But this repo's tree has
 * `@vitejs/plugin-react@6` against `vite@5`, and plugin-react 6 imports
 * `vite/internal` — a subpath that only exists in vite 7. So loading the config
 * fails before a single test runs:
 *
 *     Error [ERR_PACKAGE_PATH_NOT_EXPORTED]: Package subpath './internal'
 *     is not defined by "exports" in node_modules/vite/package.json
 *
 * That is a ROOT dependency mismatch — resolving it means changing the root
 * `package.json`/lockfile, which is outside this app. Meanwhile none of the node
 * tests contain JSX, so they do not need the plugin at all and there is no reason
 * for them to be blocked by it.
 *
 *   npx vitest run --config vitest.unit.config.ts
 *
 * DELETE THIS FILE once vite and @vitejs/plugin-react agree on a major — at that
 * point `vitest.config.ts` runs everything and this is redundant. It deliberately
 * does NOT include `__tests__/components/**.dom.test.tsx`: those need the plugin,
 * and quietly skipping them would hide the fact that they still cannot run.
 */
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    include: ['__tests__/unit/**/*.test.ts', '__tests__/api/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/.next/**', '**/__tests__/e2e/**', '**/dist/**'],
    environment: 'node',
    clearMocks: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});
