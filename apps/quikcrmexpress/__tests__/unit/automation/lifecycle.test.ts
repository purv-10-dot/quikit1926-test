/**
 * [P3.S1] Automation publish lifecycle — the shared state machine (SPEC §7).
 *
 * Proves at the unit level (mocked db) the transitions, the firing gates the
 * engine/trigger-emitter consume, tenant-scoping, and that illegal transitions
 * are rejected.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { mockDb } from "../../helpers/mockDb";
import type { QceWorkflowDefinition, QceWorkflowStatus } from "@quikit/database";
import {
  publish,
  unpublish,
  softDelete,
  restore,
  listAutomations,
  isDrained,
  canAdmitNewLead,
  canResumeInFlight,
  canEditStructure,
  LifecycleError,
} from "@/lib/services/automation/lifecycle";

const db = mockDb();

function def(status: QceWorkflowStatus): QceWorkflowDefinition {
  return {
    id: "wf1",
    orgId: "t1",
    name: "Rule",
    status,
    deletedAt: null,
    lastPublishedOn: null,
  } as unknown as QceWorkflowDefinition;
}

beforeEach(() => {
  db.qceWorkflowDefinition.findFirst.mockReset();
  db.qceWorkflowDefinition.update.mockReset();
  db.qceWorkflowDefinition.findMany.mockReset();
  db.qceAutomationPendingStep.count.mockReset();
  // Return value is unused (tests assert on the call args, not the result).
  db.qceWorkflowDefinition.update.mockResolvedValue(def("Active"));
});

describe("lifecycle · firing gates (single source of truth for the engine)", () => {
  it("only Active admits NEW leads", () => {
    expect(canAdmitNewLead("Active")).toBe(true);
    for (const s of ["Draft", "Draining", "Stopped", "Deleted", "Paused", "Archived"] as QceWorkflowStatus[]) {
      expect(canAdmitNewLead(s)).toBe(false);
    }
  });

  it("Active AND Draining resume in-flight leads; nothing else does", () => {
    expect(canResumeInFlight("Active")).toBe(true);
    expect(canResumeInFlight("Draining")).toBe(true); // Drain lets in-flight finish
    for (const s of ["Draft", "Stopped", "Deleted", "Paused", "Archived"] as QceWorkflowStatus[]) {
      expect(canResumeInFlight(s)).toBe(false);
    }
  });

  it("structure is editable only in Draft (canvas-lock / immutability)", () => {
    expect(canEditStructure("Draft")).toBe(true);
    for (const s of ["Active", "Draining", "Stopped", "Deleted"] as QceWorkflowStatus[]) {
      expect(canEditStructure(s)).toBe(false);
    }
  });
});

describe("lifecycle · publish", () => {
  it("Draft → Active and stamps lastPublishedOn, tenant-scoped", async () => {
    db.qceWorkflowDefinition.findFirst.mockResolvedValue(def("Draft"));
    await publish("t1", "wf1");
    expect(db.qceWorkflowDefinition.findFirst).toHaveBeenCalledWith({
      where: { id: "wf1", orgId: "t1", deletedAt: null },
    });
    const arg = db.qceWorkflowDefinition.update.mock.calls[0][0];
    expect(arg.data.status).toBe("Active");
    expect(arg.data.lastPublishedOn).toBeInstanceOf(Date);
  });

  it("rejects publish from a non-Draft status", async () => {
    db.qceWorkflowDefinition.findFirst.mockResolvedValue(def("Active"));
    await expect(publish("t1", "wf1")).rejects.toBeInstanceOf(LifecycleError);
    expect(db.qceWorkflowDefinition.update).not.toHaveBeenCalled();
  });

  it("rejects when the workflow is not found for the tenant", async () => {
    db.qceWorkflowDefinition.findFirst.mockResolvedValue(null);
    await expect(publish("t1", "missing")).rejects.toBeInstanceOf(LifecycleError);
  });
});

describe("lifecycle · unpublish", () => {
  it("Immediate → Stopped", async () => {
    db.qceWorkflowDefinition.findFirst.mockResolvedValue(def("Active"));
    await unpublish("t1", "wf1", "immediate");
    expect(db.qceWorkflowDefinition.update.mock.calls[0][0].data).toEqual({ status: "Stopped" });
  });

  it("Delayed → Draining", async () => {
    db.qceWorkflowDefinition.findFirst.mockResolvedValue(def("Active"));
    await unpublish("t1", "wf1", "delayed");
    expect(db.qceWorkflowDefinition.update.mock.calls[0][0].data).toEqual({ status: "Draining" });
  });

  it("rejects unpublish of a Draft (nothing to unpublish)", async () => {
    db.qceWorkflowDefinition.findFirst.mockResolvedValue(def("Draft"));
    await expect(unpublish("t1", "wf1", "immediate")).rejects.toBeInstanceOf(LifecycleError);
  });
});

describe("lifecycle · softDelete / restore", () => {
  it("soft-deletes (Deleted + deletedAt) and never hard-deletes", async () => {
    db.qceWorkflowDefinition.findFirst.mockResolvedValue(def("Stopped"));
    await softDelete("t1", "wf1");
    const arg = db.qceWorkflowDefinition.update.mock.calls[0][0];
    expect(arg.data.status).toBe("Deleted");
    expect(arg.data.deletedAt).toBeInstanceOf(Date);
    expect(db.qceWorkflowDefinition.delete).not.toHaveBeenCalled();
  });

  it("refuses to delete a Draining automation (non-deletable until drained)", async () => {
    db.qceWorkflowDefinition.findFirst.mockResolvedValue(def("Draining"));
    await expect(softDelete("t1", "wf1")).rejects.toBeInstanceOf(LifecycleError);
    expect(db.qceWorkflowDefinition.update).not.toHaveBeenCalled();
  });

  it("restore returns a Deleted automation to Draft and clears deletedAt", async () => {
    db.qceWorkflowDefinition.findFirst.mockResolvedValue({ ...def("Deleted"), deletedAt: new Date() });
    await restore("t1", "wf1");
    const arg = db.qceWorkflowDefinition.update.mock.calls[0][0];
    expect(arg.data).toEqual({ status: "Draft", deletedAt: null });
    // restore must be able to see soft-deleted rows
    expect(db.qceWorkflowDefinition.findFirst).toHaveBeenCalledWith({ where: { id: "wf1", orgId: "t1" } });
  });

  it("restore rejects a non-deleted automation", async () => {
    db.qceWorkflowDefinition.findFirst.mockResolvedValue(def("Active"));
    await expect(restore("t1", "wf1")).rejects.toBeInstanceOf(LifecycleError);
  });
});

describe("lifecycle · reads", () => {
  it("listAutomations hides soft-deleted rows by default, tenant-scoped", async () => {
    db.qceWorkflowDefinition.findMany.mockResolvedValue([]);
    await listAutomations("t1");
    expect(db.qceWorkflowDefinition.findMany).toHaveBeenCalledWith({
      where: { orgId: "t1", deletedAt: null },
      orderBy: { updatedAt: "desc" },
    });
  });

  it("listAutomations includeDeleted drops the deletedAt filter (trash view)", async () => {
    db.qceWorkflowDefinition.findMany.mockResolvedValue([]);
    await listAutomations("t1", { includeDeleted: true });
    expect(db.qceWorkflowDefinition.findMany).toHaveBeenCalledWith({
      where: { orgId: "t1" },
      orderBy: { updatedAt: "desc" },
    });
  });

  it("isDrained is true only when no pending/processing steps remain", async () => {
    db.qceAutomationPendingStep.count.mockResolvedValue(0);
    expect(await isDrained("t1", "wf1")).toBe(true);
    db.qceAutomationPendingStep.count.mockResolvedValue(2);
    expect(await isDrained("t1", "wf1")).toBe(false);
    expect(db.qceAutomationPendingStep.count).toHaveBeenCalledWith({
      where: { orgId: "t1", workflowId: "wf1", status: { in: ["pending", "processing"] } },
    });
  });
});
