/**
 * [P3.S1] Publish state machine — real-DB integration proof (SPEC §7).
 *
 * Drives the lifecycle service against the actual seeded autotest Postgres +
 * Prisma client (not mocks), proving each transition is a tenant-scoped service
 * call that leaves the QcfWorkflowDefinition row in the expected state, that
 * illegal transitions are rejected, that soft-delete hides-but-persists and is
 * recoverable, and that the firing gates behave (Draining admits no NEW leads
 * but still resumes in-flight).
 *
 * Uses a unique synthetic tenant per run (never the real prod/dev-seed tenants)
 * and hard-deletes only its own rows in afterAll.
 *
 * Requires: local Postgres + .env.local → first_db_crm_autotest.
 * Run: npm run test:integration
 */
import { describe, it, expect, afterAll } from "vitest";
import { integrationPrisma } from "../../helpers/integrationDb";
import {
  publish,
  unpublish,
  softDelete,
  restore,
  listAutomations,
  canAdmitNewLead,
  canResumeInFlight,
  LifecycleError,
} from "@/lib/services/automation/lifecycle";

const TENANT = `int_s1_${Date.now()}`;
const OTHER_TENANT = `int_s1_other_${Date.now()}`;

async function newDraft(tenantId = TENANT, name = "Rule") {
  return integrationPrisma.qcfWorkflowDefinition.create({
    data: { tenantId, name, status: "Draft", triggerType: "trigger_lead_updated", graphNodes: [], graphEdges: [] },
  });
}
const read = (id: string) => integrationPrisma.qcfWorkflowDefinition.findUnique({ where: { id } });

afterAll(async () => {
  for (const t of [TENANT, OTHER_TENANT]) {
    await integrationPrisma.qcfAutomationPendingStep.deleteMany({ where: { tenantId: t } });
    await integrationPrisma.qcfWorkflowDefinition.deleteMany({ where: { tenantId: t } });
  }
  await integrationPrisma.$disconnect();
});

describe("S1 lifecycle · real DB", () => {
  it("publish: Draft → Active and stamps lastPublishedOn", async () => {
    const wf = await newDraft();
    const out = await publish(TENANT, wf.id);
    expect(out.status).toBe("Active");
    expect(out.lastPublishedOn).toBeInstanceOf(Date);
    expect((await read(wf.id))?.status).toBe("Active");
  });

  it("unpublish Delayed → Draining; Immediate → Stopped", async () => {
    const a = await publish(TENANT, (await newDraft()).id);
    const drained = await unpublish(TENANT, a.id, "delayed");
    expect(drained.status).toBe("Draining");

    const b = await publish(TENANT, (await newDraft()).id);
    const stopped = await unpublish(TENANT, b.id, "immediate");
    expect(stopped.status).toBe("Stopped");
  });

  it("Draining admits NO new leads but still resumes in-flight (the gate the engine uses)", () => {
    expect(canAdmitNewLead("Draining")).toBe(false);
    expect(canResumeInFlight("Draining")).toBe(true);
  });

  it("rejects illegal transitions (publish a published rule; unpublish a Draft)", async () => {
    const wf = await publish(TENANT, (await newDraft()).id);
    await expect(publish(TENANT, wf.id)).rejects.toBeInstanceOf(LifecycleError);
    const draft = await newDraft();
    await expect(unpublish(TENANT, draft.id, "immediate")).rejects.toBeInstanceOf(LifecycleError);
  });

  it("soft-delete hides from the active list, persists the row, and is recoverable", async () => {
    const wf = await newDraft(TENANT, "ToDelete");
    await softDelete(TENANT, wf.id);

    const row = await read(wf.id);
    expect(row?.status).toBe("Deleted");
    expect(row?.deletedAt).toBeInstanceOf(Date); // row PERSISTS (not hard-deleted)

    const active = await listAutomations(TENANT);
    expect(active.find((d) => d.id === wf.id)).toBeUndefined(); // hidden from active list
    const all = await listAutomations(TENANT, { includeDeleted: true });
    expect(all.find((d) => d.id === wf.id)).toBeDefined(); // still visible in trash view

    const restored = await restore(TENANT, wf.id);
    expect(restored.status).toBe("Draft");
    expect((await read(wf.id))?.deletedAt).toBeNull();
  });

  it("refuses to delete a Draining automation until drained", async () => {
    const wf = await unpublish(TENANT, (await publish(TENANT, (await newDraft()).id)).id, "delayed");
    expect(wf.status).toBe("Draining");
    await expect(softDelete(TENANT, wf.id)).rejects.toBeInstanceOf(LifecycleError);
  });

  it("is tenant-scoped: one tenant cannot transition another tenant's automation", async () => {
    const wf = await newDraft(TENANT, "Owned");
    await expect(publish(OTHER_TENANT, wf.id)).rejects.toBeInstanceOf(LifecycleError);
    expect((await read(wf.id))?.status).toBe("Draft"); // untouched
  });
});
