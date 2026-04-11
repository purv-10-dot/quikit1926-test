import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { canEditKPIOwnerWeekly } from "@/lib/api/kpiWeeklyPermissions";

const ACTOR = "user-actor";
const OTHER = "user-other";
const TENANT = "tenant-1";
const KPI = "kpi-1";
const TEAM = "team-1";

beforeEach(resetMockDb);

describe("canEditKPIOwnerWeekly — guards", () => {
  it("returns false when any arg is empty", async () => {
    expect(await canEditKPIOwnerWeekly("", TENANT, KPI, OTHER)).toBe(false);
    expect(await canEditKPIOwnerWeekly(ACTOR, "", KPI, OTHER)).toBe(false);
    expect(await canEditKPIOwnerWeekly(ACTOR, TENANT, "", OTHER)).toBe(false);
    expect(await canEditKPIOwnerWeekly(ACTOR, TENANT, KPI, "")).toBe(false);
  });
});

describe("canEditKPIOwnerWeekly — admin short-circuit", () => {
  it("admin role → true without looking at the KPI", async () => {
    mockDb.membership.findFirst.mockResolvedValue({ role: "admin" } as any);
    expect(await canEditKPIOwnerWeekly(ACTOR, TENANT, KPI, OTHER)).toBe(true);
    expect(mockDb.kPI.findUnique).not.toHaveBeenCalled();
  });

  it("super_admin → true", async () => {
    mockDb.membership.findFirst.mockResolvedValue({ role: "super_admin" } as any);
    expect(await canEditKPIOwnerWeekly(ACTOR, TENANT, KPI, OTHER)).toBe(true);
  });
});

describe("canEditKPIOwnerWeekly — individual KPI", () => {
  beforeEach(() => {
    mockDb.membership.findFirst.mockResolvedValue({ role: "employee" } as any);
  });

  it("allows the KPI owner editing themselves", async () => {
    mockDb.kPI.findUnique.mockResolvedValue({
      tenantId: TENANT,
      kpiLevel: "individual",
      owner: ACTOR,
      teamId: null,
      ownerIds: [],
    } as any);
    expect(await canEditKPIOwnerWeekly(ACTOR, TENANT, KPI, ACTOR)).toBe(true);
  });

  it("rejects non-owner editing the owner", async () => {
    mockDb.kPI.findUnique.mockResolvedValue({
      tenantId: TENANT,
      kpiLevel: "individual",
      owner: OTHER,
      teamId: null,
      ownerIds: [],
    } as any);
    expect(await canEditKPIOwnerWeekly(ACTOR, TENANT, KPI, OTHER)).toBe(false);
  });

  it("rejects owner editing someone else (targetOwner mismatch)", async () => {
    mockDb.kPI.findUnique.mockResolvedValue({
      tenantId: TENANT,
      kpiLevel: "individual",
      owner: ACTOR,
      teamId: null,
      ownerIds: [],
    } as any);
    expect(await canEditKPIOwnerWeekly(ACTOR, TENANT, KPI, OTHER)).toBe(false);
  });

  it("rejects cross-tenant KPI", async () => {
    mockDb.kPI.findUnique.mockResolvedValue({
      tenantId: "other-tenant",
      kpiLevel: "individual",
      owner: ACTOR,
      teamId: null,
      ownerIds: [],
    } as any);
    expect(await canEditKPIOwnerWeekly(ACTOR, TENANT, KPI, ACTOR)).toBe(false);
  });
});

describe("canEditKPIOwnerWeekly — team KPI", () => {
  beforeEach(() => {
    mockDb.membership.findFirst.mockResolvedValue({ role: "employee" } as any);
  });

  it("allows self-edit when actor is in ownerIds", async () => {
    mockDb.kPI.findUnique.mockResolvedValue({
      tenantId: TENANT,
      kpiLevel: "team",
      owner: null,
      teamId: TEAM,
      ownerIds: [ACTOR, OTHER],
    } as any);
    expect(await canEditKPIOwnerWeekly(ACTOR, TENANT, KPI, ACTOR)).toBe(true);
  });

  it("rejects editing other owner when actor is also owner but not team head", async () => {
    mockDb.kPI.findUnique.mockResolvedValue({
      tenantId: TENANT,
      kpiLevel: "team",
      owner: null,
      teamId: TEAM,
      ownerIds: [ACTOR, OTHER],
    } as any);
    mockDb.team.findFirst.mockResolvedValue({ headId: "someone-else" } as any);
    expect(await canEditKPIOwnerWeekly(ACTOR, TENANT, KPI, OTHER)).toBe(false);
  });

  it("allows team head to edit any owner", async () => {
    mockDb.kPI.findUnique.mockResolvedValue({
      tenantId: TENANT,
      kpiLevel: "team",
      owner: null,
      teamId: TEAM,
      ownerIds: [OTHER],
    } as any);
    mockDb.team.findFirst.mockResolvedValue({ headId: ACTOR } as any);
    expect(await canEditKPIOwnerWeekly(ACTOR, TENANT, KPI, OTHER)).toBe(true);
  });

  it("rejects when target is not in ownerIds", async () => {
    mockDb.kPI.findUnique.mockResolvedValue({
      tenantId: TENANT,
      kpiLevel: "team",
      owner: null,
      teamId: TEAM,
      ownerIds: [OTHER], // ACTOR not in list
    } as any);
    expect(await canEditKPIOwnerWeekly(ACTOR, TENANT, KPI, ACTOR)).toBe(false);
  });
});
