/**
 * FR-D3 / FR-D5 — Real-DB integration tests for the disposition rule engine.
 *
 * These tests prove the engine works against the actual schema + Prisma client,
 * not just against mocks.  They cover two explicit gaps identified after the
 * unit-test pass:
 *
 *   INT-D3-1   Engine reads a real QcfAutomationRule and writes a real status
 *              change + audit row.
 *   INT-D5-1   Audit log before.status equals the lead's ACTUAL prior status
 *              from the database, not a value the engine may have mutated in
 *              memory.  This test would fail if the engine reverted to mutating
 *              its local `lead` object before capturing prevStatus.
 *
 * Requires: local Postgres + .env.local with DATABASE_URL.
 * Run: npm run test:integration
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { integrationPrisma, cleanupTenant } from "../../helpers/integrationDb";
import { runAfterActivityLogged } from "@/lib/services/automation/disposition-rule-engine";

// Unique tenant per test run — prevents cross-run contamination.
const TENANT = `int_d3_${Date.now()}`;

// Shared fixtures created in beforeAll.
let leadId: string;
let activityId: string;
let ruleId: string;

const INITIAL_STATUS = "New";
const TARGET_STATUS = "Disqualified";
const DISPOSITION_CODE = "not_interested";
const ACTIVITY_DT = new Date("2026-06-18T10:00:00Z");

beforeAll(async () => {
  // Create the minimal QcfLead the engine will update.
  const lead = await integrationPrisma.qcfLead.create({
    data: { orgId: TENANT, name: "Integration Test Lead", status: INITIAL_STATUS },
  });
  leadId = lead.id;

  // Create a stub QcfActivity (engine receives its ID; doesn't create it).
  const activity = await integrationPrisma.qcfActivity.create({
    data: {
      orgId: TENANT,
      type: "Call",
      relatedKind: "Lead",
      relatedObjectId: leadId,
      leadId,
      subject: "Test call",
      occurredAt: ACTIVITY_DT,
    },
  });
  activityId = activity.id;

  // Create the automation rule under test.
  const rule = await integrationPrisma.qcfAutomationRule.create({
    data: {
      orgId: TENANT,
      name: "Integration: not_interested → Disqualified",
      trigger: { type: "activity_logged", activity_type: "call", disposition: DISPOSITION_CODE },
      action: { type: "set_lead_status", status: TARGET_STATUS },
      sortOrder: 1,
      isActive: true,
    },
  });
  ruleId = rule.id;
});

afterAll(async () => {
  await cleanupTenant(TENANT);
  await integrationPrisma.$disconnect();
});

describe("FR-D3 / FR-D5 — Disposition Rule Engine (integration)", () => {
  // ── INT-D3-1: engine reads a real rule and writes a real status change ────

  it("INT-D3-1: updates CrmLead.status in the database when disposition matches", async () => {
    await runAfterActivityLogged({
      orgId: TENANT,
      leadId,
      activityId,
      dispositionCode: DISPOSITION_CODE,
      activityDatetime: ACTIVITY_DT,
      ownerId: null,
    });

    const updated = await integrationPrisma.qcfLead.findUnique({
      where: { id: leadId },
      select: { status: true },
    });

    expect(updated?.status).toBe(TARGET_STATUS);
  });

  // ── INT-D5-1: audit before.status matches the PRE-UPDATE database value ──

  it("INT-D5-1: CrmAuditLog before.status equals the lead's actual prior status (not a mutated in-memory copy)", async () => {
    // Read the true current status from the DB *before* calling the engine.
    // This is the ground truth — if the audit log disagrees, the engine has a
    // before-capture bug.
    const before = await integrationPrisma.qcfLead.findUnique({
      where: { id: leadId },
      select: { status: true },
    });
    const priorStatus = before!.status;

    // Target a different status for this run so the engine fires again.
    const nextStatus = "Contacted";
    await integrationPrisma.qcfAutomationRule.update({
      where: { id: ruleId },
      data: { action: { type: "set_lead_status", status: nextStatus } },
    });

    await runAfterActivityLogged({
      orgId: TENANT,
      leadId,
      activityId,
      dispositionCode: DISPOSITION_CODE,
      activityDatetime: ACTIVITY_DT,
      ownerId: null,
    });

    // Find the audit row written for this status change.
    const auditRow = await integrationPrisma.qcfAuditLog.findFirst({
      where: {
        orgId: TENANT,
        module: "leads",
        action: "status_changed",
        resourceId: leadId,
        // The row whose `after` matches the status we just set.
        after: { path: ["status"], equals: nextStatus },
      },
      orderBy: { createdAt: "desc" },
    });

    expect(auditRow).not.toBeNull();

    const beforeField = (auditRow!.before as { status?: string } | null)?.status;
    const afterField = (auditRow!.after as { status?: string } | null)?.status;
    const metaRuleId = (auditRow!.metadata as { ruleId?: string } | null)?.ruleId;

    // Core Gap-2 assertion: before == the actual DB value we read, not TARGET_STATUS.
    expect(beforeField).toBe(priorStatus);
    expect(afterField).toBe(nextStatus);
    expect(metaRuleId).toBe(ruleId);
  });
});
