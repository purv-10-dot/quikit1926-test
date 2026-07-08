/**
 * Global Vitest setup for QuikAsset. Mocks NextAuth session resolution and the
 * app-local getOrgId wrapper so API-route tests can drive auth via setSession().
 */
import "@testing-library/jest-dom/vitest";
import { beforeEach, vi } from "vitest";

export type TestUser = {
  id: string;
  orgId: string;
  /** Legacy membership tier used by requireAdmin's ROLE_HIERARCHY check. */
  role: "super_admin" | "org_admin" | "admin" | "owner" | "member";
  email?: string;
  isSuperAdmin?: boolean;
};

const _state: { user: TestUser | null } = { user: null };

const mockedGetServerSession = vi.fn(async () => {
  const u = _state.user;
  if (!u) return null;
  return {
    user: {
      id: u.id,
      orgId: u.orgId,
      email: u.email ?? `${u.id}@example.com`,
      membershipRole: u.role,
      isSuperAdmin: u.isSuperAdmin ?? u.role === "super_admin",
    },
  };
});

vi.mock("next-auth", async () => {
  const actual = await vi.importActual<typeof import("next-auth")>("next-auth");
  return { ...actual, getServerSession: mockedGetServerSession };
});

vi.mock("next-auth/next", () => ({
  getServerSession: mockedGetServerSession,
}));

// withOrgAuth resolves the active org via this app-local wrapper — mock it so
// tests don't need to stub the real cache/DB re-validation path.
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
