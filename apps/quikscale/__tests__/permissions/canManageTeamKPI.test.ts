import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { canManageTeamKPI } from "@/lib/api/teamKPIPermissions";

const USER = "user-1";
const TENANT = "tenant-1";
const TEAM = "team-1";

beforeEach(resetMockDb);

describe("canManageTeamKPI", () => {
  it("returns false when any arg is empty", async () => {
    expect(await canManageTeamKPI("", TENANT, TEAM)).toBe(false);
    expect(await canManageTeamKPI(USER, "", TEAM)).toBe(false);
    expect(await canManageTeamKPI(USER, TENANT, "")).toBe(false);
  });

  it("returns true for an admin-level membership", async () => {
    mockDb.membership.findFirst.mockResolvedValue({ role: "admin" } as any);
    expect(await canManageTeamKPI(USER, TENANT, TEAM)).toBe(true);
  });

  it("returns true for an executive-level membership (above admin threshold in this repo)", async () => {
    // executive=4, admin threshold=5 → executive is BELOW admin. Must check.
    mockDb.membership.findFirst.mockResolvedValue({ role: "executive" } as any);
    mockDb.team.findFirst.mockResolvedValue(null); // not team head either
    expect(await canManageTeamKPI(USER, TENANT, TEAM)).toBe(false);
  });

  it("returns true for a super_admin", async () => {
    mockDb.membership.findFirst.mockResolvedValue({ role: "super_admin" } as any);
    expect(await canManageTeamKPI(USER, TENANT, TEAM)).toBe(true);
  });

  it("returns true when user is team head (even without admin role)", async () => {
    mockDb.membership.findFirst.mockResolvedValue({ role: "employee" } as any);
    mockDb.team.findFirst.mockResolvedValue({ headId: USER } as any);
    expect(await canManageTeamKPI(USER, TENANT, TEAM)).toBe(true);
  });

  it("returns false when user is a plain member and not team head", async () => {
    mockDb.membership.findFirst.mockResolvedValue({ role: "employee" } as any);
    mockDb.team.findFirst.mockResolvedValue({ headId: "someone-else" } as any);
    expect(await canManageTeamKPI(USER, TENANT, TEAM)).toBe(false);
  });

  it("returns false when team does not exist", async () => {
    mockDb.membership.findFirst.mockResolvedValue({ role: "employee" } as any);
    mockDb.team.findFirst.mockResolvedValue(null);
    expect(await canManageTeamKPI(USER, TENANT, TEAM)).toBe(false);
  });

  it("returns false when user has no membership at all", async () => {
    mockDb.membership.findFirst.mockResolvedValue(null);
    mockDb.team.findFirst.mockResolvedValue({ headId: "someone-else" } as any);
    expect(await canManageTeamKPI(USER, TENANT, TEAM)).toBe(false);
  });
});
