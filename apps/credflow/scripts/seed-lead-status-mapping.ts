/**
 * One-time seed: CrmLeadStatus, CrmLeadSubStatus, CrmLeadStatusSubStatus
 *
 *   npm run seed:lead-statuses
 *   npx tsx scripts/seed-lead-status-mapping.ts
 *
 * Idempotent — safe to run multiple times. Uses a single transaction so
 * the database is never left in a partial state.
 * Requires DATABASE_URL to be set (reads .env.local, then .env).
 */
import { config } from "dotenv";

config({ path: ".env.local" });
config();

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  log: ["error"],
});

// ─── Mapping data ─────────────────────────────────────────────────────────────

const STATUS_MAPPING: Record<string, string[]> = {
  "Disqualified": [
    "Not using Tally/ Busy",
    "Invalid client details ( number/email)",
    "other ( self notes)",
    "Student Lead",
    "Language Barrier",
    "Looking to buy Tally/ Busy",
    "Unable to sync (Oracle user)",
  ],
  "Could Not Connect": [
    "No. Busy",
    "Not reachable",
    "Invalid No.",
    "Switch off",
  ],
  "Discussion Pending (Answered Calls)": [
    "Can't talk right now",
    "Internet Issue",
  ],
  "Demo Scheduled": [
    "For Scheduling Demo",
    "Demo Now",
  ],
  "Not Interested (For Scheduling Demo)": [
    "In Scheduling Demo",
  ],
  "Interested Followup Counselling": [
    "Interested for Demo",
  ],
  "Future Lead": [
    "Unable to sync (Oracle user)",
    "Not required now",
    "Could not connect",
    "Not Interested",
    "Disqualified",
    "Discussion Pending",
  ],
  "Already Paid Customer": [
    "Already paid Customer",
  ],
  "Active Partner": [
    "Active Partner",
  ],
  "Inactive Partner": [
    "Inactive Partner",
  ],
  "Payment Link Sent": [
    "TL to revert",
    "Wait for the Confirmation",
  ],
  "Interested Followup": [
    "Interested Followup",
  ],
  "Not Interested (For Making Payment)": [
    "For Making Payment",
  ],
  "Payment Done": [
    "Razorpay",
    "Cheque",
    "Bank Transfer (NEFT/IMPS)",
    "Cash Deposit",
    "UPI",
  ],
  "Negotiation": [
    "Negotiation",
  ],
  "Demo Completed": [
    "Demo Completed with Demo Data",
    "Demo Completed with Synced Data",
  ],
  "Demo Rescheduled": [
    "Demo Rescheduled",
    "Demo Completed with Demo Data",
    "Demo Completed with Synced Data",
  ],
  "Call Back (Demo Scheduled)": [
    "Call Back (Demo Scheduled)",
    "Demo Completed with Demo Data",
    "Demo Completed with Synced Data",
  ],
  "Not Interested (For Demo Done)": [
    "For Demo Done",
  ],
  "Unable to sync (Oracle user)": [
    "Unable to sync (Oracle user)",
  ],
  "Payment Verified": [
    "Payment Verified",
  ],
  "Payment Not Verified": [
    "Payment Not Verified",
  ],
  "Plan Activation Done": [
    "Plan Activation Done",
  ],
  "Plan Activation Failed": [
    "Plan Activation Failed",
    "Renewal Payment Activation Delayed",
  ],
  "Paid Customer Demo Done": [
    "Paid Customer Demo Done",
  ],
  "Paid Customer Demo Failed": [
    "Paid Customer Demo Failed",
  ],
  "Paid Customer Demo to be Done": [
    "Paid Customer Demo to be Done",
  ],
  "Onboarding Done": [
    "Onboarding Done",
  ],
  "Upgrade Due": [
    "Upgrade Due",
    "Upgrade Not Due",
  ],
  "Not Interested": [
    "Went to Competitor",
    "Syncing Issue",
    "Not using Tally Busy",
    "Pricing Issue",
    "Support Issue",
  ],
  "Renewal Done": [
    "Razorpay- Renewal",
    "Cheque-Renewal",
    "Bank Transfer (NEFT/IMPS)-Renewal",
    "Cash Deposit-Renewal",
    "UPI-Renewal",
  ],
  "Syncing Issue": [
    "Unable to sync (Oracle user)",
  ],
};

