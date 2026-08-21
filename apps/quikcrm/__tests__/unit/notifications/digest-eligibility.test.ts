/**
 * Digest eligibility — role restrictions REMOVED (spec 2026-08-11).
 *
 * isDigestEligible decides WHO can RECEIVE a digest. Used by the read API
 * (render the toggle), the write API (reject an ineligible toggle), and
 * digest-run (defense-in-depth at send). ONE source.
 *
 * Rule (current): EVERY role is eligible to receive. If a user's Daily Digest
 * toggle is ON, they get the email regardless of CRM role.
 *
 * The previous rules (Administrator-only; SalesManager needs a team, else
 * "no-team"; everyone else "not-eligible-role") are intentionally gone. These
 * tests replace the characterization tests that pinned them.
 *
 * Toggle AUTHORIZATION (admin-only) is a separate concern enforced at the write
 * boundary — see __tests__/api/settings/digest-recipients-route.test.ts. It is
 * deliberately NOT part of eligibility.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../../helpers/prisma-unit-mock";
import { isDigestEligible } from "@/lib/services/notifications/digest-eligibility";

const managedFindMany = prismaMock.crmSalesGroupManager.findMany as unknown as {
  mockResolvedValue: (v: unknown) => void;
};

function u(role: string, userId = "u1", orgId = "org1") {
  return { userId, orgId, role };
}

const ALL_ROLES = [
  "Administrator",
  "TeamManager",
  "SalesManager",
  "SalesUser",
  "MarketingUser",
  "FinanceUser",
];

beforeEach(() => {
  vi.clearAllMocks();
  managedFindMany.mockResolvedValue([]);
});

describe("isDigestEligible — every role can receive (2026-08-11)", () => {
  it.each(ALL_ROLES)("%s → eligible, no reason", async (role) => {
    const res = await isDigestEligible(u(role));
    expect(res.eligible).toBe(true);
    expect(res.reason).toBeUndefined();
  });

  it("an unrecognised role is still eligible", async () => {
    const res = await isDigestEligible(u("whatever"));
    expect(res.eligible).toBe(true);
    expect(res.reason).toBeUndefined();
  });

  it("SalesManager with NO team is eligible (the 'no-team' block is gone)", async () => {
    managedFindMany.mockResolvedValue([]);
    const res = await isDigestEligible(u("SalesManager"));
    expect(res.eligible).toBe(true);
    expect(res.reason).toBeUndefined();
  });

  it("SalesManager whose only group is in ANOTHER org is eligible", async () => {
    managedFindMany.mockResolvedValue([{ groupId: "gX", group: { orgId: "other-org" } }]);
    const res = await isDigestEligible(u("SalesManager"));
    expect(res.eligible).toBe(true);
  });

  it("queries NO group table — eligibility is role-independent and DB-free", async () => {
    for (const role of ALL_ROLES) {
      await isDigestEligible(u(role));
    }
    expect(prismaMock.crmSalesGroupManager.findMany).not.toHaveBeenCalled();
  });
});
