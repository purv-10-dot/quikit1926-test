import { describe, it, expect, beforeEach } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { writeAuditLog } from "@/lib/api/auditLog";

beforeEach(resetMockDb);

describe("writeAuditLog", () => {
  it("writes a minimal create entry", async () => {
    mockDb.auditLog.create.mockResolvedValue({} as any);

    await writeAuditLog({
      tenantId: "t1",
      actorId: "u1",
      action: "CREATE",
      entityType: "Priority",
      entityId: "p1",
      newValues: { name: "Ship v2" },
    });

    expect(mockDb.auditLog.create).toHaveBeenCalledOnce();
    const arg = mockDb.auditLog.create.mock.calls[0]![0] as any;
    expect(arg.data.tenantId).toBe("t1");
    expect(arg.data.actorId).toBe("u1");
    expect(arg.data.action).toBe("CREATE");
    expect(arg.data.entityType).toBe("Priority");
    expect(arg.data.entityId).toBe("p1");
    expect(arg.data.newValues).toContain("Ship v2");
  });

  it("auto-computes changes from old/new values diff", async () => {
    mockDb.auditLog.create.mockResolvedValue({} as any);

    await writeAuditLog({
      tenantId: "t1",
      actorId: "u1",
      action: "UPDATE",
      entityType: "Team",
      entityId: "team1",
      oldValues: { name: "Eng", color: "#0066cc", description: null },
      newValues: { name: "Engineering", color: "#0066cc", description: "Core team" },
    });

    const arg = mockDb.auditLog.create.mock.calls[0]![0] as any;
    // name + description changed, color did not
    expect(arg.data.changes).toEqual(expect.arrayContaining(["name", "description"]));
    expect(arg.data.changes).not.toContain("color");
  });

  it("respects an explicit changes array when provided", async () => {
    mockDb.auditLog.create.mockResolvedValue({} as any);

    await writeAuditLog({
      tenantId: "t1",
      actorId: "u1",
      action: "UPDATE",
      entityType: "OPSPData",
      entityId: "opsp1",
      changes: ["rocks", "goals"],
    });

    const arg = mockDb.auditLog.create.mock.calls[0]![0] as any;
    expect(arg.data.changes).toEqual(["rocks", "goals"]);
  });

  it("serializes oldValues/newValues to JSON strings", async () => {
    mockDb.auditLog.create.mockResolvedValue({} as any);

    await writeAuditLog({
      tenantId: "t1",
      actorId: "u1",
      action: "CREATE",
      entityType: "WWWItem",
      entityId: "w1",
      newValues: { who: "alice", status: "not-yet-started" },
    });

    const arg = mockDb.auditLog.create.mock.calls[0]![0] as any;
    expect(typeof arg.data.newValues).toBe("string");
    expect(JSON.parse(arg.data.newValues).who).toBe("alice");
  });

  it("does NOT bubble errors when the audit write fails", async () => {
    mockDb.auditLog.create.mockRejectedValue(new Error("DB down"));

    // Should resolve, not throw
    await expect(
      writeAuditLog({
        tenantId: "t1",
        actorId: "u1",
        action: "DELETE",
        entityType: "Team",
        entityId: "team1",
      })
    ).resolves.toBeUndefined();
  });

  it("handles null/undefined values gracefully", async () => {
    mockDb.auditLog.create.mockResolvedValue({} as any);

    await writeAuditLog({
      tenantId: "t1",
      actorId: "u1",
      action: "DELETE",
      entityType: "Priority",
      entityId: "p1",
    });

    const arg = mockDb.auditLog.create.mock.calls[0]![0] as any;
    expect(arg.data.oldValues).toBeUndefined();
    expect(arg.data.newValues).toBeUndefined();
    expect(arg.data.changes).toEqual([]);
  });

  it("records optional fields (reason, ipAddress, actorRole)", async () => {
    mockDb.auditLog.create.mockResolvedValue({} as any);

    await writeAuditLog({
      tenantId: "t1",
      actorId: "u1",
      action: "UPDATE",
      entityType: "User",
      entityId: "u-target",
      reason: "Admin escalation",
      ipAddress: "10.0.0.1",
      actorRole: "admin",
    });

    const arg = mockDb.auditLog.create.mock.calls[0]![0] as any;
    expect(arg.data.reason).toBe("Admin escalation");
    expect(arg.data.ipAddress).toBe("10.0.0.1");
    expect(arg.data.actorRole).toBe("admin");
  });
});
