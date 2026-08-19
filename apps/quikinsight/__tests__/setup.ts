import { vi, beforeEach, afterEach } from "vitest";

/**
 * @quikit/database constructs a PrismaClient at import time from
 * process.env.DATABASE_URL, and Vitest does not load .env.local. Without this,
 * any test whose import graph reaches @quikit/auth or @quikit/database dies with
 * "Invalid value undefined for datasource db".
 *
 * A placeholder URL is enough — nothing here opens a connection; the client is
 * only ever constructed. Tests that touch the DB mock it outright.
 * auth-config.test.ts already documents this as an assumption; this makes it true.
 */
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test?schema=public";
process.env.DATABASE_URL_DIRECT ??= process.env.DATABASE_URL;

// Mock next-auth across all tests
vi.mock("next-auth", () => ({
  default: vi.fn(),
  getServerSession: vi.fn(),
}));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));

export function setSession(user: Record<string, unknown> | null) {
  const { getServerSession } = require("next-auth");
  vi.mocked(getServerSession).mockResolvedValue(
    user ? { user, expires: new Date(Date.now() + 86400000).toISOString() } : null
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  vi.restoreAllMocks();
});
