import "@testing-library/jest-dom/vitest";
import { vi, beforeEach } from "vitest";

export type TestUser = {
  id: string;
  tenantId: string;
  role: "owner" | "admin" | "member";
  email?: string;
  name?: string;
};

const _state: { user: TestUser | null } = { user: null };

vi.mock("next-auth/next", () => ({
  getServerSession: vi.fn(async () =>
    _state.user ? { user: _state.user } : null
  ),
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

beforeEach(() => {
  _state.user = null;
});
