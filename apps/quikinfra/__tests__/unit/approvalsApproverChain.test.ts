import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { resolveApproverChain, resolveNextApprover } from "@/lib/approvals/approver-chain";

const db = mockDb as any;

// findUsersByRoleName issues, in order:
//   1. cnUserAppRole.findMany  (role members)
//   2. cnUserProjectAccess.findMany (only when projectId given)
//   3. orgMember.findMany (active filter)
//   4. cnUserProfile.findMany (hydration)
//
// We stub by ROLE NAME via mockImplementation on cnUserAppRole, and make the
// other tables permissive (everyone active, no profiles).

function uar(userId: string, first: string, email = `${userId}@x.com`) {
  return { userId, user: { id: userId, email, firstName: first, lastName: null } };
}

beforeEach(() => {
  resetMockDb();
  // Default: every candidate is an active org member; no extra profile data.
  db.orgMember.findMany.mockImplementation(async (args: any) =>
    (args.where.userId.in as string[]).map((userId) => ({ userId })),
  );
  db.cnUserProfile.findMany.mockResolvedValue([]);
  db.cnUserProjectAccess.findMany.mockResolvedValue([]);
});

function stubRoles(map: Record<string, ReturnType<typeof uar>[]>) {
  db.cnUserAppRole.findMany.mockImplementation(async (args: any) => {
    const roleName = args.where.role?.name as string;
    return map[roleName] ?? [];
  });
}

describe("resolveApproverChain — ordering + levels", () => {
  it("returns [] when orgId is missing", async () => {
    await expect(resolveApproverChain({ orgId: "" })).resolves.toEqual([]);
  });

  it("orders levels site_admin(1) → ho_user(2) → admin(3)", async () => {
    stubRoles({
      site_admin: [uar("sa1", "Sam")],
      ho_user: [uar("ho1", "Hank")],
      admin: [uar("ad1", "Ada")],
    });
    db.cnUserProjectAccess.findMany.mockResolvedValue([{ userId: "sa1" }]);

    const chain = await resolveApproverChain({ orgId: "org-1", projectId: "proj-1" });
    expect(chain.map((l) => l.level)).toEqual([1, 2, 3]);
    expect(chain.map((l) => l.label)).toEqual(["Site Admin", "HO User", "Admin"]);
    expect(chain[0].candidates[0].id).toBe("sa1");
    expect(chain[0].candidates[0].userType).toBe("SITE_ADMIN");
    expect(chain[2].candidates[0].userType).toBe("ADMIN");
  });

  it("omits the site-admin level entirely when no projectId is given", async () => {
    stubRoles({
      site_admin: [uar("sa1", "Sam")],
      ho_user: [uar("ho1", "Hank")],
      admin: [uar("ad1", "Ada")],
    });
    const chain = await resolveApproverChain({ orgId: "org-1" });
    expect(chain.map((l) => l.level)).toEqual([2, 3]);
  });

  it("skips a level with zero candidates", async () => {
    stubRoles({ ho_user: [], admin: [uar("ad1", "Ada")] });
    const chain = await resolveApproverChain({ orgId: "org-1" });
    expect(chain.map((l) => l.level)).toEqual([3]);
  });

  it("excludes the requester from the chain", async () => {
    stubRoles({ ho_user: [uar("ho1", "Hank"), uar("me", "Me")], admin: [uar("ad1", "Ada")] });
    const chain = await resolveApproverChain({ orgId: "org-1", requesterId: "me" });
    const hoLevel = chain.find((l) => l.level === 2)!;
    expect(hoLevel.candidates.map((c) => c.id)).toEqual(["ho1"]);
  });

  it("dedupes a user who qualifies at multiple levels (kept at the lowest)", async () => {
    // 'dup' is both ho_user and admin → appears only at level 2.
    stubRoles({
      ho_user: [uar("dup", "Dup")],
      admin: [uar("dup", "Dup"), uar("ad1", "Ada")],
    });
    const chain = await resolveApproverChain({ orgId: "org-1" });
    const adminLevel = chain.find((l) => l.level === 3)!;
    expect(adminLevel.candidates.map((c) => c.id)).toEqual(["ad1"]);
  });

  it("filters out inactive org members", async () => {
    stubRoles({ admin: [uar("ad1", "Ada"), uar("ad2", "Bob")] });
    // only ad1 is active
    db.orgMember.findMany.mockResolvedValue([{ userId: "ad1" }]);
    const chain = await resolveApproverChain({ orgId: "org-1" });
    expect(chain[0].candidates.map((c) => c.id)).toEqual(["ad1"]);
  });

  it("sorts candidates within a level by fullName", async () => {
    stubRoles({ admin: [uar("z", "Zoe"), uar("a", "Amy")] });
    const chain = await resolveApproverChain({ orgId: "org-1" });
    expect(chain[0].candidates.map((c) => c.fullName)).toEqual(["Amy", "Zoe"]);
  });
});

describe("resolveNextApprover", () => {
  it("returns the first candidate of the lowest non-empty level", async () => {
    stubRoles({
      ho_user: [uar("ho1", "Hank")],
      admin: [uar("ad1", "Ada")],
    });
    const next = await resolveNextApprover({ orgId: "org-1" });
    expect(next?.id).toBe("ho1");
  });

  it("returns null for a healthy-but-empty result", async () => {
    stubRoles({});
    const next = await resolveNextApprover({ orgId: "org-1" });
    expect(next).toBeNull();
  });
});
