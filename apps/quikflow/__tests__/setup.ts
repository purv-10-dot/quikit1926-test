import "@testing-library/jest-dom/vitest";
import { vi, beforeEach, afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

/**
 * A dummy DATABASE_URL, set BEFORE anything can import @quikit/database.
 *
 * The shared client passes `datasources.db.url = process.env.DATABASE_URL`
 * explicitly, and a regenerated Prisma client rejects `undefined` there at
 * CONSTRUCTION time — so any test file that transitively imports the real
 * client (rather than the mockDb helper) dies on import with
 * "Invalid value undefined for datasource". No query is ever issued in tests;
 * this only has to be a syntactically valid URL.
 */
process.env.DATABASE_URL ??= "postgresql://test:test@localhost:5432/test?schema=public";
process.env.DATABASE_URL_DIRECT ??= process.env.DATABASE_URL;

/**
 * Global test setup for QuikFlow. Mirrors the pattern used across the repo
 * (see apps/quikscale/__tests__/setup.ts), trimmed to what QuikFlow's
 * `withOrgAuth` actually depends on: a mocked session + a mocked orgId
 * resolver + a no-op API-call logger.
 */

export type TestUser = {
  id: string;
  orgId: string;
  membershipRole?: string;
  isSuperAdmin?: boolean;
  email?: string;
  name?: string;
};

const _state: { user: TestUser | null; orgId: string | null } = { user: null, orgId: null };

const mockedGetServerSession = vi.fn(async () => (_state.user ? { user: _state.user } : null));

vi.mock("next-auth", async () => {
  const actual = await vi.importActual<typeof import("next-auth")>("next-auth");
  return { ...actual, getServerSession: mockedGetServerSession };
});

vi.mock("next-auth/next", () => ({ getServerSession: mockedGetServerSession }));

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: _state.user ? { user: _state.user } : null,
    status: _state.user ? "authenticated" : "unauthenticated",
  }),
  signIn: vi.fn(),
  signOut: vi.fn(),
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// getOrgId is a factory-built resolver that hits the DB + auth cache. Mock it
// to a controllable value so route tests exercise the handler, not the
// membership lookup. `setSession` seeds the org too, but `setOrgId(null)`
// lets a test simulate "no active membership" → 403.
vi.mock("@/lib/api/getOrgId", () => ({
  getOrgId: vi.fn(async () => _state.orgId),
}));

// Fire-and-forget API logger writes an ApiCall row; no-op it in tests.
vi.mock("@quikit/shared/apiLogging", () => ({ logApiCall: vi.fn(async () => {}) }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
  useParams: () => ({}),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

vi.spyOn(console, "error").mockImplementation(() => {});

export function setSession(user: TestUser | null) {
  _state.user = user;
  _state.orgId = user?.orgId ?? null;
}

export function setOrgId(orgId: string | null) {
  _state.orgId = orgId;
}

beforeEach(() => {
  _state.user = null;
  _state.orgId = null;
});

// Testing Library auto-cleanup: unmount React trees between tests so queries
// only see the currently-mounted component. Required for jsdom tests; a no-op
// in node environment (where cleanup just short-circuits). Mirrors
// apps/quikscale/__tests__/setup.ts.
afterEach(() => {
  cleanup();
});
