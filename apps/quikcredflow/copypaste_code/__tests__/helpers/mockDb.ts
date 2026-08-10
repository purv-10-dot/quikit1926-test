/**
 * Mock-DB + auth helper used by API route tests in this app.
 *
 * `vi.mock` calls inside this file are hoisted by Vitest to the very top of
 * the importing module — so any test file that imports `mockDb` gets a
 * mocked `@quikit/database`, `@/lib/db`, and `@/lib/auth/*` before the route
 * handler under test resolves its imports.
 *
 * Pattern:
 *   import { mockDb, setSession } from "../../helpers/mockDb";
 *   const db = mockDb();
 *   db.crmOpportunity.findFirst.mockResolvedValue({ id: "1", ... });
 */
import { NextResponse } from "next/server";
import { vi } from "vitest";
import { mockDeep, type DeepMockProxy } from "vitest-mock-extended";
import type { PrismaClient } from "@quikit/database";

const sharedMock = mockDeep<PrismaClient>();

vi.mock("@quikit/database", () => ({ db: sharedMock }));
vi.mock("@/lib/db", () => ({ db: sharedMock }));
vi.mock("@/lib/db/prisma", () => ({ prisma: sharedMock }));

export type SessionStub = {
  userId: string;
  tenantId: string;
  role?: string;
  email?: string;
  name?: string;
};

const sessionRef: { current: SessionStub | null } = { current: null };

vi.mock("@/lib/auth/require", () => ({
  requireApiUser: vi.fn(async () => {
    const s = sessionRef.current;
    if (!s) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return {
      userId: s.userId,
      tenantId: s.tenantId,
      role: s.role ?? "SalesUser",
      email: s.email ?? "user@example.com",
      name: s.name ?? "Test User",
    };
  }),
  isResponse: (x: unknown): x is Response => x instanceof Response,
  errorResponse: (err: unknown) => {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    const status = (err as { statusCode?: number })?.statusCode ?? 500;
    return NextResponse.json({ error: message }, { status });
  },
  requireUser: vi.fn(),
}));

vi.mock("@/lib/auth/permissions", () => ({
  assertModule: vi.fn().mockResolvedValue(undefined),
  maskHiddenLeadFields: vi.fn(async (_u, r) => r),
  filterRestrictedLeadFields: vi.fn(async (_u, p) => p),
  getEffectiveMatrix: vi.fn().mockResolvedValue([]),
  adminMatrix: vi.fn().mockReturnValue([]),
}));

vi.mock("@/lib/auth/account-acl", () => ({
  accountScopeFilter: vi.fn().mockResolvedValue(null),
  assertAccountAccess: vi.fn().mockResolvedValue(undefined),
  getScope: vi.fn().mockResolvedValue({ unrestricted: true }),
}));

export function mockDb(): DeepMockProxy<PrismaClient> {
  return sharedMock;
}

export function setSession(s: SessionStub | null): void {
  sessionRef.current = s;
}
