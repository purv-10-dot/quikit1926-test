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

describe("getOrgId per-app access gate (appSlug)", () => {
  // App-scoped factory — exercises the OrgAppAccess / UserAppAccess gate.
  const getScopedOrgId = createGetOrgId(stubAuthOptions, { appSlug: "quikscale" });
  const APP_ID = "app-quikscale";

  // Helper: seed the active-membership re-validation + app catalog lookup that
  // every gated path runs before the access checks.
  function seedMembershipAndApp() {
    mockDb.orgMember.findFirst.mockResolvedValue({ id: "m1" } as any);
    mockDb.app.findUnique.mockResolvedValue({ id: APP_ID } as any);
  }

  it("allows an org admin via OrgAppAccess even with NO UserAppAccess row (regression: self-serve trial lockout)", async () => {
    setSession({ id: USER, orgId: ORG, role: "admin", membershipRole: "org_admin" } as any);
    seedMembershipAndApp();
    mockDb.orgAppAccess.findUnique.mockResolvedValue({ enabled: true, trialEndsAt: null } as any);
    mockDb.userAppAccess.findUnique.mockResolvedValue(null);
    expect(await getScopedOrgId(USER)).toBe(ORG);
  });

  it("allows an org admin during an unexpired trial", async () => {
    setSession({ id: USER, orgId: ORG, role: "admin", membershipRole: "org_admin" } as any);
    seedMembershipAndApp();
    const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    mockDb.orgAppAccess.findUnique.mockResolvedValue({ enabled: true, trialEndsAt: future } as any);
    expect(await getScopedOrgId(USER)).toBe(ORG);
  });

  it("returns null when the org's trial has expired", async () => {
    setSession({ id: USER, orgId: ORG, role: "admin", membershipRole: "org_admin" } as any);
    seedMembershipAndApp();
    const past = new Date(Date.now() - 1000);
    mockDb.orgAppAccess.findUnique.mockResolvedValue({ enabled: true, trialEndsAt: past } as any);
    expect(await getScopedOrgId(USER)).toBeNull();
  });

  it("returns null when the org has no OrgAppAccess row for the app", async () => {
    setSession({ id: USER, orgId: ORG, role: "admin", membershipRole: "org_admin" } as any);
    seedMembershipAndApp();
    mockDb.orgAppAccess.findUnique.mockResolvedValue(null);
    expect(await getScopedOrgId(USER)).toBeNull();
  });

  it("requires a UserAppAccess row for a non-admin member", async () => {
    setSession({ id: USER, orgId: ORG, role: "employee", membershipRole: "member" } as any);
    seedMembershipAndApp();
    mockDb.orgAppAccess.findUnique.mockResolvedValue({ enabled: true, trialEndsAt: null } as any);
    mockDb.userAppAccess.findUnique.mockResolvedValue(null);
    expect(await getScopedOrgId(USER)).toBeNull();
  });

  it("allows a non-admin member who has an explicit UserAppAccess row", async () => {
    setSession({ id: USER, orgId: ORG, role: "employee", membershipRole: "member" } as any);
    seedMembershipAndApp();
    mockDb.orgAppAccess.findUnique.mockResolvedValue({ enabled: true, trialEndsAt: null } as any);
    mockDb.userAppAccess.findUnique.mockResolvedValue({ id: "uaa1" } as any);
    expect(await getScopedOrgId(USER)).toBe(ORG);
  });

  it("does not block when the app slug is absent from the catalog", async () => {
    setSession({ id: USER, orgId: ORG, role: "employee", membershipRole: "member" } as any);
    mockDb.orgMember.findFirst.mockResolvedValue({ id: "m1" } as any);
    mockDb.app.findUnique.mockResolvedValue(null);
    expect(await getScopedOrgId(USER)).toBe(ORG);
  });
});
