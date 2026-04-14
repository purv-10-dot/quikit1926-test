import "@testing-library/jest-dom/vitest";
import { vi, beforeEach, afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Session injection for tests
// ---------------------------------------------------------------------------
export type TestUser = {
  id: string;
  tenantId: string;
  role: "owner" | "admin" | "member" | "super_admin" | "executive" | "manager" | "employee" | "coach";
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
vi.spyOn(console, "error").mockImplementation(() => {});
vi.spyOn(console, "warn").mockImplementation(() => {});

// ---------------------------------------------------------------------------
// Reset between tests
// ---------------------------------------------------------------------------
beforeEach(() => {
  _state.user = null;
});

afterEach(() => {
  cleanup();
});
