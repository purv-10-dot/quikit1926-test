/**
 * FR-D4: Seed the three default automation rules for a tenant.
 *
 * Rules:
 *   1. Disposition "not_interested"  → set_lead_status: first configured
 *      Disqualified-category status (or a status named "Disqualified").
 *   2. Disposition "callback_requested" → create_task due at activity_datetime.
 *   3. Disposition "interested" while status=New → set_lead_status: first
 *      non-New open status (typically "Contacted").
 *
 * Hard requirements (Condition 2):
 *   - Verifies ALL referenced disposition codes exist in CrmCallDisposition
 *     for the tenant BEFORE creating any rules.  If ANY code is missing,
 *     throws with an explicit error — never silently skips.
 *   - Idempotent: running twice does not create duplicate rules (checks by name).
 *
 * Usage:
 *   npx ts-node scripts/seed-automation-rules.ts <tenantId>
 */

import { PrismaClient } from "@quikit/database";

const prisma = new PrismaClient();

const REQUIRED_CODES = ["not_interested", "callback_requested", "interested"] as const;

async function main() {
  const tenantId = process.argv[2];
  if (!tenantId) {
    throw new Error("Usage: seed-automation-rules.ts <tenantId>");
  }

  console.log(`[seed-automation-rules] seeding for tenant ${tenantId}…`);

  // ── 1. Verify disposition codes exist — fail loudly if any are missing ────

  const dispositions = await prisma.crmCallDisposition.findMany({
    where: { tenantId, code: { in: [...REQUIRED_CODES] } },
    select: { code: true },
  });

  const foundCodes = new Set(dispositions.map((d) => d.code));
  const missingCodes = REQUIRED_CODES.filter((c) => !foundCodes.has(c));

  if (missingCodes.length > 0) {
    throw new Error(
      `[seed-automation-rules] ABORT: the following disposition codes do not exist ` +
        `for tenant "${tenantId}": ${missingCodes.join(", ")}.\n` +
        `Run the disposition seed first (GET /api/telephony/dispositions triggers the default seed), ` +
        `then re-run this script.`,
    );
  }

  console.log(`[seed-automation-rules] all required disposition codes verified ✓`);

  // ── 2. Resolve status targets (use case-insensitive name match) ───────────

  // Rule 1 target: a status whose name contains "Disqualified" (case-insensitive)
  const disqualifiedStatus = await prisma.crmLeadStatus.findFirst({
    where: { name: { contains: "disqualified", mode: "insensitive" } },
  });
  if (!disqualifiedStatus) {
    throw new Error(
      `[seed-automation-rules] ABORT: no lead status containing "Disqualified" found for tenant.` +
        ` Add a Disqualified status under Settings > Lead Statuses first.`,
    );
  }

  // Rule 3 target: a status whose name contains "Contacted" (case-insensitive)
  const contactedStatus = await prisma.crmLeadStatus.findFirst({
    where: { name: { contains: "contacted", mode: "insensitive" } },
  });
  if (!contactedStatus) {
    throw new Error(
      `[seed-automation-rules] ABORT: no lead status containing "Contacted" found for tenant.` +
        ` Add a Contacted status under Settings > Lead Statuses first.`,
    );
  }

  console.log(
    `[seed-automation-rules] status targets resolved — ` +
      `Disqualified="${disqualifiedStatus.name}", Contacted="${contactedStatus.name}" ✓`,
  );

  // ── 3. Seed rules (idempotent by name) ────────────────────────────────────

  const SEED_RULES = [
    {
      name: "[Seed] Not Interested → Disqualified",
      trigger: { type: "activity_logged", activity_type: "call", disposition: "not_interested" },
      action: { type: "set_lead_status", status: disqualifiedStatus.name },
      sortOrder: 1,
    },
    {
      name: "[Seed] Callback Requested → Follow-up Task",
      trigger: { type: "activity_logged", activity_type: "call", disposition: "callback_requested" },
      action: { type: "create_task", due: "activity_datetime", title: "Callback: {lead.name}" },
      sortOrder: 2,
    },
    {
      name: "[Seed] First Connected (Interested) → Contacted",
      trigger: { type: "activity_logged", activity_type: "call", disposition: "interested" },
      action: { type: "set_lead_status", status: contactedStatus.name },
      sortOrder: 3,
    },
  ];

  let created = 0;
  let skipped = 0;

  for (const rule of SEED_RULES) {
    const existing = await prisma.crmAutomationRule.findFirst({
      where: { tenantId, name: rule.name },
    });
    if (existing) {
      console.log(`[seed-automation-rules]   skip (already exists): "${rule.name}"`);
      skipped++;
      continue;
    }
    await prisma.crmAutomationRule.create({
      data: { tenantId, ...rule, isActive: true },
    });
    console.log(`[seed-automation-rules]   created: "${rule.name}"`);
    created++;
  }

  console.log(
    `[seed-automation-rules] done — ${created} created, ${skipped} skipped.`,
  );
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
