import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import {
  findCnUserById,
  findCnUsersByIds,
  findCnUsersByRoleKey,
} from "@/lib/users/lookup";

beforeEach(() => resetMockDb());

describe("findCnUserById", () => {
  it("composes fullName from firstName + lastName and queries central user", async () => {
    (mockDb as any).user.findUnique.mockResolvedValue({
      id: "u1",
      email: "jane@x.com",
      firstName: "Jane",
      lastName: "Doe",
    });
    const u = await findCnUserById("u1");
    expect(u).toEqual({ id: "u1", email: "jane@x.com", fullName: "Jane Doe" });
    expect((mockDb as any).user.findUnique).toHaveBeenCalledWith({
      where: { id: "u1" },
      select: { id: true, email: true, firstName: true, lastName: true },
    });
  });

  it("falls back to the email local-part when no name is set", async () => {
    (mockDb as any).user.findUnique.mockResolvedValue({
      id: "u2",
      email: "bob@x.com",
      firstName: null,
      lastName: null,
    });
    const u = await findCnUserById("u2");
    expect(u?.fullName).toBe("bob");
  });

  it("returns null when the user does not exist", async () => {
    (mockDb as any).user.findUnique.mockResolvedValue(null);
    expect(await findCnUserById("missing")).toBeNull();
  });
});

describe("findCnUsersByIds", () => {
  it("returns [] without querying when ids is empty", async () => {
    const res = await findCnUsersByIds([]);
    expect(res).toEqual([]);
    expect((mockDb as any).user.findMany).not.toHaveBeenCalled();
  });

  it("maps every row through compose with an `in` filter", async () => {
    (mockDb as any).user.findMany.mockResolvedValue([
      { id: "u1", email: "a@x.com", firstName: "A", lastName: "One" },
      { id: "u2", email: "b@x.com", firstName: null, lastName: null },
    ]);
    const res = await findCnUsersByIds(["u1", "u2"]);
    expect(res).toEqual([
      { id: "u1", email: "a@x.com", fullName: "A One" },
      { id: "u2", email: "b@x.com", fullName: "b" },
    ]);
    expect((mockDb as any).user.findMany).toHaveBeenCalledWith({
      where: { id: { in: ["u1", "u2"] } },
      select: { id: true, email: true, firstName: true, lastName: true },
    });
  });
});

describe("findCnUsersByRoleKey", () => {
  it("enumerates distinct users assigned to the role", async () => {
    (mockDb as any).cnAppRole.findMany.mockResolvedValue([
      {
        id: "role-1",
        members: [
          { user: { id: "u1", email: "a@x.com", firstName: "A", lastName: "One" } },
          { user: { id: "u2", email: "b@x.com", firstName: "B", lastName: "Two" } },
          // duplicate — should be deduped
          { user: { id: "u1", email: "a@x.com", firstName: "A", lastName: "One" } },
        ],
      },
    ]);
    const res = await findCnUsersByRoleKey("org-1", "admin");
    expect(res.map((u) => u.id)).toEqual(["u1", "u2"]);
    expect((mockDb as any).cnAppRole.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orgId: "org-1", name: "admin" } }),
    );
  });

  it("filters to active OrgMembers when onlyActive is set", async () => {
    (mockDb as any).cnAppRole.findMany.mockResolvedValue([
      {
        id: "role-1",
        members: [
          { user: { id: "u1", email: "a@x.com", firstName: "A", lastName: "One" } },
          { user: { id: "u2", email: "b@x.com", firstName: "B", lastName: "Two" } },
        ],
      },
    ]);
    (mockDb as any).orgMember.findMany.mockResolvedValue([{ userId: "u1" }]);

    const res = await findCnUsersByRoleKey("org-1", "admin", { onlyActive: true });
    expect(res.map((u) => u.id)).toEqual(["u1"]);
    expect((mockDb as any).orgMember.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ orgId: "org-1", status: "active" }),
      }),
    );
  });
});
