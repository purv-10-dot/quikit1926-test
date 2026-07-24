import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  // Required for the JSX in `__tests__/**/*.dom.test.tsx` — without it Vitest
  // cannot parse a component test at all. Matches the config every sibling app
  // already uses (quikscale, quikit, admin, quikcrm, quiktrack).
  plugins: [react()],
  test: {
    include: ['__tests__/**/*.test.ts', '__tests__/**/*.test.tsx'],
    exclude: [
      '**/node_modules/**',
      '**/.next/**',
      '**/__tests__/e2e/**',
      '**/dist/**',
    ],
    // Node by default (fast). DOM tests opt in per-file with the directive
    // `// @vitest-environment jsdom`.
    environment: 'node',
    clearMocks: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});
