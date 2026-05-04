import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { createGetTenantId } from "@quikit/auth/get-tenant-id";
import type { NextAuthOptions } from "next-auth";

// Minimal stub — the factory stores the reference and forwards to the
// mocked getServerSession, so the contents don't matter.
const stubAuthOptions = {} as NextAuthOptions;
const getTenantId = createGetTenantId(stubAuthOptions);

const USER = "user-1";
const TENANT = "tenant-1";

beforeEach(resetMockDb);

describe("getTenantId factory", () => {
  it("returns null when there is no session", async () => {
    setSession(null);
    const result = await getTenantId(USER);
    expect(result).toBeNull();
  });

  it("returns null when session has orgId but user has no active membership", async () => {
    setSession({ id: USER, orgId: TENANT, role: "admin" });
    mockDb.membership.findFirst.mockResolvedValue(null);
    expect(await getTenantId(USER)).toBeNull();
  });

  it("returns the session orgId when user has an active membership in that tenant", async () => {
    setSession({ id: USER, orgId: TENANT, role: "admin" });
    mockDb.membership.findFirst.mockResolvedValue({
      id: "m1",
      userId: USER,
      orgId: TENANT,
      role: "admin",
      status: "active",
    } as any);
    expect(await getTenantId(USER)).toBe(TENANT);
  });

  it("falls back to user's first membership when session has no orgId", async () => {
    setSession({ id: USER, orgId: "", role: "admin" });
    mockDb.membership.findFirst.mockResolvedValue({
      orgId: "fallback-tenant",
    } as any);
    expect(await getTenantId(USER)).toBe("fallback-tenant");
  });

  it("returns null when user has no memberships at all", async () => {
    setSession({ id: USER, orgId: "", role: "employee" });
    mockDb.membership.findFirst.mockResolvedValue(null);
    expect(await getTenantId(USER)).toBeNull();
  });
});
