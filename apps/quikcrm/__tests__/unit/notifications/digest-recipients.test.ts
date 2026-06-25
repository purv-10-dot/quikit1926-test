/**
 * Stage 5 — digest-recipients RESOLUTION REWRITE (RED→GREEN).
 *
 * ROOT FIX for the silent-skip: the OLD listDigestRecipients resolved roles via
 * CrmUserAppRole (the table that was EMPTY for Akhilesh/Sanyukta → both dropped →
 * digestCount:0). It also did NOT match how session.role resolves. This rewrite:
 *
 *   - resolveDigestRecipients(orgId, recipientUserIds) takes the allow-list (the
 *     UI-managed source of truth) and, FOR EACH userId, resolves the CRM role the
 *     SAME way readSession does — OrgMember.role + appId-scoped UserAppAccess via
 *     resolveCrmRole — then re-checks isDigestEligible. Ineligible users are
 *     DROPPED at send (defense-in-depth: a SalesManager who lost their team since
 *     being toggled on must not get an empty/garbage digest).
 *   - NO CrmUserAppRole dependency anywhere.
 *
 * listActiveDigestOrgs() returns orgs that have a digest config row (NOT "orgs
 * with a CrmUserAppRole row" — that was coincidental and is the silent-skip's
 * sibling). digest-run still filters by getDigestConfig(org).enabled.
 *
 * Mocks prisma + role-resolution/eligibility helpers. The new export
 * resolveDigestRecipients does not exist yet → RED.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../../helpers/prisma-unit-mock";

vi.mock("@/lib/api/quikcrm-app", () => ({ getQuikCrmAppId: vi.fn(async () => "app_quikcrm") }));
vi.mock("@/lib/services/notifications/digest-eligibility", () => ({ isDigestEligible: vi.fn() }));

import { getQuikCrmAppId } from "@/lib/api/quikcrm-app";
import { isDigestEligible } from "@/lib/services/notifications/digest-eligibility";
import { resolveDigestRecipients } from "@/lib/services/notifications/digest-recipients";

const ORG = "org1";

function setMembers(rows: { userId: string; role: string }[]) {
  (prismaMock.orgMember.findMany as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue(
    rows.map((r) => ({ userId: r.userId, orgId: ORG, role: r.role })),
  );
}
function setAppAccess(rows: { userId: string; appId: string; role: string }[]) {
  (prismaMock.userAppAccess.findMany as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue(rows);
}
function setUsers(rows: { id: string; email: string; firstName: string; lastName: string }[]) {
  (prismaMock.user.findMany as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue(rows);
}

beforeEach(() => {
  vi.clearAllMocks();
  setMembers([]);
  setAppAccess([]);
  setUsers([]);
  // default: everyone eligible (overridden per-test)
  vi.mocked(isDigestEligible).mockResolvedValue({ eligible: true } as never);
  vi.mocked(getQuikCrmAppId).mockResolvedValue("app_quikcrm" as never);
});

describe("resolveDigestRecipients — role+eligibility (no CrmUserAppRole) (Stage 5)", () => {
  it("resolves each allow-listed userId to a SessionUser with their REAL role (no CrmUserAppRole)", async () => {
    setMembers([{ userId: "ak", role: "member" }, { userId: "sa", role: "member" }]);
    setAppAccess([
      { userId: "ak", appId: "app_quikcrm", role: "admin" },
      { userId: "sa", appId: "app_quikcrm", role: "sales-manager" },
    ]);
    setUsers([
      { id: "ak", email: "ak@x.co", firstName: "Akhilesh", lastName: "G" },
      { id: "sa", email: "sa@x.co", firstName: "Sanyukta", lastName: "J" },
    ]);

    const recips = await resolveDigestRecipients(ORG, ["ak", "sa"]);

    const ak = recips.find((r) => r.userId === "ak");
    const sa = recips.find((r) => r.userId === "sa");
    expect(ak?.role).toBe("Administrator"); // org-wide
    expect(sa?.role).toBe("SalesManager"); // team — NOT flattened
    expect(ak?.email).toBe("ak@x.co");
    // CrmUserAppRole must NOT be consulted (the silent-skip root)
    expect(prismaMock.crmUserAppRole.findMany).not.toHaveBeenCalled();
  });

  it("DROPS a recipient who is no longer eligible at send time (defense-in-depth)", async () => {
    setMembers([{ userId: "ak", role: "member" }, { userId: "sa", role: "member" }]);
    setAppAccess([
      { userId: "ak", appId: "app_quikcrm", role: "admin" },
      { userId: "sa", appId: "app_quikcrm", role: "sales-manager" },
    ]);
    setUsers([
      { id: "ak", email: "ak@x.co", firstName: "A", lastName: "G" },
      { id: "sa", email: "sa@x.co", firstName: "S", lastName: "J" },
    ]);
    // Sanyukta lost her team → ineligible now → must be dropped from the send
    vi.mocked(isDigestEligible).mockImplementation(
      async ({ userId }: { userId: string }) =>
        userId === "sa" ? ({ eligible: false, reason: "no-team" } as never) : ({ eligible: true } as never),
    );

    const recips = await resolveDigestRecipients(ORG, ["ak", "sa"]);
    expect(recips.map((r) => r.userId)).toEqual(["ak"]);
  });

  it("UserAppAccess fetch is SCOPED to the quikcrm appId (no stray other-app row)", async () => {
    setMembers([{ userId: "ak", role: "member" }]);
    setAppAccess([{ userId: "ak", appId: "app_quikcrm", role: "admin" }]);
    setUsers([{ id: "ak", email: "ak@x.co", firstName: "A", lastName: "G" }]);

    await resolveDigestRecipients(ORG, ["ak"]);

    const calls = (prismaMock.userAppAccess.findMany as unknown as { mock: { calls: { 0: { where?: { appId?: string } } }[] } }).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) expect(c[0]?.where?.appId).toBe("app_quikcrm");
  });

  it("empty allow-list → no recipients (the UI keeps the list authoritative)", async () => {
    const recips = await resolveDigestRecipients(ORG, []);
    expect(recips).toEqual([]);
  });
});
