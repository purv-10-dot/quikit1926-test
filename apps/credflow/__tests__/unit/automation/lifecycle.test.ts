/**
 * [P3.S1] Automation publish lifecycle — the shared state machine (SPEC §7).
 *
 * Proves at the unit level (mocked db) the transitions, the firing gates the
 * engine/trigger-emitter consume, tenant-scoping, and that illegal transitions
 * are rejected.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { mockDb } from "../../helpers/mockDb";
import type { QcfWorkflowDefinition, QcfWorkflowStatus } from "@quikit/database";
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

function def(status: QcfWorkflowStatus): QcfWorkflowDefinition {
  return {
    id: "wf1",
    orgId: "t1",
    name: "Rule",
    status,
    deletedAt: null,
    lastPublishedOn: null,
  } as unknown as QcfWorkflowDefinition;
}

beforeEach(() => {
  db.qcfWorkflowDefinition.findFirst.mockReset();
  db.qcfWorkflowDefinition.update.mockReset();
  db.qcfWorkflowDefinition.findMany.mockReset();
  db.qcfAutomationPendingStep.count.mockReset();
  // Return value is unused (tests assert on the call args, not the result).
  db.qcfWorkflowDefinition.update.mockResolvedValue(def("Active"));
});

describe("lifecycle · firing gates (single source of truth for the engine)", () => {
  it("only Active admits NEW leads", () => {
    expect(canAdmitNewLead("Active")).toBe(true);
    for (const s of ["Draft", "Draining", "Stopped", "Deleted", "Paused", "Archived"] as QcfWorkflowStatus[]) {
      expect(canAdmitNewLead(s)).toBe(false);
    }
  });

  it("Active AND Draining resume in-flight leads; nothing else does", () => {
    expect(canResumeInFlight("Active")).toBe(true);
    expect(canResumeInFlight("Draining")).toBe(true); // Drain lets in-flight finish
    for (const s of ["Draft", "Stopped", "Deleted", "Paused", "Archived"] as QcfWorkflowStatus[]) {
      expect(canResumeInFlight(s)).toBe(false);
    }
  });

  it("structure is editable only in Draft (canvas-lock / immutability)", () => {
    expect(canEditStructure("Draft")).toBe(true);
    for (const s of ["Active", "Draining", "Stopped", "Deleted"] as QcfWorkflowStatus[]) {
      expect(canEditStructure(s)).toBe(false);
    }
  });
});

describe("lifecycle · publish", () => {
  it("Draft → Active and stamps lastPublishedOn, tenant-scoped", async () => {
    db.qcfWorkflowDefinition.findFirst.mockResolvedValue(def("Draft"));
    await publish("t1", "wf1");
    expect(db.qcfWorkflowDefinition.findFirst).toHaveBeenCalledWith({
      where: { id: "wf1", orgId: "t1", deletedAt: null },
    });
    const arg = db.qcfWorkflowDefinition.update.mock.calls[0][0];
    expect(arg.data.status).toBe("Active");
    expect(arg.data.lastPublishedOn).toBeInstanceOf(Date);
  });

  it("rejects publish from a non-Draft status", async () => {
    db.qcfWorkflowDefinition.findFirst.mockResolvedValue(def("Active"));
    await expect(publish("t1", "wf1")).rejects.toBeInstanceOf(LifecycleError);
    expect(db.qcfWorkflowDefinition.update).not.toHaveBeenCalled();
  });

  it("rejects when the workflow is not found for the tenant", async () => {
    db.qcfWorkflowDefinition.findFirst.mockResolvedValue(null);
    await expect(publish("t1", "missing")).rejects.toBeInstanceOf(LifecycleError);
  });
});

describe("lifecycle · unpublish", () => {
  it("Immediate → Stopped", async () => {
    db.qcfWorkflowDefinition.findFirst.mockResolvedValue(def("Active"));
    await unpublish("t1", "wf1", "immediate");
    expect(db.qcfWorkflowDefinition.update.mock.calls[0][0].data).toEqual({ status: "Stopped" });
  });

  it("Delayed → Draining", async () => {
    db.qcfWorkflowDefinition.findFirst.mockResolvedValue(def("Active"));
    await unpublish("t1", "wf1", "delayed");
    expect(db.qcfWorkflowDefinition.update.mock.calls[0][0].data).toEqual({ status: "Draining" });
  });

  it("rejects unpublish of a Draft (nothing to unpublish)", async () => {
    db.qcfWorkflowDefinition.findFirst.mockResolvedValue(def("Draft"));
    await expect(unpublish("t1", "wf1", "immediate")).rejects.toBeInstanceOf(LifecycleError);
  });
});

describe("lifecycle · softDelete / restore", () => {
  it("soft-deletes (Deleted + deletedAt) and never hard-deletes", async () => {
    db.qcfWorkflowDefinition.findFirst.mockResolvedValue(def("Stopped"));
    await softDelete("t1", "wf1");
    const arg = db.qcfWorkflowDefinition.update.mock.calls[0][0];
    expect(arg.data.status).toBe("Deleted");
    expect(arg.data.deletedAt).toBeInstanceOf(Date);
    expect(db.qcfWorkflowDefinition.delete).not.toHaveBeenCalled();
  });

  it("refuses to delete a Draining automation (non-deletable until drained)", async () => {
    db.qcfWorkflowDefinition.findFirst.mockResolvedValue(def("Draining"));
    await expect(softDelete("t1", "wf1")).rejects.toBeInstanceOf(LifecycleError);
    expect(db.qcfWorkflowDefinition.update).not.toHaveBeenCalled();
  });

  it("restore returns a Deleted automation to Draft and clears deletedAt", async () => {
    db.qcfWorkflowDefinition.findFirst.mockResolvedValue({ ...def("Deleted"), deletedAt: new Date() });
    await restore("t1", "wf1");
    const arg = db.qcfWorkflowDefinition.update.mock.calls[0][0];
    expect(arg.data).toEqual({ status: "Draft", deletedAt: null });
    // restore must be able to see soft-deleted rows
    expect(db.qcfWorkflowDefinition.findFirst).toHaveBeenCalledWith({ where: { id: "wf1", orgId: "t1" } });
  });

  it("restore rejects a non-deleted automation", async () => {
    db.qcfWorkflowDefinition.findFirst.mockResolvedValue(def("Active"));
    await expect(restore("t1", "wf1")).rejects.toBeInstanceOf(LifecycleError);
  });
});

describe("lifecycle · reads", () => {
  it("listAutomations hides soft-deleted rows by default, tenant-scoped", async () => {
    db.qcfWorkflowDefinition.findMany.mockResolvedValue([]);
    await listAutomations("t1");
    expect(db.qcfWorkflowDefinition.findMany).toHaveBeenCalledWith({
      where: { orgId: "t1", deletedAt: null },
      orderBy: { updatedAt: "desc" },
    });
  });

  it("listAutomations includeDeleted drops the deletedAt filter (trash view)", async () => {
    db.qcfWorkflowDefinition.findMany.mockResolvedValue([]);
    await listAutomations("t1", { includeDeleted: true });
    expect(db.qcfWorkflowDefinition.findMany).toHaveBeenCalledWith({
      where: { orgId: "t1" },
      orderBy: { updatedAt: "desc" },
    });
  });

  it("isDrained is true only when no pending/processing steps remain", async () => {
    db.qcfAutomationPendingStep.count.mockResolvedValue(0);
    expect(await isDrained("t1", "wf1")).toBe(true);
    db.qcfAutomationPendingStep.count.mockResolvedValue(2);
    expect(await isDrained("t1", "wf1")).toBe(false);
    expect(db.qcfAutomationPendingStep.count).toHaveBeenCalledWith({
      where: { orgId: "t1", workflowId: "wf1", status: { in: ["pending", "processing"] } },
    });
  });
});
