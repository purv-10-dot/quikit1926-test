import { vi, beforeEach } from "vitest";

export type TestUser = {
  id: string;
  tenantId: string;
  role: "super_admin" | "admin" | "member";
  email?: string;
  name?: string;
};

const _state: { user: TestUser | null } = { user: null };

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

// Mock email and audit log modules
vi.mock("@/lib/email", () => ({
  sendUserCreatedEmail: vi.fn().mockResolvedValue(undefined),
  sendOrgSuspendedEmail: vi.fn().mockResolvedValue(undefined),
  sendMemberAddedEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/auditLog", () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}));

vi.spyOn(console, "error").mockImplementation(() => {});

beforeEach(() => {
  _state.user = null;
});
