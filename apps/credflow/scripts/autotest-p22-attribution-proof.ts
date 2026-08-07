export {}; // module scope (isolate top-level consts from sibling scripts)
/**
 * [P2.2] Attribution proof against first_db_crm_autotest.
 *   1. An automation stage write records a QcfAutomationAttribution row that
 *      answers "why did this lead get disqualified?" in one read: automation +
 *      node + trigger event + before->after + trigger-time snapshot.
 *   2. engineSource discriminates automation vs legacy-disposition (both engines
 *      write attribution).
 * REDIS disabled → synchronous.
 */
const TENANT = "cmpzc0bn70000a1xp642kgwmf";
const AUTO_LEAD = "p22-auto";
const DISPO_LEAD = "p22-dispo";

async function main() {
  delete process.env.REDIS_URL;
  const { prisma } = await import("@/lib/db/prisma");
  const { runFrom } = await import("@/lib/services/automation/workflow-engine");
  const { runAfterActivityLogged } = await import("@/lib/services/automation/disposition-rule-engine");

  const dbrow = await prisma.$queryRawUnsafe<{ db: string }[]>("SELECT current_database() AS db");
  if (dbrow[0]?.db !== "first_db_crm_autotest") throw new Error(`REFUSING: on ${dbrow[0]?.db}`);

  const out: string[] = [];
  let allOk = true;
  const check = (n: string, ok: boolean, d: string) => { out.push(`${ok ? "PASS" : "FAIL"}  ${n} — ${d}`); allOk = allOk && ok; };

  // ─── fresh fixtures ───
  await prisma.qcfAutomationAttribution.deleteMany({ where: { orgId: TENANT, leadId: { in: [AUTO_LEAD, DISPO_LEAD] } } });
  await prisma.qcfAutomationLeadDayCount.deleteMany({ where: { orgId: TENANT, leadId: { in: [AUTO_LEAD, DISPO_LEAD] } } });
  await prisma.qcfLead.deleteMany({ where: { id: { in: [AUTO_LEAD, DISPO_LEAD] } } });
  await prisma.qcfLead.create({ data: { id: AUTO_LEAD, orgId: TENANT, name: "P22 auto", stage: "New Lead", status: "Open", substatus: "Student Lead", source: "p22" } });
  await prisma.qcfLead.create({ data: { id: DISPO_LEAD, orgId: TENANT, name: "P22 dispo", stage: "New Lead", status: "Open", source: "p22" } });

  // ─── 1. automation write → attribution ───
  const wf = await prisma.qcfWorkflowDefinition.create({ data: {
    orgId: TENANT, name: "P22 R1-like", status: "Active", triggerType: "trigger_lead_updated",
    graphNodes: [
      { id: "cond", kind: "if_else", config: { conditions: [
        { field: "substatus", op: "in", value: ["Student Lead"] },
        { field: "stage", op: "in", value: ["New Lead"] },
      ] } },
      { id: "act", kind: "update_lead_field", config: { field: "stage", value: "Disqualified" } },
    ],
    graphEdges: [{ from: "cond", to: "act", branch: "true" }],
  } });
  await runFrom(TENANT, wf.id, AUTO_LEAD, "cond");

  const attr = await prisma.qcfAutomationAttribution.findFirst({ where: { orgId: TENANT, leadId: AUTO_LEAD } });
  const snap = (attr?.triggerSnapshot ?? {}) as Record<string, unknown>;
  check("1.attribution-written", !!attr, attr ? "one row written" : "no attribution row");
  check("1.engineSource", attr?.engineSource === "automation", `engineSource=${attr?.engineSource}`);
  check("1.names-automation", attr?.workflowId === wf.id && attr?.nodeId === "act", `workflowId=${attr?.workflowId === wf.id ? "wf" : attr?.workflowId}, nodeId=${attr?.nodeId}`);
  check("1.names-trigger-event", !!attr?.triggerEventId && attr?.triggerType === "trigger_lead_updated", `triggerEventId=${attr?.triggerEventId ? "set" : "MISSING"}, triggerType=${attr?.triggerType}`);
  check("1.before-after", attr?.field === "stage" && attr?.beforeValue === "New Lead" && attr?.afterValue === "Disqualified", `${attr?.field}: ${attr?.beforeValue} -> ${attr?.afterValue}`);
  check("1.trigger-snapshot", snap.stage === "New Lead" && snap.substatus === "Student Lead", `snapshot stage=${String(snap.stage)}, substatus=${String(snap.substatus)} (field-was-X at trigger)`);

  // The one-read "why did this lead get disqualified?" answer:
  out.push(`      WHY(${AUTO_LEAD}): rule ${attr?.workflowId}/${attr?.nodeId} via ${attr?.triggerType} event ${attr?.triggerEventId} set stage ${attr?.beforeValue} -> ${attr?.afterValue}`);

  // ─── 2. legacy-disposition write → attribution, distinguishable ───
  const rule = await prisma.qcfAutomationRule.create({ data: {
    orgId: TENANT, name: "P22 dispo", sortOrder: 1, isActive: true,
    trigger: { type: "activity_logged", activity_type: "call", disposition: "P22PROOF" },
    action: { type: "set_lead_status", status: "Future Lead" },
  } });
  await runAfterActivityLogged({ orgId: TENANT, leadId: DISPO_LEAD, activityId: "p22-act", dispositionCode: "P22PROOF", activityDatetime: new Date(), ownerId: null });

  const dispoAttr = await prisma.qcfAutomationAttribution.findFirst({ where: { orgId: TENANT, leadId: DISPO_LEAD } });
  check("2.disposition-attribution", dispoAttr?.engineSource === "legacy-disposition" && dispoAttr?.ruleId === rule.id && dispoAttr?.field === "status",
    `engineSource=${dispoAttr?.engineSource}, ruleId=${dispoAttr?.ruleId === rule.id ? "set" : dispoAttr?.ruleId}, field=${dispoAttr?.field}`);
  check("2.discriminator-distinguishes", attr?.engineSource !== dispoAttr?.engineSource,
    `automation="${attr?.engineSource}" vs legacy="${dispoAttr?.engineSource}"`);

  // ─── cleanup ───
  await prisma.qcfWorkflowDefinition.deleteMany({ where: { id: wf.id } });
  await prisma.qcfAutomationRule.deleteMany({ where: { id: rule.id } });
  await prisma.qcfAutomationAttribution.deleteMany({ where: { orgId: TENANT, leadId: { in: [AUTO_LEAD, DISPO_LEAD] } } });
  await prisma.qcfAutomationLeadDayCount.deleteMany({ where: { orgId: TENANT, leadId: { in: [AUTO_LEAD, DISPO_LEAD] } } });
  await prisma.qcfActivity.deleteMany({ where: { orgId: TENANT, leadId: { in: [AUTO_LEAD, DISPO_LEAD] } } });
  await prisma.qcfLead.deleteMany({ where: { id: { in: [AUTO_LEAD, DISPO_LEAD] } } });

  console.log("\n" + out.join("\n"));
  console.log(`\n${allOk ? "ALL PASS" : "SOME FAILED"}`);
  await prisma.$disconnect();
  process.exit(allOk ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
