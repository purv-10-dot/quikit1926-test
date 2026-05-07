import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

export type TestUser = {
  id: string;
  orgId: string;
  role: "super_admin" | "admin" | "executive" | "manager" | "employee" | "coach" | "owner" | "member";
  email?: string;
  name?: string;
};

const _state: { user: TestUser | null } = { user: null };

const mockedGetServerSession = vi.fn(async () =>
  _state.user ? { user: _state.user } : null,
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

vi.mock("@quikit/auth/feature-gate", () => ({
  gateModuleApi: vi.fn(async () => null),
}));

vi.mock("@/lib/api/getOrgId", () => ({
  getOrgId: vi.fn(async (userId: string) =>
    _state.user && _state.user.id === userId ? _state.user.orgId : null,
  ),
}));

export function setSession(user: TestUser | null) {
  _state.user = user;
}

vi.spyOn(console, "error").mockImplementation(() => {});

beforeEach(() => {
  _state.user = null;
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

global.fetch = vi.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ success: true, data: null }),
  }),
) as unknown as typeof fetch;
