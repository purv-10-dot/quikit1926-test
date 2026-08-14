/**
 * [P3.S2] Shared automated-write helper — real-DB regression proof.
 *
 * Confirms the EXTRACTED helper still executes the 1.3 contract correctly
 * against the seeded autotest DB (the S2 acceptance): a non-pipeline field write
 * routes through the PATCH path and lands on the lead row, records a real
 * attribution row, and increments the real loop counter — the same effects the
 * inlined update_lead_field produced before extraction.
 *
 * Uses a synthetic tenant + throwaway lead (never a seed lead) and cleans up.
 * Requires: local Postgres + .env.local → first_db_crm_autotest.
 * Run: npm run test:integration
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { integrationPrisma } from "../../helpers/integrationDb";
import { applyAutomatedLeadWrite } from "@/lib/services/automation/automated-write";
import type { QceLead } from "@quikit/database";

const TENANT = `int_s2_${Date.now()}`;
let lead: QceLead;

beforeAll(async () => {
  lead = await integrationPrisma.qceLead.create({
    data: { orgId: TENANT, name: "S2 Helper Lead", status: "Open", stage: "New" },
  });
});

afterAll(async () => {
  await integrationPrisma.qceAutomationAttribution.deleteMany({ where: { orgId: TENANT } });
  await integrationPrisma.qceAutomationLeadDayCount.deleteMany({ where: { orgId: TENANT } });
  await integrationPrisma.qceLead.deleteMany({ where: { orgId: TENANT } });
  await integrationPrisma.$disconnect();
});

describe("S2 automated-write helper · real DB", () => {
  it("writes a status change via PATCH, records attribution, and counts the loop guard", async () => {
    const outcome = await applyAutomatedLeadWrite({
      orgId: TENANT,
      lead,
      field: "status",
      value: "Disqualified",
      workflowId: "wf-s2",
      nodeId: "n1",
      triggerEventId: "evt-s2",
      triggerType: "trigger_lead_updated",
      snapshot: { status: "Open" },
    });

    expect(outcome).toBe("written");

    const row = await integrationPrisma.qceLead.findUnique({ where: { id: lead.id } });
    expect(row?.status).toBe("Disqualified"); // real PATCH landed on the lead

    const attr = await integrationPrisma.qceAutomationAttribution.findMany({ where: { orgId: TENANT, leadId: lead.id } });
    expect(attr).toHaveLength(1);
    expect(attr[0]).toMatchObject({ engineSource: "automation", field: "status", beforeValue: "Open", afterValue: "Disqualified" });

    const counter = await integrationPrisma.qceAutomationLeadDayCount.findFirst({ where: { orgId: TENANT, leadId: lead.id } });
    expect(counter?.count).toBe(1); // one automated write counted toward the cap
  });

  it("is a NO-OP on a same-value write (no counter increment, no new attribution)", async () => {
    // status is now "Disqualified" from the previous test — writing it again is a no-op.
    const outcome = await applyAutomatedLeadWrite({
      orgId: TENANT,
      lead: (await integrationPrisma.qceLead.findUnique({ where: { id: lead.id } }))!,
      field: "status",
      value: "Disqualified",
      workflowId: "wf-s2",
      nodeId: "n1",
      triggerEventId: "evt-s2b",
      triggerType: "trigger_lead_updated",
      snapshot: { status: "Disqualified" },
    });

    expect(outcome).toBe("noop");
    const counter = await integrationPrisma.qceAutomationLeadDayCount.findFirst({ where: { orgId: TENANT, leadId: lead.id } });
    expect(counter?.count).toBe(1); // unchanged — a no-op must not consume the budget
    const attr = await integrationPrisma.qceAutomationAttribution.count({ where: { orgId: TENANT, leadId: lead.id } });
    expect(attr).toBe(1); // no new attribution row
  });
});
