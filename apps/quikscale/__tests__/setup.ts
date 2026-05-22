import "@testing-library/jest-dom/vitest";
import { vi, beforeEach, afterEach } from "vitest";
import { cleanup } from "@testing-library/react";
import { _clearLocalCache } from "@quikit/auth/cache";

// ---------------------------------------------------------------------------
// Session injection for tests
// ---------------------------------------------------------------------------
// The auth helpers in @quikit/auth follow a factory pattern
// (createGetOrgId(authOptions), etc.) and internally call
// next-auth/next's getServerSession on every invocation. Mocking that one
// function gives us per-test session control across all 42 route files
// without per-file boilerplate.

export type TestUser = {
  id: string;
  orgId: string;
  // Role strings match the repo's ROLES constant from @quikit/shared
  role: "super_admin" | "admin" | "executive" | "manager" | "employee" | "coach" | "owner" | "member";
  email?: string;
  name?: string;
};

const _state: { user: TestUser | null } = { user: null };

// Mock BOTH import paths. The repo's auth factories import from "next-auth",
// while some Next.js App Router handlers import from "next-auth/next". Both
// point at the same session state so tests have a single control surface.
const mockedGetServerSession = vi.fn(async () =>
  _state.user ? { user: _state.user } : null
);

vi.mock("next-auth", async () => {
  const actual = await vi.importActual<typeof import("next-auth")>("next-auth");
  return { ...actual, getServerSession: mockedGetServerSession };
});

vi.mock("next-auth/next", () => ({
  getServerSession: mockedGetServerSession,
}));

// Some files (client-side) import from "next-auth/react" instead. Stub that
// too so component tests don't explode on provider lookups.
vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: _state.user ? { user: _state.user } : null,
    status: _state.user ? "authenticated" : "unauthenticated",
  }),
  signIn: vi.fn(),
  signOut: vi.fn(),
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}));

export function setSession(user: TestUser | null) {
  _state.user = user;
}

// ---------------------------------------------------------------------------
// RBAC v2 permission gate
// ---------------------------------------------------------------------------
// The branch's `withOrgAuthForResource(...)` wrapper now calls
// `userCan(userId, orgId, resource, action)` after auth. That helper hits the
// DB for `rolePermission.findFirst` + `userPermissionExtra.findFirst` — both
// return `undefined` against the deep-mocked Prisma client unless every test
// seeds them, so the wrapper short-circuits to 403 before the handler runs.
//
// For unit tests we bypass the permission check globally and re-enable it
// per-test via `setPermissionGate(false)` when a test specifically wants to
// assert the 403 path. Same control-surface pattern as `setSession`.
const _permState: { allow: boolean } = { allow: true };

vi.mock("@/lib/api/permissions", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/api/permissions")
  >("@/lib/api/permissions");
  return {
    ...actual,
    userCan: vi.fn(async () => _permState.allow),
  };
});

export function setPermissionGate(allow: boolean) {
  _permState.allow = allow;
}

// ---------------------------------------------------------------------------
// Row-level visibility helpers
// ---------------------------------------------------------------------------
// Branch adds `@/lib/api/visibility` helpers (isOrgAdmin, getMyTeamIds) that
// hit the DB via the deep-mocked Prisma client. Without seeded mocks each
// helper either throws (undefined access) or returns false, breaking list
// endpoints' admin bypass. Default to admin=true / empty teams for tests;
// per-test override via the setters below.
const _visState = {
  isOrgAdmin: true,
  myTeamIds: [] as string[],
};

vi.mock("@/lib/api/visibility", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/api/visibility")
  >("@/lib/api/visibility");
  return {
    ...actual,
    isOrgAdmin: vi.fn(async () => _visState.isOrgAdmin),
    getMyTeamIds: vi.fn(async () => _visState.myTeamIds),
  };
});

export function setVisibility(opts: {
  isOrgAdmin?: boolean;
  myTeamIds?: string[];
}) {
  if (opts.isOrgAdmin !== undefined) _visState.isOrgAdmin = opts.isOrgAdmin;
  if (opts.myTeamIds !== undefined) _visState.myTeamIds = opts.myTeamIds;
}

// ---------------------------------------------------------------------------
// Past-week feature flags + fiscal-week helpers
// ---------------------------------------------------------------------------
// KPI/Priority/WWW writes call these and would otherwise pull from the
// unmocked FeatureFlag + QuarterSetting tables. Default to "all flags off /
// week=1" so tests don't accidentally trip on the new past-week guards.
vi.mock("@/lib/utils/featureFlags", () => ({
  getPastWeekFlags: vi.fn(async () => ({
    canAddPastWeek: false,
    canEditPastWeek: false,
  })),
  getCurrentFiscalWeekFromDB: vi.fn(async () => 1),
}));

// ---------------------------------------------------------------------------
// next/navigation stubs (component tests import useRouter, etc.)
// ---------------------------------------------------------------------------
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
  useParams: () => ({}),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Silence expected route-handler error logs
// ---------------------------------------------------------------------------
// Most API route handlers call console.error before returning a 4xx/5xx.
// During tests those logs are noise AND Vitest 4's console interception can
// crash while serializing certain error shapes (Zod issues, Prisma errors).
// We stub it and let individual tests opt in with vi.spyOn if they need to
// assert log output.
vi.spyOn(console, "error").mockImplementation(() => {});

// ---------------------------------------------------------------------------
// Reset between tests
// ---------------------------------------------------------------------------
beforeEach(() => {
  _state.user = null;
  // Reset permission gate so tests don't leak the "allow=false" state
  // across files.
  _permState.allow = true;
  _visState.isOrgAdmin = true;
  _visState.myTeamIds = [];
  // Clear the @quikit/auth in-memory LRU between tests. Without this, a
  // membership row resolved in test A is cached and "leaks" into test B,
  // making mocked DB return values look ignored. Safe to import here —
  // the cache module is a pure JS LRU, no side-effects on import.
  _clearLocalCache();
});

// Testing Library auto-cleanup: unmount React trees between tests so queries
// only see the currently-mounted component. Required for jsdom tests; a no-op
// in node environment (where cleanup just short-circuits).
afterEach(() => {
  cleanup();
});
