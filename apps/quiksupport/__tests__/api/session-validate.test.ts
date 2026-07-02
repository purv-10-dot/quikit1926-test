import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests for GET /api/session/validate — the live-revocation check the client
 * SessionGuard polls. Covers unauthenticated, no-org, deactivated membership,
 * org suspension, revoked app access, and the valid admin path.
 */

const getServerSession = vi.fn();
vi.mock("next-auth", () => ({ getServerSession: () => getServerSession() }));

const db = {
  orgMember: { findFirst: vi.fn() },
  app: { findUnique: vi.fn() },
  orgAppAccess: { findUnique: vi.fn() },
  userAppAccess: { findUnique: vi.fn() },
};
vi.mock("@/lib/db", () => ({ db, prisma: db }));

import { GET } from "@/app/api/session/validate/route";

const req = new Request("http://localhost/api/session/validate") as never;

beforeEach(() => {
  vi.clearAllMocks();
  db.app.findUnique.mockResolvedValue({ id: "app_qs" });
  db.orgAppAccess.findUnique.mockResolvedValue({ enabled: true, trialEndsAt: null });
});

async function body(res: Response) {
  return res.json();
}

describe("GET /api/session/validate", () => {
  it("unauthenticated when there is no session", async () => {
    getServerSession.mockResolvedValue(null);
    expect(await body(await GET(req))).toEqual({ valid: false, reason: "unauthenticated" });
  });

  it("valid but tenant-less when the session has no orgId", async () => {
    getServerSession.mockResolvedValue({ user: { id: "u1" } });
    expect(await body(await GET(req))).toEqual({ valid: true, hasTenant: false });
  });

  it("deactivated when there is no active membership", async () => {
    getServerSession.mockResolvedValue({ user: { id: "u1", orgId: "orgA" } });
    db.orgMember.findFirst.mockResolvedValue(null);
    expect(await body(await GET(req))).toEqual({ valid: false, reason: "deactivated" });
  });

  it("org_suspended when the org is not active", async () => {
    getServerSession.mockResolvedValue({ user: { id: "u1", orgId: "orgA" } });
    db.orgMember.findFirst.mockResolvedValue({ id: "m1", org: { status: "suspended" } });
    expect(await body(await GET(req))).toEqual({ valid: false, reason: "org_suspended" });
  });

  it("app_access_revoked when the org has no enabled entitlement", async () => {
    getServerSession.mockResolvedValue({ user: { id: "u1", orgId: "orgA", membershipRole: "member" } });
    db.orgMember.findFirst.mockResolvedValue({ id: "m1", org: { status: "active" } });
    db.orgAppAccess.findUnique.mockResolvedValue({ enabled: false, trialEndsAt: null });
    expect(await body(await GET(req))).toEqual({ valid: false, reason: "app_access_revoked" });
  });

  it("valid for an org-admin on org-level access alone (no UserAppAccess needed)", async () => {
    getServerSession.mockResolvedValue({ user: { id: "u1", orgId: "orgA", membershipRole: "org_admin" } });
    db.orgMember.findFirst.mockResolvedValue({ id: "m1", org: { status: "active" } });
    const res = await body(await GET(req));
    expect(res).toEqual({ valid: true, hasTenant: true });
    expect(db.userAppAccess.findUnique).not.toHaveBeenCalled();
  });

  it("revokes a non-admin member with no UserAppAccess row", async () => {
    getServerSession.mockResolvedValue({ user: { id: "u1", orgId: "orgA", membershipRole: "member" } });
    db.orgMember.findFirst.mockResolvedValue({ id: "m1", org: { status: "active" } });
    db.userAppAccess.findUnique.mockResolvedValue(null);
    expect(await body(await GET(req))).toEqual({ valid: false, reason: "app_access_revoked" });
  });
});
