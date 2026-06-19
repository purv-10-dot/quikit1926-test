import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";
import { createGetOrgId } from "@quikit/auth/get-tenant-id";
import type { NextAuthOptions } from "next-auth";

// Minimal stub — the factory stores the reference and forwards to the
// mocked getServerSession, so the contents don't matter.
const stubAuthOptions = {} as NextAuthOptions;
const getOrgId = createGetOrgId(stubAuthOptions);

const USER = "user-1";
const ORG = "org-1";

beforeEach(resetMockDb);

describe("getOrgId factory", () => {
  it("returns null when there is no session", async () => {
    setSession(null);
    const result = await getOrgId(USER);
    expect(result).toBeNull();
  });

  it("returns null when session has orgId but user has no active membership", async () => {
    setSession({ id: USER, orgId: ORG, role: "admin" });
    mockDb.orgMember.findFirst.mockResolvedValue(null);
    expect(await getOrgId(USER)).toBeNull();
  });

  it("returns the session orgId when user has an active membership in that org", async () => {
    setSession({ id: USER, orgId: ORG, role: "admin" });
    mockDb.orgMember.findFirst.mockResolvedValue({
      id: "m1",
      userId: USER,
      orgId: ORG,
      role: "admin",
      status: "active",
    } as any);
    expect(await getOrgId(USER)).toBe(ORG);
  });

  it("falls back to user's first membership when session has no orgId", async () => {
    setSession({ id: USER, orgId: "", role: "admin" });
    mockDb.orgMember.findFirst.mockResolvedValue({
      orgId: "fallback-org",
    } as any);
    expect(await getOrgId(USER)).toBe("fallback-org");
  });

  it("returns null when user has no memberships at all", async () => {
    setSession({ id: USER, orgId: "", role: "employee" });
    mockDb.orgMember.findFirst.mockResolvedValue(null);
    expect(await getOrgId(USER)).toBeNull();
  });
});
