/**
 * Global test setup.
 *
 * Provides:
 *   - setSession() helper to inject a NextAuth session per test
 *   - default fetch stub
 *   - reset between tests
 *
 * The mocked DB lives in __tests__/helpers/mockDb.ts — import it explicitly
 * from any test that needs to control Prisma behavior.
 */
import { afterEach, beforeEach, vi } from "vitest";
import { _clearLocalCache } from "@quikit/auth/cache";

// Note: @testing-library/jest-dom/vitest is intentionally NOT imported here
// because it expects a jsdom environment. Component tests should opt in via
// the file-level `// @vitest-environment jsdom` directive and import jest-dom
// from inside that file.

export type TestUser = {
  id: string;
  orgId: string;
  email?: string;
  name?: string;
  membershipRole?: string;
};

const _state: { user: TestUser | null } = { user: null };

const mockedGetServerSession = vi.fn(async () =>
  _state.user ? { user: _state.user, expires: new Date(Date.now() + 3600_000).toISOString() } : null,
);

vi.mock("next-auth", async () => {
  const actual = await vi.importActual<typeof import("next-auth")>("next-auth");
  return { ...actual, getServerSession: mockedGetServerSession };
});
vi.mock("next-auth/next", () => ({
  getServerSession: mockedGetServerSession,
}));

export function setSession(user: TestUser | null) {
  _state.user = user;
}

beforeEach(() => {
  vi.clearAllMocks();
  _clearLocalCache();
});

afterEach(() => {
  vi.restoreAllMocks();
});

global.fetch = vi.fn(() =>
  Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true, data: null }) }),
) as unknown as typeof fetch;
