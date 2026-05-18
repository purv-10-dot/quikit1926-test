import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { syncLegacyAdminRole } from "@/lib/api/syncLegacyAdminRole";

const ORG = "org-1";
const USER = "user-1";

beforeEach(resetMockDb);

function membership(role: string | null) {
  mockDb.orgMember.findUnique.mockResolvedValue(
    role === null ? null : ({ role } as any),
  );
}

describe("syncLegacyAdminRole — grant (isV2Admin = true)", () => {
  it('promotes "member" → "admin"', async () => {
    membership("member");
    await syncLegacyAdminRole({ orgId: ORG, userId: USER, isV2Admin: true });
    expect(mockDb.orgMember.update).toHaveBeenCalledWith({
      where: { orgId_userId: { orgId: ORG, userId: USER } },
      data: { role: "admin" },
    });
  });

  it('promotes "employee" → "admin"', async () => {
    membership("employee");
    await syncLegacyAdminRole({ orgId: ORG, userId: USER, isV2Admin: true });
    expect(mockDb.orgMember.update).toHaveBeenCalledWith({
      where: { orgId_userId: { orgId: ORG, userId: USER } },
      data: { role: "admin" },
    });
  });

  it('does NOT downgrade "super_admin"', async () => {
    membership("super_admin");
    await syncLegacyAdminRole({ orgId: ORG, userId: USER, isV2Admin: true });
    expect(mockDb.orgMember.update).not.toHaveBeenCalled();
  });

  it('does NOT touch "org_admin" (already admin tier)', async () => {
    membership("org_admin");
    await syncLegacyAdminRole({ orgId: ORG, userId: USER, isV2Admin: true });
    expect(mockDb.orgMember.update).not.toHaveBeenCalled();
  });

  it('is a no-op when already "admin"', async () => {
    membership("admin");
    await syncLegacyAdminRole({ orgId: ORG, userId: USER, isV2Admin: true });
    expect(mockDb.orgMember.update).not.toHaveBeenCalled();
  });
});

describe("syncLegacyAdminRole — revoke (isV2Admin = false)", () => {
  it('demotes exactly "admin" → "member"', async () => {
    membership("admin");
    await syncLegacyAdminRole({ orgId: ORG, userId: USER, isV2Admin: false });
    expect(mockDb.orgMember.update).toHaveBeenCalledWith({
      where: { orgId_userId: { orgId: ORG, userId: USER } },
      data: { role: "member" },
    });
  });

  it('does NOT strip "super_admin" on revoke', async () => {
    membership("super_admin");
    await syncLegacyAdminRole({ orgId: ORG, userId: USER, isV2Admin: false });
    expect(mockDb.orgMember.update).not.toHaveBeenCalled();
  });

  it('does NOT strip "org_admin" on revoke', async () => {
    membership("org_admin");
    await syncLegacyAdminRole({ orgId: ORG, userId: USER, isV2Admin: false });
    expect(mockDb.orgMember.update).not.toHaveBeenCalled();
  });

  it('leaves "member" untouched', async () => {
    membership("member");
    await syncLegacyAdminRole({ orgId: ORG, userId: USER, isV2Admin: false });
    expect(mockDb.orgMember.update).not.toHaveBeenCalled();
  });

  it('leaves "manager" untouched (only exact "admin" demotes)', async () => {
    membership("manager");
    await syncLegacyAdminRole({ orgId: ORG, userId: USER, isV2Admin: false });
    expect(mockDb.orgMember.update).not.toHaveBeenCalled();
  });
});

describe("syncLegacyAdminRole — no membership", () => {
  it("no-ops when the user has no OrgMember row", async () => {
    membership(null);
    await syncLegacyAdminRole({ orgId: ORG, userId: USER, isV2Admin: true });
    expect(mockDb.orgMember.update).not.toHaveBeenCalled();
  });
});
