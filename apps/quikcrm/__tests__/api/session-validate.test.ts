/**
 * Tests — GET /api/session/validate (app-access gate)
 *
 * Regression coverage for aligning QuikCRM with every other app: session
 * validation now gates on QuikCRM app access (OrgAppAccess + UserAppAccess,
 * with an admin-tier exception), matching the launcher visibility rule.
 * Previously any active org member passed, so a user granted only some other
 * app still reached the QuikCRM dashboard.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockReset } from "vitest-mock-extended";
import { mockDb } from "../helpers/mockDb";

const sessionRef: { current: { user: Record<string, unknown> } | null } = {
  current: null,
};
vi.mock("next-auth", () => ({
  getServerSession: vi.fn(async () => sessionRef.current),
}));

import { GET } from "@/app/api/session/validate/route";

const db = mockDb();

function setUser(user: Record<string, unknown> | null) {
  sessionRef.current = user ? { user } : null;
}

const APP_ID = "app-quikcrm";

function seedActiveOrgAndApp() {
  db.orgMember.findFirst.mockResolvedValue({
    id: "m1",
    org: { status: "active" },
  } as never);
  db.app.findUnique.mockResolvedValue({ id: APP_ID } as never);
  db.orgAppAccess.findUnique.mockResolvedValue({
    enabled: true,
    trialEndsAt: null,
  } as never);
}

describe("GET /api/session/validate — QuikCRM app-access gate", () => {
  beforeEach(() => {
    mockReset(db);
    setUser(null);
  });

  it("returns app_access_revoked for a non-admin member with no UserAppAccess row", async () => {
    setUser({ id: "u1", orgId: "org1", membershipRole: "member" });
    seedActiveOrgAndApp();
    db.userAppAccess.findUnique.mockResolvedValue(null);

    const res = await GET();
    const body = await res.json();
    expect(body).toEqual({ valid: false, reason: "app_access_revoked" });
  });

  it("returns valid for a non-admin member WITH a UserAppAccess row", async () => {
    setUser({ id: "u1", orgId: "org1", membershipRole: "member" });
    seedActiveOrgAndApp();
    db.userAppAccess.findUnique.mockResolvedValue({ id: "a1" } as never);

    const res = await GET();
    const body = await res.json();
    expect(body).toEqual({ valid: true, hasTenant: true });
  });

  it("returns valid for an org admin even without a UserAppAccess row", async () => {
    setUser({ id: "u1", orgId: "org1", membershipRole: "org_admin" });
    seedActiveOrgAndApp();

    const res = await GET();
    const body = await res.json();
    expect(body).toEqual({ valid: true, hasTenant: true });
    // Admin tier short-circuits before the per-user lookup.
    expect(db.userAppAccess.findUnique).not.toHaveBeenCalled();
  });

  it("returns app_access_revoked when the org has no OrgAppAccess for QuikCRM", async () => {
    setUser({ id: "u1", orgId: "org1", membershipRole: "member" });
    db.orgMember.findFirst.mockResolvedValue({
      id: "m1",
      org: { status: "active" },
    } as never);
    db.app.findUnique.mockResolvedValue({ id: APP_ID } as never);
    db.orgAppAccess.findUnique.mockResolvedValue(null);

    const res = await GET();
    const body = await res.json();
    expect(body).toEqual({ valid: false, reason: "app_access_revoked" });
  });

  it("returns deactivated when membership is gone", async () => {
    setUser({ id: "u1", orgId: "org1", membershipRole: "member" });
    db.orgMember.findFirst.mockResolvedValue(null);

    const res = await GET();
    const body = await res.json();
    expect(body).toEqual({ valid: false, reason: "deactivated" });
  });
});
