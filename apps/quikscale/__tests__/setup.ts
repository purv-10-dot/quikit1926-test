import "@testing-library/jest-dom/vitest";
import { vi, beforeEach, afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Session injection for tests
// ---------------------------------------------------------------------------
// The auth helpers in @quikit/auth follow a factory pattern
// (createGetTenantId(authOptions), etc.) and internally call
// next-auth/next's getServerSession on every invocation. Mocking that one
// function gives us per-test session control across all 42 route files
// without per-file boilerplate.

export type TestUser = {
  id: string;
  tenantId: string;
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
});

// Testing Library auto-cleanup: unmount React trees between tests so queries
// only see the currently-mounted component. Required for jsdom tests; a no-op
// in node environment (where cleanup just short-circuits).
afterEach(() => {
  cleanup();
});
