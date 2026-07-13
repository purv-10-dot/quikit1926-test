import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
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
