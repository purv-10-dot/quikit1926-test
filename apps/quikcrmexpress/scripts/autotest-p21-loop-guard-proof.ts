export {}; // module scope (isolate top-level consts from sibling scripts)
/**
 * [P2.1] Loop-guard proof against first_db_crm_autotest.
 *   1. Self-referential ping-pong (rule A: stage X->Y, rule B: stage Y->X) is
 *      caught: the lead stops flipping at the cap and is marked Terminated.
 *   2. Dual-engine: a real automation write AND a real legacy-disposition write
 *      on the same lead/day increment the SAME counter row.
 * Cap forced low (AUTOMATION_LOOP_CAP=5) so termination is quick. REDIS disabled
 * so everything runs synchronously.
 */
const TENANT = "cmpzc0bn70000a1xp642kgwmf";
const LOOP_LEAD = "p21-loop";
const DUAL_LEAD = "p21-dual";
const CAP = 5;

async function main() {
  delete process.env.REDIS_URL;
  process.env.AUTOMATION_LOOP_CAP = String(CAP);

  const { prisma } = await import("@/lib/db/prisma");
  const { runFrom } = await import("@/lib/services/automation/workflow-engine");
  const { isLeadTerminated, loopDayKey } = await import("@/lib/services/automation/loop-guard");
  const { runAfterActivityLogged } = await import("@/lib/services/automation/disposition-rule-engine");

  const dbrow = await prisma.$queryRawUnsafe<{ db: string }[]>("SELECT current_database() AS db");
  if (dbrow[0]?.db !== "first_db_crm_autotest") throw new Error(`REFUSING: on ${dbrow[0]?.db}`);

  const day = loopDayKey();
  const stageChanges = (leadId: string) =>
    prisma.qceActivity.count({ where: { orgId: TENANT, leadId, type: "LeadStageChange" } });
  const counter = (leadId: string) =>
    prisma.qceAutomationLeadDayCount.findUnique({ where: { orgId_leadId_day: { orgId: TENANT, leadId, day } } });

  const out: string[] = [];
  let allOk = true;
  const check = (n: string, ok: boolean, d: string) => { out.push(`${ok ? "PASS" : "FAIL"}  ${n} — ${d}`); allOk = allOk && ok; };

  // ─── fresh fixtures + counters ───
  await prisma.qceAutomationLeadDayCount.deleteMany({ where: { orgId: TENANT, leadId: { in: [LOOP_LEAD, DUAL_LEAD] } } });
  await prisma.qceActivity.deleteMany({ where: { orgId: TENANT, leadId: { in: [LOOP_LEAD, DUAL_LEAD] } } });
  await prisma.qceLead.deleteMany({ where: { id: { in: [LOOP_LEAD, DUAL_LEAD] } } });
  await prisma.qceLead.create({ data: { id: LOOP_LEAD, orgId: TENANT, name: "P21 loop", stage: "New Lead", status: "Open", source: "p21" } });
  await prisma.qceLead.create({ data: { id: DUAL_LEAD, orgId: TENANT, name: "P21 dual", stage: "New Lead", status: "Open", source: "p21" } });

  // ─── 1. self-referential ping-pong ───
  const wfA = await prisma.qceWorkflowDefinition.create({ data: {
    orgId: TENANT, name: "P21 A New->NotConnected", status: "Active", triggerType: "trigger_lead_updated",
    graphNodes: [
      { id: "c", kind: "if_else", config: { conditions: [{ field: "stage", op: "in", value: ["New Lead"] }] } },
      { id: "a", kind: "update_lead_field", config: { field: "stage", value: "Not Connected" } },
    ],
    graphEdges: [{ from: "c", to: "a", branch: "true" }],
  } });
  const wfB = await prisma.qceWorkflowDefinition.create({ data: {
    orgId: TENANT, name: "P21 B NotConnected->New", status: "Active", triggerType: "trigger_lead_updated",
    graphNodes: [
      { id: "c", kind: "if_else", config: { conditions: [{ field: "stage", op: "in", value: ["Not Connected"] }] } },
      { id: "a", kind: "update_lead_field", config: { field: "stage", value: "New Lead" } },
    ],
    graphEdges: [{ from: "c", to: "a", branch: "true" }],
  } });

  // Simulate the cascade: alternate whichever rule matches. Run well past the cap.
  for (let i = 0; i < CAP + 5; i++) {
    const l = await prisma.qceLead.findUnique({ where: { id: LOOP_LEAD } });
    if (l?.stage === "New Lead") await runFrom(TENANT, wfA.id, LOOP_LEAD, "c");
    else if (l?.stage === "Not Connected") await runFrom(TENANT, wfB.id, LOOP_LEAD, "c");
  }

  const loopTerminated = await isLeadTerminated(TENANT, LOOP_LEAD);
  const loopCounter = await counter(LOOP_LEAD);
  const flips = await stageChanges(LOOP_LEAD);
  check("1.terminated-observable", loopTerminated === true, `isLeadTerminated=${loopTerminated}`);
  check("1.stopped-at-cap", flips === CAP, `actual stage changes = ${flips} (expected == cap ${CAP}; proves churn stopped, no infinite loop)`);
  check("1.counter-exceeded-cap", (loopCounter?.count ?? 0) > CAP, `counter=${loopCounter?.count} (> cap ${CAP}: later attempts were blocked, not written)`);

  // ─── 2. dual-engine counting on one lead/day ───
  // (a) automation write
  const wfDual = await prisma.qceWorkflowDefinition.create({ data: {
    orgId: TENANT, name: "P21 dual automation", status: "Active", triggerType: "trigger_lead_updated",
    graphNodes: [{ id: "a", kind: "update_lead_field", config: { field: "status", value: "Not Interested" } }],
    graphEdges: [],
  } });
  await runFrom(TENANT, wfDual.id, DUAL_LEAD, "a");
  const afterAutomation = await counter(DUAL_LEAD);

  // (b) real legacy-disposition write via the disposition engine
  const rule = await prisma.qceAutomationRule.create({ data: {
    orgId: TENANT, name: "P21 dispo", sortOrder: 1, isActive: true,
    trigger: { type: "activity_logged", activity_type: "call", disposition: "P21PROOF" },
    action: { type: "set_lead_status", status: "Future Lead" },
  } });
  await runAfterActivityLogged({
    orgId: TENANT, leadId: DUAL_LEAD, activityId: "p21-act",
    dispositionCode: "P21PROOF", activityDatetime: new Date(), ownerId: null,
  });
  const afterDisposition = await counter(DUAL_LEAD);

  check("2.automation-incremented", (afterAutomation?.count ?? 0) === 1, `after automation write, counter=${afterAutomation?.count} (expected 1)`);
  check("2.disposition-shares-counter", (afterDisposition?.count ?? 0) === 2,
    `after legacy-disposition write, SAME counter=${afterDisposition?.count} (expected 2 — both engines incremented one row)`);

  // ─── cleanup ───
  await prisma.qceWorkflowDefinition.deleteMany({ where: { id: { in: [wfA.id, wfB.id, wfDual.id] } } });
  await prisma.qceAutomationRule.deleteMany({ where: { id: rule.id } });
  await prisma.qceAutomationLeadDayCount.deleteMany({ where: { orgId: TENANT, leadId: { in: [LOOP_LEAD, DUAL_LEAD] } } });
  await prisma.qceActivity.deleteMany({ where: { orgId: TENANT, leadId: { in: [LOOP_LEAD, DUAL_LEAD] } } });
  await prisma.qceLead.deleteMany({ where: { id: { in: [LOOP_LEAD, DUAL_LEAD] } } });

  console.log("\n" + out.join("\n"));
  console.log(`\n${allOk ? "ALL PASS" : "SOME FAILED"}`);
  await prisma.$disconnect();
  process.exit(allOk ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
