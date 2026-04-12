import { vi } from "vitest";

// Mock next-auth
vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("next-auth/next", () => ({
  getServerSession: vi.fn(),
}));
