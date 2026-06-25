/**
 * Stage 2b — listUsers digest DTO (RED→GREEN).
 *
 * The Settings→Users list gains per-user digest fields so the UI can render the
 * "Daily Digest" toggle:
 *   - digestEligible : boolean   (from isDigestEligible on the RESOLVED role)
 *   - digestReason?  : "no-team" | "not-eligible-role"   (when ineligible)
 *   - digestEnabled  : boolean   (userId ∈ settings.digest.recipientUserIds)
 *
 * Role is resolved via resolveCrmRole(membershipRole, appAccessRole) — and the
 * appAccessRole MUST come from a UserAppAccess fetch SCOPED TO THE QUIKCRM appId
 * (getQuikCrmAppId()). The pinned cross-app test below is the QuikScale-row bug
 * lived through in pgAdmin: a UserAppAccess row on a DIFFERENT app must NOT be
 * used — the user resolves from membership instead.
 *
 * Mocks prisma + getQuikCrmAppId. The digest fields don't exist on the DTO yet → RED.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock } from "../../helpers/prisma-unit-mock";

vi.mock("@/lib/api/quikcrm-app", () => ({
  getQuikCrmAppId: vi.fn(async () => "app_quikcrm_id"),
  QUIKCRM_APP_SLUG: "quikcrm",
  ensureQuikCrmAppAccess: vi.fn(),
}));
vi.mock("@/lib/api/crm-rbac-client", () => ({ isCrmRbacClientReady: () => true }));
// users.service imports this subpath (used only in the create-user path, not
// listUsers); vitest's @quikit/shared alias doesn't resolve the package.json
// subpath export, so stub it to isolate the listUsers unit under test.
vi.mock("@quikit/shared/sso-domain-server", () => ({ classifySsoProviderAsync: vi.fn() }));

import { listUsers } from "@/lib/services/settings/users.service";

const ORG = "org1";
const ADMIN_APP_ID = "app_quikcrm_id";
const OTHER_APP_ID = "app_quikscale_id";

// helpers to set the prisma surface listUsers touches
function setMembers(rows: { userId: string; role: string }[]) {
  (prismaMock.orgMember.findMany as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue(
    rows.map((r) => ({
      userId: r.userId, orgId: ORG, role: r.role, status: "active",
      createdAt: new Date(), updatedAt: new Date(),
      user: { firstName: "F", lastName: "L", email: `${r.userId}@x.co` },
    })),
  );
  (prismaMock.orgMember.count as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue(rows.length);
}
function setAppAccess(rows: { userId: string; appId: string; role: string }[]) {
  (prismaMock.userAppAccess.findMany as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue(rows);
}
function setManagedGroups(rows: { userId: string; group: { orgId: string } }[]) {
  (prismaMock.crmSalesGroupManager.findMany as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue(rows);
}
function setDigestConfig(recipientUserIds: string[]) {
  (prismaMock.crmOrgWorkspaceSettings.findUnique as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue(
    { orgId: ORG, settings: { digest: { enabled: true, recipientUserIds } } },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // default empties so listUsers' other batch queries don't explode
  for (const m of [
    prismaMock.crmUserPermissionTemplate.findMany,
    prismaMock.crmUserAppRole.findMany,
    prismaMock.crmUserAccountAccess.findMany,
    prismaMock.crmSalesGroupManager.findMany,
    prismaMock.userAppAccess.findMany,
  ]) (m as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue([]);
  (prismaMock.crmOrgWorkspaceSettings.findUnique as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue(null);
});

type DigestRow = { id: string; digestEligible: boolean; digestReason?: string; digestEnabled: boolean };
const list = () => listUsers({ orgId: ORG, page: 1, pageSize: 50 }) as Promise<{ items: DigestRow[] }>;
const row = (items: DigestRow[], id: string): DigestRow => {
  const r = items.find((u) => u.id === id);
  if (!r) throw new Error(`row ${id} not found`);
  return r;
};

describe("listUsers — digest DTO (Stage 2b)", () => {
  it("Administrator (UserAppAccess admin on quikcrm) → digestEligible:true, no reason", async () => {
    setMembers([{ userId: "ak", role: "member" }]);
    setAppAccess([{ userId: "ak", appId: ADMIN_APP_ID, role: "admin" }]);
    const { items } = await list();
    const ak = row(items, "ak");
    expect(ak.digestEligible).toBe(true);
    expect(ak.digestReason).toBeUndefined();
  });

  it("SalesManager who owns a group → digestEligible:true", async () => {
    setMembers([{ userId: "sa", role: "member" }]);
    setAppAccess([{ userId: "sa", appId: ADMIN_APP_ID, role: "sales-manager" }]);
    setManagedGroups([{ userId: "sa", group: { orgId: ORG } }]);
    const { items } = await list();
    expect(row(items, "sa").digestEligible).toBe(true);
  });

  it("SalesManager with NO group → digestEligible:false, reason 'no-team'", async () => {
    setMembers([{ userId: "sm", role: "member" }]);
    setAppAccess([{ userId: "sm", appId: ADMIN_APP_ID, role: "sales-manager" }]);
    setManagedGroups([]); // owns nothing
    const { items } = await list();
    const sm = row(items, "sm");
    expect(sm.digestEligible).toBe(false);
    expect(sm.digestReason).toBe("no-team");
  });

  it("SalesUser → digestEligible:false, reason 'not-eligible-role'", async () => {
    setMembers([{ userId: "su", role: "member" }]);
    setAppAccess([]); // no quikcrm access → membership 'member' → SalesUser
    const { items } = await list();
    const su = row(items, "su");
    expect(su.digestEligible).toBe(false);
    expect(su.digestReason).toBe("not-eligible-role");
  });

  it("PINNED (QuikScale-row bug): a UserAppAccess row on a DIFFERENT app is IGNORED → resolves from membership", async () => {
    // org_admin membership + a stray QuikScale 'member' app-access row.
    // If the fetch isn't scoped to the quikcrm appId, the stray row is grabbed and
    // mis-resolves; correct behavior = ignore it, resolve org_admin → Administrator → eligible.
    setMembers([{ userId: "ash", role: "org_admin" }]);
    setAppAccess([{ userId: "ash", appId: OTHER_APP_ID, role: "member" }]); // WRONG app
    const { items } = await list();
    const ash = row(items, "ash");
    expect(ash.digestEligible).toBe(true); // Administrator via membership, NOT downgraded by the QuikScale row
    expect(ash.digestReason).toBeUndefined();
  });

  it("digestEnabled reflects membership in settings.digest.recipientUserIds", async () => {
    setMembers([{ userId: "ak", role: "member" }, { userId: "other", role: "member" }]);
    setAppAccess([{ userId: "ak", appId: ADMIN_APP_ID, role: "admin" }]);
    setDigestConfig(["ak"]); // only ak is a current recipient
    const { items } = await list();
    expect(row(items, "ak").digestEnabled).toBe(true);
    expect(row(items, "other").digestEnabled).toBe(false);
  });

  it("the UserAppAccess batch fetch is SCOPED to the quikcrm appId", async () => {
    setMembers([{ userId: "ak", role: "member" }]);
    setAppAccess([{ userId: "ak", appId: ADMIN_APP_ID, role: "admin" }]);
    await list();
    // every userAppAccess.findMany call must constrain appId to the quikcrm id
    const calls = (prismaMock.userAppAccess.findMany as unknown as { mock: { calls: { 0: { where?: { appId?: string } } }[] } }).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) {
      expect(c[0]?.where?.appId).toBe(ADMIN_APP_ID);
    }
  });
});
