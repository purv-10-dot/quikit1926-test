/**
 * [P1.3] Phase 1 E2E gate — R19 + R1 executed end-to-end against
 * first_db_crm_autotest. Builds real QcfWorkflowDefinition rows, drives them via
 * the engine's runFrom, verifies stage outcomes + transition-service audit rows.
 * REDIS disabled at runtime → synchronous, no BullMQ cascade.
 *
 *   R19: IF substatus IN ["Negotiation"] THEN stage = "Negotiation"
 *   R1 : IF substatus IN [7] AND stage IN [15] THEN stage = "Disqualified"
 */
const TENANT = "cmpzc0bn70000a1xp642kgwmf";

// R1's 7 disqualifying substatuses (verbatim from the tenant's live
// statusToSubstatuses["Disqualified"]).
const R1_SUBSTATUSES = [
  "Not using Tally/ Busy",
  "Invalid client details ( number/email)",
  "other ( self notes)",
  "Student Lead",
  "Language Barrier",
  "Looking to buy Tally/ Busy",
  "Unable to sync (Oracle user)",
];
// R1's 15 source stages (all present in the tenant's leadPipelineConfig.stages;
// deliberately EXCLUDES "Disqualified" (terminal target) and "Onboarding Done"
// (the substatus-only negative lead sits there) and INCLUDES "New Lead".
const R1_STAGES = [
  "New Lead", "Not Connected", "Not Connected (New Lead)", "Discussion Pending",
  "Not Connected (Discussion Pending)", "Demo Scheduled", "Not Connected (Demo Scheduled)",
  "Demo Completed-demo Syncing", "Interested-FollowUp", "Not Connected (Interested Followup)",
  "Interested Followup Counselling", "Payment Link Sent", "Not Connected (Payment Link Sent)",
  "Negotiation", "Future Lead",
];

const R1_MATCH = Array.from({ length: 7 }, (_, i) => `autotest-r1-match-${i + 1}`);

