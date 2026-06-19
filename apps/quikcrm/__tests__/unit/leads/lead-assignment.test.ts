/**
 * Unit tests for lib/services/leads/lead-assignment.ts
 *
 * Covers:
 *   getAssignableUsers — returns the correct set of users per role
 *   assertCanAssignLeadTo — allows / denies assignment per role hierarchy
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { prismaMock, dbMock, resetPrismaUnitMocks } from "../../helpers/prisma-unit-mock";

import {
  getAssignableUsers,
  assertCanAssignLeadTo,
} from "@/lib/services/leads/lead-assignment";
import type { SessionUser } from "@/types/permission";

// ─── Shared fixtures ──────────────────────────────────────────────────────────

function makeUser(overrides: Partial<SessionUser> = {}): SessionUser {
  return {
    userId: "u-actor",
    orgId: "org1",
    role: "SalesUser",
    email: "actor@example.com",
    name: "Actor User",
    ...overrides,
  };
}

const ACTIVE_MEMBER = {
  userId: "u-member",
  orgId: "org1",
  role: "SalesUser",
  status: "active",
  user: { id: "u-member", firstName: "Alice", lastName: "Smith", email: "alice@example.com" },
};

const INACTIVE_MEMBER = {
  userId: "u-inactive",
  orgId: "org1",
  role: "SalesUser",
  status: "inactive",
  user: {
    id: "u-inactive",
    firstName: "Bob",
    lastName: "Jones",
    email: "bob@example.com",
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  resetPrismaUnitMocks();
});

// ─── getAssignableUsers ───────────────────────────────────────────────────────

describe("getAssignableUsers", () => {
  describe("Administrator", () => {
    it("returns all active org members", async () => {
      prismaMock.orgMember.findMany.mockResolvedValueOnce([ACTIVE_MEMBER] as never);

      const result = await getAssignableUsers(makeUser({ role: "Administrator" }));

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ id: "u-member", email: "alice@example.com" });
      expect(prismaMock.orgMember.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ orgId: "org1", status: "active" }),
        }),
      );
    });

    it("does not include inactive members", async () => {
      prismaMock.orgMember.findMany.mockResolvedValueOnce([INACTIVE_MEMBER] as never);
      const result = await getAssignableUsers(makeUser({ role: "Administrator" }));
      // The query itself filters by status: "active", so mock returns only
      // what the DB would return — we just verify the query filter is correct.
      expect(prismaMock.orgMember.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: "active" }),
        }),
      );
    });
  });

  describe("SalesManager", () => {
    it("returns self when managing no groups", async () => {
      prismaMock.crmSalesGroupManager.findMany.mockResolvedValueOnce([] as never);
      prismaMock.orgMember.findUnique.mockResolvedValueOnce({
        userId: "u-actor",
        role: "SalesManager",
        status: "active",
        user: { id: "u-actor", firstName: "Mgr", lastName: "One", email: "mgr@example.com" },
      } as never);

      const result = await getAssignableUsers(makeUser({ role: "SalesManager" }));

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("u-actor");
    });

    it("includes group members and co-managers of same group", async () => {
      // Manager manages group-1
      prismaMock.crmSalesGroupManager.findMany
        .mockResolvedValueOnce([{ groupId: "group-1" }] as never) // managed groups
        .mockResolvedValueOnce([{ userId: "u-comanager" }] as never); // co-managers

      prismaMock.crmSalesGroupMember.findMany.mockResolvedValueOnce([
        { userId: "u-member1" },
      ] as never);

      dbMock.user.findMany.mockResolvedValueOnce([
        { id: "u-actor", firstName: "Mgr", lastName: "One", email: "mgr@example.com" },
        { id: "u-member1", firstName: "Sales", lastName: "User", email: "su@example.com" },
        { id: "u-comanager", firstName: "Co", lastName: "Mgr", email: "comgr@example.com" },
      ] as never);

      prismaMock.orgMember.findMany.mockResolvedValueOnce([
        { userId: "u-actor", role: "SalesManager", status: "active" },
        { userId: "u-member1", role: "SalesUser", status: "active" },
        { userId: "u-comanager", role: "SalesManager", status: "active" },
      ] as never);

      const result = await getAssignableUsers(makeUser({ role: "SalesManager" }));
      const ids = result.map((u) => u.id);

      expect(ids).toContain("u-actor");
      expect(ids).toContain("u-member1");
      expect(ids).toContain("u-comanager");
    });

    it("excludes inactive users from the result", async () => {
      prismaMock.crmSalesGroupManager.findMany
        .mockResolvedValueOnce([{ groupId: "group-1" }] as never)
        .mockResolvedValueOnce([{ userId: "u-inactive" }] as never);

      prismaMock.crmSalesGroupMember.findMany.mockResolvedValueOnce([] as never);

      dbMock.user.findMany.mockResolvedValueOnce([
        { id: "u-actor", firstName: "Mgr", lastName: "", email: "mgr@example.com" },
        { id: "u-inactive", firstName: "Old", lastName: "User", email: "old@example.com" },
      ] as never);

      prismaMock.orgMember.findMany.mockResolvedValueOnce([
        { userId: "u-actor", role: "SalesManager", status: "active" },
        { userId: "u-inactive", role: "SalesUser", status: "inactive" },
      ] as never);

      const result = await getAssignableUsers(makeUser({ role: "SalesManager" }));
      expect(result.map((u) => u.id)).not.toContain("u-inactive");
    });
  });

  describe("SalesUser", () => {
    it("returns only self", async () => {
      prismaMock.orgMember.findUnique.mockResolvedValueOnce({
        userId: "u-actor",
        role: "SalesUser",
        status: "active",
        user: { id: "u-actor", firstName: "Sales", lastName: "Rep", email: "rep@example.com" },
      } as never);

      const result = await getAssignableUsers(makeUser({ role: "SalesUser" }));

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("u-actor");
    });
  });

  describe("MarketingUser / FinanceUser", () => {
    it.each(["MarketingUser", "FinanceUser"])(
      "%s returns empty array (cannot assign)",
      async (role) => {
        const result = await getAssignableUsers(makeUser({ role }));
        expect(result).toEqual([]);
        // No DB calls should be made
        expect(prismaMock.orgMember.findMany).not.toHaveBeenCalled();
      },
    );
  });
});

// ─── assertCanAssignLeadTo ────────────────────────────────────────────────────

describe("assertCanAssignLeadTo", () => {
  describe("Administrator", () => {
    it("allows assigning to any user", async () => {
      await expect(
        assertCanAssignLeadTo(makeUser({ role: "Administrator" }), "any-user-id"),
      ).resolves.toBeUndefined();
    });
  });

  describe("SalesManager", () => {
    it("allows self-assign", async () => {
      await expect(
        assertCanAssignLeadTo(makeUser({ role: "SalesManager" }), "u-actor"),
      ).resolves.toBeUndefined();
    });

    it("allows assigning to a group member", async () => {
      prismaMock.crmSalesGroupManager.findMany
        .mockResolvedValueOnce([{ groupId: "group-1" }] as never)
        .mockResolvedValueOnce([]) as never; // co-managers

      prismaMock.crmSalesGroupMember.findMany.mockResolvedValueOnce([
        { userId: "u-member1" },
      ] as never);

      dbMock.user.findMany.mockResolvedValueOnce([
        { id: "u-actor", firstName: "Mgr", lastName: "", email: "mgr@example.com" },
        { id: "u-member1", firstName: "Sales", lastName: "U", email: "su@example.com" },
      ] as never);

      prismaMock.orgMember.findMany.mockResolvedValueOnce([
        { userId: "u-actor", role: "SalesManager", status: "active" },
        { userId: "u-member1", role: "SalesUser", status: "active" },
      ] as never);

      await expect(
        assertCanAssignLeadTo(makeUser({ role: "SalesManager" }), "u-member1"),
      ).resolves.toBeUndefined();
    });

    it("throws 403 when assigning to a user outside managed groups", async () => {
      prismaMock.crmSalesGroupManager.findMany
        .mockResolvedValueOnce([{ groupId: "group-1" }] as never)
        .mockResolvedValueOnce([]) as never;

      prismaMock.crmSalesGroupMember.findMany.mockResolvedValueOnce([] as never);

      dbMock.user.findMany.mockResolvedValueOnce([
        { id: "u-actor", firstName: "Mgr", lastName: "", email: "mgr@example.com" },
      ] as never);

      prismaMock.orgMember.findMany.mockResolvedValueOnce([
        { userId: "u-actor", role: "SalesManager", status: "active" },
      ] as never);

      const err = await assertCanAssignLeadTo(
        makeUser({ role: "SalesManager" }),
        "u-outsider",
      ).catch((e) => e);

      expect(err).toBeInstanceOf(Error);
      expect((err as { statusCode?: number }).statusCode).toBe(403);
      expect(err.message).toMatch(/outside your managed sales groups/i);
    });
  });

  describe("SalesUser", () => {
    it("allows self-assign", async () => {
      await expect(
        assertCanAssignLeadTo(makeUser({ role: "SalesUser" }), "u-actor"),
      ).resolves.toBeUndefined();
    });

    it("throws 403 when assigning to another user", async () => {
      const err = await assertCanAssignLeadTo(
        makeUser({ role: "SalesUser" }),
        "u-other",
      ).catch((e) => e);

      expect(err).toBeInstanceOf(Error);
      expect((err as { statusCode?: number }).statusCode).toBe(403);
      expect(err.message).toMatch(/only assign leads to themselves/i);
    });
  });

  describe("MarketingUser / FinanceUser", () => {
    it.each(["MarketingUser", "FinanceUser"])(
      "%s throws 403 for any assignment attempt",
      async (role) => {
        const err = await assertCanAssignLeadTo(makeUser({ role }), "u-actor").catch((e) => e);

        expect(err).toBeInstanceOf(Error);
        expect((err as { statusCode?: number }).statusCode).toBe(403);
        expect(err.message).toMatch(/cannot assign lead ownership/i);
      },
    );
  });

  describe("name building", () => {
    it("falls back to email when firstName and lastName are empty", async () => {
      prismaMock.orgMember.findMany.mockResolvedValueOnce([
        {
          userId: "u-noname",
          orgId: "org1",
          role: "SalesUser",
          status: "active",
          user: { id: "u-noname", firstName: "", lastName: "", email: "noname@example.com" },
        },
      ] as never);

      const result = await getAssignableUsers(makeUser({ role: "Administrator" }));
      expect(result[0].name).toBe("noname@example.com");
    });
  });
});
