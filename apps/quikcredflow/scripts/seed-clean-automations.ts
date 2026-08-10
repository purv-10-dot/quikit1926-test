/**
 * Seed: the 7 "truly clean" CredFlow automations (R1, R3, R9, R17, R18, R19, R21).
 *
 *   npx tsx --env-file=.env.local scripts/seed-clean-automations.ts <orgId>
 *   SEED_TENANT_ID=xxx npx tsx --env-file=.env.local scripts/seed-clean-automations.ts
 *
 * WHAT THIS IS
 *   Creates 7 QcfWorkflowDefinition rows whose graph shape is BYTE-IDENTICAL to
 *   the UI-built "TEST R19 negotiation" rule proven to execute end-to-end:
 *   trigger_lead_updated -> if_else {AND, conditions:[{op:in,field,value:[...]}]}
 *   -> update_lead_field {field:"stage", value:X}; edge branch:"true".
 *
 * WHY ONLY THESE 7 (the "clean subset")
 *   Rules with (a) no logical ambiguity/conflict (R4/R5 conflict, R6/R7/R10/R13
 *   semantic ⚠️, R14 truncated name, R16 multi-decompose all EXCLUDED) and (b)
 *   every condition/target string reconciled to an EXACT match in the tenant's
 *   leadPipelineConfig (verified 2026-07-23). Strings below are the config-exact
 *   spellings, NOT the raw Automation.txt strings.
 *
 * RECONCILIATIONS applied (source -> config-exact):
 *   "Interested -Follow Up"              -> "Interested-FollowUp"
 *   "Customer"                           -> "Customers"
 *   "Demo Completed-demo data"           -> "Demo Completed Demo Data"
 *   "Not Connected (Discussion pending)" -> "Not Connected (Discussion Pending)"
 * DROPPED (no config equivalent): R3 "Qualified with Tally", "Qualified with Busy".
 *
 * SAFETY
 *   - Idempotent: skips a rule whose name already exists for the tenant.
 *   - status defaults to "Active" (published). Pass SEED_DRAFT=1 for Draft.
 *   - Tenant-scoped. Requires DATABASE_URL (from --env-file=.env.local).
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { randomUUID } from "crypto";

const TENANT_ID = process.env.SEED_TENANT_ID ?? process.argv[2];
const CREATE_AS_DRAFT = process.env.SEED_DRAFT === "1";

if (!TENANT_ID) {
  console.error("Tenant ID required.");
  console.error("  npx tsx --env-file=.env.local scripts/seed-clean-automations.ts <tenantId>");
  process.exit(1);
}

type Cond = { op: "in"; field: "substatus" | "stage" | "status"; value: string[] };

interface RuleSpec {
  name: string;
  conditions: Cond[]; // ANDed
  targetStage: string;
}

function nodeId(kind: string): string {
  return `${kind}-${Math.random().toString(36).slice(2, 10)}-${Math.random().toString(36).slice(2, 6)}`;
}

function buildGraph(spec: RuleSpec) {
  const trig = { id: nodeId("trigger_lead_updated"), kind: "trigger_lead_updated", config: {} };
  const iff = {
    id: nodeId("if_else"),
    kind: "if_else",
    config: { connector: "AND", conditions: spec.conditions },
  };
  const act = {
    id: nodeId("update_lead_field"),
    kind: "update_lead_field",
    config: { field: "stage", value: spec.targetStage },
  };
  const graphNodes = [trig, iff, act];
  const graphEdges = [
    { to: iff.id, from: trig.id },
    { to: act.id, from: iff.id, branch: "true" },
  ];
  return { graphNodes, graphEdges };
}

const SUB = "substatus" as const;
const STG = "stage" as const;
const STA = "status" as const;

const R1_STAGES = [
  "New Lead", "Not Connected", "Interested-FollowUp", "Demo Scheduled",
  "Demo Completed Demo Data", "Demo Completed-demo Syncing", "Payment Done",
  "Customers", "Discussion Pending", "Negotiation", "Not Connected (New Lead)",
  "Not Connected (Discussion Pending)", "Not Connected (Demo Scheduled)",
  "Interested Followup Counselling", "Future Lead",
];
const R3_STAGES = [
  "New Lead", "Not Connected", "Interested-FollowUp", "Payment Done",
  "Discussion Pending", "Negotiation", "Not Connected (New Lead)",
  "Interested Followup Counselling", "Disqualified", "Not Interested", "Future Lead",
];
const R9_STAGES = [
  "Interested-FollowUp", "Demo Scheduled", "Payment Done", "Negotiation",
  "Not Connected (Demo Scheduled)", "Interested Followup Counselling", "Future Lead",
];

const RULES: RuleSpec[] = [
  {
    name: "R1 — Disqualify (dead-end substatuses)",
    conditions: [
      { op: "in", field: SUB, value: [
        "Not using Tally/ Busy", "Invalid client details ( number/email)",
        "other ( self notes)", "Student Lead", "Language Barrier",
        "Looking to buy Tally/ Busy", "Unable to sync (Oracle user)",
      ] },
      { op: "in", field: STG, value: R1_STAGES },
    ],
    targetStage: "Disqualified",
  },
  {
    name: "R3 — Discussion Pending (answered, needs follow-up)",
    conditions: [
      { op: "in", field: SUB, value: [
        "Can't talk right now", "Internet Issue", "other ( self notes)",
      ] },
      { op: "in", field: STG, value: R3_STAGES },
    ],
    targetStage: "Discussion Pending",
  },
  {
    name: "R9 — Demo Completed (synced data)",
    conditions: [
      { op: "in", field: SUB, value: ["Demo Completed with Synced Data"] },
      { op: "in", field: STG, value: R9_STAGES },
    ],
    targetStage: "Demo Completed-demo Syncing",
  },
  {
    name: "R17 — Interested Followup Counselling",
    conditions: [
      { op: "in", field: STA, value: ["Interested Followup Counselling"] },
    ],
    targetStage: "Interested Followup Counselling",
  },
  {
    name: "R18 — Payment Done (payment method chosen)",
    conditions: [
      { op: "in", field: SUB, value: [
        "Razorpay", "Cheque", "Bank Transfer (NEFT/IMPS)", "Cash Deposit", "UPI",
      ] },
    ],
    targetStage: "Payment Done",
  },
  {
    name: "R19 — Negotiation",
    conditions: [
      { op: "in", field: SUB, value: ["Negotiation"] },
    ],
    targetStage: "Negotiation",
  },
  {
    name: "R21 — Future Lead (not required now)",
    conditions: [
      { op: "in", field: SUB, value: ["Not required now"] },
    ],
    targetStage: "Future Lead",
  },
];

async function main() {
  const { prisma } = await import("../lib/db/prisma");
  const status = CREATE_AS_DRAFT ? "Draft" : "Active";

  console.log(`Seeding ${RULES.length} clean automations for tenant ${TENANT_ID}`);
  console.log(`  status = ${status}${CREATE_AS_DRAFT ? "" : "  (PUBLISHED - fires on matching lead updates)"}\n`);

  let created = 0;
  let skipped = 0;

  for (const spec of RULES) {
    const existing = await prisma.qcfWorkflowDefinition.findFirst({
      where: { orgId: TENANT_ID, name: spec.name, deletedAt: null },
      select: { id: true },
    });
    if (existing) {
      console.log(`  skip (exists): ${spec.name}`);
      skipped++;
      continue;
    }

    const { graphNodes, graphEdges } = buildGraph(spec);
    const now = new Date();
    await prisma.qcfWorkflowDefinition.create({
      data: {
        id: randomUUID(),
        orgId: TENANT_ID,
        name: spec.name,
        status: status as never,
        triggerType: "trigger_lead_updated",
        triggerSummary:
          spec.conditions.map((c) => `${c.field} in [${c.value.length}]`).join(" AND ") +
          ` -> stage=${spec.targetStage}`,
        scope: null,
        triggerCount: 0,
        graphNodes: graphNodes as never,
        graphEdges: graphEdges as never,
        lastPublishedOn: CREATE_AS_DRAFT ? null : now,
        createdAt: now,
        updatedAt: now,
      },
    });
    console.log(`  created [${status}]: ${spec.name}  -> stage="${spec.targetStage}"`);
    created++;
  }

  console.log("\n" + "-".repeat(60));
  console.log(`Done. created=${created}  skipped=${skipped}  total=${RULES.length}`);
  console.log("-".repeat(60));
  console.log("\nVerify:");
  console.log(`  SELECT name, status, "triggerType", "triggerCount"`);
  console.log(`  FROM app_quikcrm."CrmWorkflowDefinition"`);
  console.log(`  WHERE "orgId"='${TENANT_ID}' AND name LIKE 'R%' ORDER BY name;`);
  console.log("\nRun the worker (SAFE mode) to fire them: npm run worker:test");

  await prisma.$disconnect();
}

main().catch((err: unknown) => {
  console.error("Seed failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
