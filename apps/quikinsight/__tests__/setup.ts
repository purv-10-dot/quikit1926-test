import { vi, beforeEach, afterEach } from "vitest";

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
