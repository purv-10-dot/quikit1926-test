import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mockDb } from "../helpers/mockDb";

const db = mockDb();

describe("createDefaultTaskForLead", () => {
  const originalEnv = process.env.AUTO_TASK_ON_LEAD_CREATE;

  beforeEach(() => {
    db.qcfTask.create.mockReset();
  });

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.AUTO_TASK_ON_LEAD_CREATE;
    else process.env.AUTO_TASK_ON_LEAD_CREATE = originalEnv;
    vi.resetModules();
  });

  async function loadCreateDefaultTaskForLead() {
    const mod = await import("@/lib/services/leads/auto-task");
    return mod.createDefaultTaskForLead;
  }

  const lead = {
    id: "lead-1",
    orgId: "t1",
    name: "Acme Lead",
    ownerId: "u-owner",
  } as const;

  it("does not create a task when AUTO_TASK_ON_LEAD_CREATE is unset", async () => {
    delete process.env.AUTO_TASK_ON_LEAD_CREATE;
    const createDefaultTaskForLead = await loadCreateDefaultTaskForLead();
    await createDefaultTaskForLead(lead);
    expect(db.qcfTask.create).not.toHaveBeenCalled();
  });

  it("creates a follow-up task when AUTO_TASK_ON_LEAD_CREATE=true", async () => {
    process.env.AUTO_TASK_ON_LEAD_CREATE = "true";
    db.qcfTask.create.mockResolvedValueOnce({ id: "task-1" } as never);
    const createDefaultTaskForLead = await loadCreateDefaultTaskForLead();
    await createDefaultTaskForLead(lead);
    expect(db.qcfTask.create).toHaveBeenCalledTimes(1);
    const arg = db.qcfTask.create.mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(arg.subject).toBe("Follow-up with Acme Lead");
    expect(arg.priority).toBe("Medium");
    expect(arg.status).toBe("Open");
    expect(arg.assignedToUserId).toBe("u-owner");
  });
});
