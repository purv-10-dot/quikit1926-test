/**
 * Seed: Stage → Status mapping into leadPipelineConfig.
 *
 *   npm run seed:stage-status -- <orgId>
 *   SEED_TENANT_ID=xxx npx tsx scripts/seed-stage-status-mapping.ts
 *
 * Idempotent — merges into existing config, never deletes existing entries.
 * Requires DATABASE_URL (reads .env.local, then .env).
 */
import { config } from "dotenv";

config({ path: ".env.local" });
config();

// ─── Tenant ID ────────────────────────────────────────────────────────────────

const TENANT_ID = process.env.SEED_TENANT_ID ?? process.argv[2];

if (!TENANT_ID) {
  console.error("❌  Tenant ID required.");
  console.error("    Usage: npm run seed:stage-status -- <tenantId>");
  console.error("    Or:    SEED_TENANT_ID=xxx npx tsx scripts/seed-stage-status-mapping.ts");
  process.exit(1);
}

// ─── Stage → Status mapping ───────────────────────────────────────────────────

const COMMON_TAIL = [
  "Already paid Customer",
  "Paid CX Service Request",
  "Active Partner",
  "Inactive Partner",
  "Last Sync more than 15 days",
  "Last Sync within 15 days",
];

const STAGE_STATUS_MAPPING: Record<string, string[]> = {

  // ── Column 1 ──────────────────────────────────────────────────────────────

  "Interested-FollowUp": [
    "Could Not Connect",
    "Payment Link Sent",
    "Interested Followup",
    "Not Interested (For making Payment)",
    "Future Lead",
    "Payment Done",
    "Negotiation",
    ...COMMON_TAIL,
  ],

  "Demo Scheduled": [
    "Could Not Connect",
    "Demo Completed",
    "Demo Rescheduled",
    "Call Back (Demo Scheduled)",
    "Not Interested (For Demo Done)",
    "Future Lead",
    ...COMMON_TAIL,
  ],

  "Demo Completed Demo Data": [
    "Unable to sync (Oracle user)",
    "Could Not Connect",
    "Payment Link Sent",
    "Interested Followup",
    "Not Interested (For making Payment)",
    "Future Lead",
    "Payment Done",
    "Negotiation",
    ...COMMON_TAIL,
  ],

  "Demo Completed-demo Syncing": [
    "Could Not Connect",
    "Payment Link Sent",
    "Interested Followup",
    "Not Interested (For making Payment)",
    "Future Lead",
    "Payment Done",
    "Negotiation",
    ...COMMON_TAIL,
  ],

  "Payment Done": [
    "Payment Verified",
    "Payment Not Verified",
    ...COMMON_TAIL,
  ],

  "Customers": [
    "Payment Verified",
    "Payment Not Verified",
    ...COMMON_TAIL,
  ],

  "Discussion Pending": [
    "Disqualified",
    "Could Not Connect",
    "Discussion Pending (Answered Calls)",
    "Demo Scheduled",
    "Interested Followup Counselling",
    "Not Interested (For scheduling Demo)",
    "Future Lead",
    ...COMMON_TAIL,
  ],

  "Negotiation": [
    "Could Not Connect",
    "Payment Link Sent",
    "Not Interested (For making Payment)",
    "Future Lead",
    "Payment Done",
    "Negotiation",
    ...COMMON_TAIL,
  ],

  "Payment Not Done": [
    "Not Interested (For making Payment)",
    ...COMMON_TAIL,
  ],

  "Not Connected(New Lead)": [
    "Disqualified",
    "Could Not Connect",
    "Discussion Pending (Answered Calls)",
    "Demo Scheduled",
    "Not Interested (For scheduling Demo)",
    "Interested Followup Counselling",
    "Future Lead",
    ...COMMON_TAIL,
  ],

  "Not Connected(Discussion Pending)": [
    "Disqualified",
    "Could Not Connect",
    "Discussion Pending (Answered Calls)",
    "Demo Scheduled",
    "Not Interested (For scheduling Demo)",
    "Interested Followup Counselling",
    "Future Lead",
    ...COMMON_TAIL,
  ],

  "Not Connected(Demo Scheduled)": [
    "Unable to sync (Oracle user)",
    "Could Not Connect",
    "Demo Completed",
    "Not Interested (For Demo Done)",
    "Call Back (Demo Scheduled)",
    "Demo Rescheduled",
    "Future Lead",
    ...COMMON_TAIL,
  ],

  // ── Column 2 ──────────────────────────────────────────────────────────────

  "Not Connected (Interested Followup)": [
    "Could Not Connect",
    "Payment Link Sent",
    "Interested Followup",
    "Not Interested (For making Payment)",
    "Future Lead",
    "Payment Done",
    "Negotiation",
    ...COMMON_TAIL,
  ],

  "Not Connected (Payment Link sent)": [
    "Could Not Connect",
    "Payment Link Sent",
    "Interested Followup",
    "Not Interested (For making Payment)",
    "Future Lead",
    "Payment Done",
    "Negotiation",
    ...COMMON_TAIL,
  ],

  "Interested Followup Counselling": [
    "Disqualified",
    "Could Not Connect",
    "Discussion Pending (Answered Calls)",
    "Demo Scheduled",
    "Not Interested (For scheduling Demo)",
    "Interested Followup Counselling",
    "Future Lead",
    ...COMMON_TAIL,
  ],

  "Payment Varified": [
    "Plan Activation Done",
    "Plan Activation Failed",
    ...COMMON_TAIL,
  ],

  "Payment Varification Failed": [
    "Payment Verified",
    "Payment Not Verified",
    ...COMMON_TAIL,
  ],

  "Pending for Activation": [
    "Plan Activation Done",
    ...COMMON_TAIL,
  ],

  "Activation Done": [
    "Paid Customer Demo Done",
    "Paid Customer Demo Failed",
    "Paid Customer Demo to be done",
    ...COMMON_TAIL,
  ],

  "Onboarding Done": [
    ...COMMON_TAIL,
  ],

  "Upgrade Done": [
    "Payment Verified",
    "Payment Not Verified",
    ...COMMON_TAIL,
  ],

  "Renewal Done": [
    "Payment Verified",
    "Payment Not Verified",
    ...COMMON_TAIL,
  ],

  "Additional Payment Done": [
    "Payment Verified",
    "Payment Not Verified",
    ...COMMON_TAIL,
  ],

  "Referral Done": [
    "Payment Verified",
    "Payment Not Verified",
    ...COMMON_TAIL,
  ],

  "Deviation": [
    "PD required",
    "Done by Riya || Pending on Kunal",
    "UW rejected",
    "Amount sanctioned",
    ...COMMON_TAIL,
  ],

  "Onboarding": [
    "Document verified",
    "Document not-verified",
    ...COMMON_TAIL,
  ],

  "Paid Customer Demo Done": [
    "Onboarding Done",
    ...COMMON_TAIL,
  ],

  "Paid Customer Demo failed": [
    "Paid Customer Demo Done",
    ...COMMON_TAIL,
  ],

  "Paid Customer Demo to be Done": [
    "Paid Customer Demo Done",
    "Paid Customer Demo Failed",
    "Onboarding Done",
    ...COMMON_TAIL,
  ],

  "Renewal Due": [
    "Could Not connect",
    "Not Using Tally Busy",
    "Not satisfied with the services",
    "Language Barrier",
    "Discussion Pending",
    "Demo Scheduled",
    "Not Interested",
    "Interested follow up",
    "Renewal Done",
    "Upgrade Done",
    "Renewal Due",
    "Renewal Not Due",
    "Interested Proper Syncing",
    "Syncing Issue",
    "Pricing Issue",
    "Support Issue",
    "Channel - Unapproved Partner Lead",
    "Unable to sync (Oracle user)",
    "Demo Done (Renewal)",
    ...COMMON_TAIL,
  ],

  // ── Column 3 ──────────────────────────────────────────────────────────────

  "Upgrade Due": [
    "Disqualified",
    "Could Not connect",
    "Not Using Tally Busy",
    "Not satisfied with the services",
    "Language Barrier",
    "Discussion Pending",
    "Demo Scheduled",
    "Not Interested",
    "Interested follow up",
    "Future lead",
    "Renewal Done",
    "Upgrade done",
    "Upgrade Due",
    ...COMMON_TAIL,
  ],

  "Restocking Done": [
    ...COMMON_TAIL,
  ],

  "Active Partner": [
    ...COMMON_TAIL,
  ],

  "Payment Link Sent": [
    "Could Not Connect",
    "Not Interested (For making Payment)",
    "Payment Done",
    "Future Lead",
    ...COMMON_TAIL,
  ],

  "Disqualified": [
    "Rechurned Disqualified",
    "Qualified Lead",
    "Demo Scheduled",
    ...COMMON_TAIL,
  ],

  "Not Interested": [
    "Discussion Pending (Answered Calls)",
    "Demo Scheduled",
    "Payment Done",
    ...COMMON_TAIL,
  ],

  "Future Lead": [
    "Qualified Lead",
    "Demo Scheduled",
    "Future Lead",
    "Interested Followup Counselling",
    "Disqualified",
    "Not Interested",
    ...COMMON_TAIL,
  ],

  "Inactive Partner": [
    ...COMMON_TAIL,
  ],

  "Invalid": [
    ...COMMON_TAIL,
  ],
};

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const { getPipelineConfig, setPipelineConfig } = await import(
    "../lib/services/workspace/pipeline-config"
  );

  console.log(`🌱  Seeding stage→status mapping for tenant: ${TENANT_ID}\n`);

  const current = await getPipelineConfig(TENANT_ID);

  // All unique statuses collected from the mapping
  const allNewStatuses = [
    ...new Set(Object.values(STAGE_STATUS_MAPPING).flat()),
  ];

  // Merge stages (keep existing + add new)
  const mergedStages = [
    ...new Set([...current.stages, ...Object.keys(STAGE_STATUS_MAPPING)]),
  ];

  // Merge statuses (keep existing + add new)
  const mergedStatuses = [
    ...new Set([...current.statuses, ...allNewStatuses]),
  ];

  // Merge stageToStatuses (our entries win for the stages we're setting;
  // stages not in our mapping remain untouched)
  const mergedStageToStatuses: Record<string, string[]> = {
    ...(current.dependentRules.stageToStatuses ?? {}),
    ...STAGE_STATUS_MAPPING,
  };

  await setPipelineConfig(TENANT_ID, {
    stages:   mergedStages,
    statuses: mergedStatuses,
    dependentRules: {
      ...current.dependentRules,
      stageToStatuses: mergedStageToStatuses,
    },
  });

  // ── Summary ──────────────────────────────────────────────────────────────

  const prevStages    = new Set(current.stages);
  const prevStatuses  = new Set(current.statuses);
  const newStageCount = Object.keys(STAGE_STATUS_MAPPING).filter((s) => !prevStages.has(s)).length;
  const updatedStageCount = Object.keys(STAGE_STATUS_MAPPING).filter((s) => prevStages.has(s)).length;
  const newStatusCount = allNewStatuses.filter((s) => !prevStatuses.has(s)).length;

  console.log("─".repeat(60));
  console.log("📊  Seed complete\n");
  console.log(`  Stages:        total=${mergedStages.length}   new=${newStageCount}   updated=${updatedStageCount}`);
  console.log(`  Statuses:      total=${mergedStatuses.length}   new=${newStatusCount}`);
  console.log(`  stageToStatuses mappings: ${Object.keys(mergedStageToStatuses).length} stages`);
  console.log("─".repeat(60));
  console.log("\n✅  Done. Restart the server for changes to take effect.");
}

main().catch((err: unknown) => {
  console.error("❌  Seed failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