async function main() {
  delete process.env.REDIS_URL;
  const { prisma } = await import("@/lib/db/prisma");
  const { runFrom } = await import("@/lib/services/automation/workflow-engine");

  const dbrow = await prisma.$queryRawUnsafe<{ db: string }[]>("SELECT current_database() AS db");
  if (dbrow[0]?.db !== "first_db_crm_autotest") throw new Error(`REFUSING: on ${dbrow[0]?.db}`);

  const stageChanges = (leadId: string) =>
    prisma.qcfActivity.count({ where: { tenantId: TENANT, leadId, type: "LeadStageChange" } });

  // ---- reset fixture baselines (idempotent, direct writes) ----
  await prisma.qcfLead.update({ where: { id: "autotest-r19-match" }, data: { stage: "New Lead", substatus: "Negotiation" } });
  await prisma.qcfLead.update({ where: { id: "autotest-r1-substatus-only" }, data: { stage: "Onboarding Done", substatus: "Student Lead" } });
  await prisma.qcfLead.update({ where: { id: "autotest-r1-stage-only" }, data: { stage: "New Lead", substatus: "Support Issue" } });
  for (const id of R1_MATCH) await prisma.qcfLead.update({ where: { id }, data: { stage: "New Lead" } });

  // ---- definitions ----
  const r19 = await prisma.qcfWorkflowDefinition.create({
    data: {
      tenantId: TENANT, name: "R19 substage→Negotiation", status: "Active", triggerType: "trigger_lead_updated",
      graphNodes: [
        { id: "t", kind: "trigger_lead_updated", config: {} },
        { id: "cond", kind: "if_else", config: { conditions: [{ field: "substatus", op: "in", value: ["Negotiation"] }] } },
        { id: "act", kind: "update_lead_field", config: { field: "stage", value: "Negotiation" } },
      ],
      graphEdges: [
        { from: "t", to: "cond" },
        { from: "cond", to: "act", branch: "true" },
      ],
    },
  });
  const r1 = await prisma.qcfWorkflowDefinition.create({
    data: {
      tenantId: TENANT, name: "R1 substage+stage→Disqualified", status: "Active", triggerType: "trigger_lead_updated",
      graphNodes: [
        { id: "t", kind: "trigger_lead_updated", config: {} },
        { id: "cond", kind: "if_else", config: { conditions: [
          { field: "substatus", op: "in", value: R1_SUBSTATUSES },
          { field: "stage", op: "in", value: R1_STAGES },
        ] } },
        { id: "act", kind: "update_lead_field", config: { field: "stage", value: "Disqualified" } },
      ],
      graphEdges: [
        { from: "t", to: "cond" },
        { from: "cond", to: "act", branch: "true" },
      ],
    },
  });

  const out: string[] = [];
  let allOk = true;
  const check = (n: string, ok: boolean, d: string) => { out.push(`${ok ? "PASS" : "FAIL"}  ${n} — ${d}`); allOk = allOk && ok; };

  // ---- R19 ----
  const before19 = await stageChanges("autotest-r19-match");
  await runFrom(TENANT, r19.id, "autotest-r19-match", "t");
  const l19 = await prisma.qcfLead.findUnique({ where: { id: "autotest-r19-match" } });
  const after19 = await stageChanges("autotest-r19-match");
  check("R19.stage", l19?.stage === "Negotiation", `stage=${l19?.stage} (expected Negotiation)`);
  check("R19.audit-via-transition", after19 === before19 + 1, `LeadStageChange ${before19}->${after19} (expected +1)`);

  // ---- R1 full matches (all 7) ----
  let matchAuditOk = true;
  for (const id of R1_MATCH) {
    const b = await stageChanges(id);
    await runFrom(TENANT, r1.id, id, "t");
    const l = await prisma.qcfLead.findUnique({ where: { id } });
    const a = await stageChanges(id);
    if (l?.stage !== "Disqualified" || a !== b + 1) {
      matchAuditOk = false;
      check(`R1.match.${id}`, false, `stage=${l?.stage}, audit ${b}->${a}`);
    }
  }
  if (matchAuditOk) check("R1.match.all-7", true, "all 7 → Disqualified, each +1 transition audit row");

  // ---- R1 AND-negative: substatus in list, stage NOT in list ----
  const bNeg1 = await stageChanges("autotest-r1-substatus-only");
  await runFrom(TENANT, r1.id, "autotest-r1-substatus-only", "t");
  const lNeg1 = await prisma.qcfLead.findUnique({ where: { id: "autotest-r1-substatus-only" } });
  const aNeg1 = await stageChanges("autotest-r1-substatus-only");
  check("R1.neg.substatus-only", lNeg1?.stage === "Onboarding Done" && aNeg1 === bNeg1,
    `stage=${lNeg1?.stage} (expected unchanged Onboarding Done), audit ${bNeg1}->${aNeg1}`);

  // ---- R1 AND-negative: stage in list, substatus NOT in list ----
  const bNeg2 = await stageChanges("autotest-r1-stage-only");
  await runFrom(TENANT, r1.id, "autotest-r1-stage-only", "t");
  const lNeg2 = await prisma.qcfLead.findUnique({ where: { id: "autotest-r1-stage-only" } });
  const aNeg2 = await stageChanges("autotest-r1-stage-only");
  check("R1.neg.stage-only", lNeg2?.stage === "New Lead" && aNeg2 === bNeg2,
    `stage=${lNeg2?.stage} (expected unchanged New Lead), audit ${bNeg2}->${aNeg2}`);

  // ---- cleanup defs ----
  await prisma.qcfWorkflowDefinition.deleteMany({ where: { id: { in: [r19.id, r1.id] } } });

  console.log("\n" + out.join("\n"));
  console.log(`\n${allOk ? "ALL PASS" : "SOME FAILED"}`);
  await prisma.$disconnect();
  process.exit(allOk ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
