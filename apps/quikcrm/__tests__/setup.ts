/**
 * Global test setup — see /docs/07-testing.md for full conventions.
 *
 * Runs once before each test file. Sets up mocked NextAuth session, mocked
 * Prisma client, and the mock-DB helper the codebase expects.
 *
 * Add new global mocks here only with architect approval — most app-level
 * mocks should stay in their own test files.
 */
import { afterEach, beforeEach, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

// Provide synthetic Postgres URLs so importing @quikit/database (which
// constructs a Prisma client at module load) doesn't throw in tests.
// The client itself is mocked via __tests__/helpers/mockDb.ts; this URL is
// only consumed by the Prisma constructor's datasource validation.
process.env.DATABASE_URL ||= "postgresql://test:test@localhost:5432/test";
process.env.DATABASE_URL_DIRECT ||= process.env.DATABASE_URL;
process.env.NEXTAUTH_SECRET ||= "test-secret-not-real";

// Reset all mocks between tests so suite order doesn't matter.
beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Stub fetch with a sensible default. Override in individual tests as needed.
global.fetch = vi.fn(() =>
  Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data: null }) }),
) as unknown as typeof fetch;