// ─── Counters ─────────────────────────────────────────────────────────────────

const counts = {
  statuses:    { created: 0, skipped: 0 },
  subStatuses: { created: 0, skipped: 0 },
  mappings:    { created: 0, skipped: 0 },
};

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("🌱  Seeding lead status mappings…\n");

  // Collect every unique sub-status name so we can upsert them all first,
  // avoiding repeated round-trips inside the mapping loop.
  const allSubStatusNames = Array.from(
    new Set(Object.values(STATUS_MAPPING).flat()),
  );

  await prisma.$transaction(async (tx) => {

    // ── 1. Upsert all sub-statuses ──────────────────────────────────────────
    console.log("  [1/3] Upserting sub-statuses…");
    const subStatusIdMap = new Map<string, string>();

    for (const name of allSubStatusNames) {
      const existing = await tx.crmLeadSubStatus.findUnique({ where: { name } });
      if (existing) {
        subStatusIdMap.set(name, existing.id);
        counts.subStatuses.skipped++;
        console.log(`         ⏭  sub-status skipped :  ${name}`);
      } else {
        const created = await tx.crmLeadSubStatus.create({ data: { name } });
        subStatusIdMap.set(name, created.id);
        counts.subStatuses.created++;
        console.log(`         ✅ sub-status created :  ${name}`);
      }
    }

    // ── 2. Upsert statuses + mappings ───────────────────────────────────────
    console.log("\n  [2/3] Upserting statuses and mappings…");
    for (const [statusName, subStatusNames] of Object.entries(STATUS_MAPPING)) {
      // Find or create status
      const existingStatus = await tx.crmLeadStatus.findUnique({ where: { name: statusName } });
      let statusId: string;
      if (existingStatus) {
        statusId = existingStatus.id;
        counts.statuses.skipped++;
        console.log(`\n         ⏭  status skipped  :  ${statusName}`);
      } else {
        const created = await tx.crmLeadStatus.create({ data: { name: statusName } });
        statusId = created.id;
        counts.statuses.created++;
        console.log(`\n         ✅ status created  :  ${statusName}`);
      }

      // Create mappings
      for (const subName of subStatusNames) {
        const subStatusId = subStatusIdMap.get(subName)!;
        const existingMapping = await tx.crmLeadStatusSubStatus.findUnique({
          where: {
            leadStatusId_leadSubStatusId: {
              leadStatusId: statusId,
              leadSubStatusId: subStatusId,
            },
          },
        });

        if (existingMapping) {
          counts.mappings.skipped++;
          console.log(`             ⏭  mapping skipped  :  "${statusName}" → "${subName}"`);
        } else {
          await tx.crmLeadStatusSubStatus.create({
            data: { leadStatusId: statusId, leadSubStatusId: subStatusId },
          });
          counts.mappings.created++;
          console.log(`             ✅ mapping created  :  "${statusName}" → "${subName}"`);
        }
      }
    }

  }, {
    // Raise the timeout for large datasets
    timeout: 30_000,
  });

  // ── 3. Summary ──────────────────────────────────────────────────────────────
  console.log("\n" + "─".repeat(55));
  console.log("📊  Seed complete\n");
  console.log(`  Lead Statuses     created: ${counts.statuses.created}   skipped: ${counts.statuses.skipped}`);
  console.log(`  Lead Sub-Statuses created: ${counts.subStatuses.created}   skipped: ${counts.subStatuses.skipped}`);
  console.log(`  Mappings          created: ${counts.mappings.created}   skipped: ${counts.mappings.skipped}`);
  console.log("─".repeat(55));
}

main()
  .catch((err: unknown) => {
    console.error("❌  Seed failed:", err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
