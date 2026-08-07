/**
 * [P3.B3] distribute_lead — real-DB proof against seeded autotest DB.
 *
 * Drives runFrom() over a distribute_lead node with two assignment rules + a
 * mandatory default and proves (SPEC §5.4):
 *   - a lead matching only rule 2 is assigned from rule 2's pool;
 *   - a lead matching no rule is assigned from the default pool;
 *   - the assignment routes through the S2 shared write helper — it records an
 *     attribution row (field "ownerId") and increments the loop counter, and the
 *     owner lands on the lead row via the PATCH path (no raw crmLead.update).
 *
 * Synthetic tenant + throwaway leads; arbitrary owner-id strings (ownerId has no
 * FK). No email is involved. Run: npm run test:integration
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { integrationPrisma } from "../../helpers/integrationDb";
import { runFrom } from "@/lib/services/automation/workflow-engine";
import type { DistributeConfig } from "@/types/workflow";

const TENANT = `int_b3_${Date.now()}`;
const WF = `${TENANT}_wf`;

const cfg: DistributeConfig = {
  rules: [
    { conditions: [{ field: "stage", op: "eq", value: "Hot" }], candidateUserIds: ["rule1-user"] },
    { conditions: [{ field: "status", op: "in", value: ["Open"] }], candidateUserIds: ["rule2-user"] },
  ],
  defaultUserIds: ["default-user"],
};

beforeAll(async () => {
  await integrationPrisma.qcfWorkflowDefinition.create({
    data: {
      id: WF,
      orgId: TENANT,
      name: "B3 assign",
      status: "Active",
      triggerType: "trigger_lead_updated",
      graphNodes: [{ id: "n1", kind: "distribute_lead", config: cfg }] as never,
      graphEdges: [] as never,
    },
  });
});

afterAll(async () => {
  await integrationPrisma.qcfAutomationAttribution.deleteMany({ where: { orgId: TENANT } });
  await integrationPrisma.qcfAutomationLeadDayCount.deleteMany({ where: { orgId: TENANT } });
  await integrationPrisma.qcfAutomationDistributionState.deleteMany({ where: { orgId: TENANT } });
  await integrationPrisma.qcfLead.deleteMany({ where: { orgId: TENANT } });
  await integrationPrisma.qcfWorkflowDefinition.deleteMany({ where: { orgId: TENANT } });
  await integrationPrisma.$disconnect();
});

describe("B3 distribute_lead · real DB", () => {
  it("assigns a rule-2-only lead from rule 2, records attribution + loop count, no raw update", async () => {
    const lead = await integrationPrisma.qcfLead.create({
      data: { orgId: TENANT, name: "Rule2 Lead", stage: "Cold", status: "Open", ownerId: "orig-owner" },
    });

    await runFrom(TENANT, WF, lead.id, "n1");

    const after = await integrationPrisma.qcfLead.findUnique({ where: { id: lead.id } });
    expect(after?.ownerId).toBe("rule2-user"); // rule 1 (stage=Hot) misses; rule 2 (status=Open) wins

    const attr = await integrationPrisma.qcfAutomationAttribution.findMany({ where: { orgId: TENANT, leadId: lead.id } });
    expect(attr).toHaveLength(1);
    expect(attr[0]).toMatchObject({ field: "ownerId", afterValue: "rule2-user", engineSource: "automation" });

    const counter = await integrationPrisma.qcfAutomationLeadDayCount.findFirst({ where: { orgId: TENANT, leadId: lead.id } });
    expect(counter?.count).toBe(1); // the owner write counted toward the per-lead/day cap
  });

  it("assigns a no-match lead from the mandatory default pool", async () => {
    const lead = await integrationPrisma.qcfLead.create({
      data: { orgId: TENANT, name: "Default Lead", stage: "Cold", status: "Closed", ownerId: "orig-owner" },
    });

    await runFrom(TENANT, WF, lead.id, "n1");

    const after = await integrationPrisma.qcfLead.findUnique({ where: { id: lead.id } });
    expect(after?.ownerId).toBe("default-user");
  });
});
