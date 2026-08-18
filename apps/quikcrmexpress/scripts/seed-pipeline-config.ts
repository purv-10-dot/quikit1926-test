/**
 * Step B — seed CrmExpress's leadPipelineConfig (stages + dependent rules) into
 * CrmOrgWorkspaceSettings for ONE org. Faithful-parity copy of the UAT live config.
 *
 *   $env:DATABASE_URL="...quikit_rohit_db"; npx tsx scripts/seed-pipeline-config.ts <orgId>
 *
 * Idempotent (setPipelineConfig merges). statuses/substatuses intentionally NOT
 * written here — they come from the seeded Qce status tables (Step A).
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config();

const ORG_ID = process.env.SEED_ORG_ID ?? process.argv[2];
if (!ORG_ID) {
  console.error("❌  orgId required. Usage: npx tsx scripts/seed-pipeline-config.ts <orgId>");
  process.exit(1);
}

const STAGES: string[] = [
  "Qualified","Proposal","Negotiation","Closed","New Lead","Not Connected",
  "Interested-FollowUp","Demo Scheduled","Demo Completed Demo Data",
  "Demo Completed-demo Syncing","Payment Done","Customers","Discussion Pending",
  "Payment Not Done","Not Connected(New Lead)","Not Connected(Discussion Pending)",
  "Not Connected(Demo Scheduled)","Not Connected(Interested Followup)",
  "Not Connected(Payment Link sent)","Interested Followup Counselling",
  "Payment Varified","Payment Varification Failed","Pending for Activation",
  "Activation Done","Onboarding Done","Upgrade Done","Renewal Done",
  "Additional Payment Done","Referral Done","Deviation","Last Sync within 15 days",
  "Paid Customer Demo Done","Paid Customer Demo failed","Paid Customer Demo to be Done",
  "Renewal Due","Upgrade Due","Restocking Done","Active Partner","Payment Link Sent",
  "Disqualified","Invalid","Not Interested","Future Lead","Inactive Partner",
  "first","stage test 1",
];

const SOURCE_TO_STAGES: Record<string, string[]> = {
  "client1": ["Qualified","Proposal","Negotiation","Closed","New Lead"],
  "Afirst source": ["Qualified","Proposal","Negotiation","Closed","New Lead","Not Connected","stage test 1"],
  "Already paid client": ["New","Qualified","Proposal","Negotiation","Closed","New Lead","Not Connected","Interested-FollowUp","Demo Scheduled","Demo Completed Demo Data","Payment Done","Demo Completed-demo Syncing","Customers","Discussion Pending","Payment Not Done","Not Connected(New Lead)","Not Connected(Discussion Pending)","Not Connected(Demo Scheduled)","Upgrade Done","Onboarding Done","Activation Done","Pending for Activation","Payment Varification Failed","Payment Varified","Not Connected(Payment Link sent)","Interested Followup Counselling","Not Connected(Interested Followup)"],
};

const STAGE_TO_STATUSES: Record<string, string[]> = {
  "first": ["start","reopen"],
  "Qualified": ["Active Partner","Already Paid Customer"],
  "stage test 1": ["now","open","Active Partner","Already Paid Customer","Call Back (Demo Scheduled)","Could Not Connect"],
};

const STATUS_TO_SUBSTATUSES: Record<string, string[]> = {
  "Future Lead": ["Unable to sync (Oracle user)","Not required now","Could not connect","Not Interested","Disqualified","Discussion Pending"],
  "Negotiation": ["Negotiation"],
  "Upgrade Due": ["Upgrade Due","Upgrade Not Due"],
  "Disqualified": ["Not using Tally/ Busy","Invalid client details ( number/email)","other ( self notes)","Student Lead","Language Barrier","Looking to buy Tally/ Busy","Unable to sync (Oracle user)"],
  "Payment Done": ["Razorpay","Cheque","Bank Transfer (NEFT/IMPS)","Cash Deposit","UPI"],
  "Renewal Done": ["Razorpay- Renewal","Cheque-Renewal","Bank Transfer (NEFT/IMPS)-Renewal","Cash Deposit-Renewal","UPI-Renewal"],
  "Syncing Issue": ["Unable to sync (Oracle user)","Invalid No."],
  "Active Partner": ["Active Partner","active & done","Already paid Customer"],
  "Demo Completed": ["Demo Completed with Demo Data","Demo Completed with Synced Data"],
  "Demo Scheduled": ["For Scheduling Demo","Demo Now"],
  "Not Interested": ["Went to Competitor","Syncing Issue","Not using Tally Busy","Pricing Issue","Support Issue"],
  "Onboarding Done": ["Onboarding Done"],
  "Demo Rescheduled": ["Demo Rescheduled","Demo Completed with Demo Data","Demo Completed with Synced Data"],
  "Inactive Partner": ["Inactive Partner"],
  "Payment Verified": ["Payment Verified"],
  "Could Not Connect": ["No. Busy","Not reachable","Switch off","Invalid No."],
  "Payment Link Sent": ["TL to revert","Wait for the Confirmation"],
  "Interested Followup": ["Interested Followup"],
  "Payment Not Verified": ["Payment Not Verified"],
  "Plan Activation Done": ["Plan Activation Done"],
  "Already Paid Customer": ["Already paid Customer","Active Partner","active & done"],
  "Plan Activation Failed": ["Plan Activation Failed","Renewal Payment Activation Delayed"],
  "Paid Customer Demo Done": ["Paid Customer Demo Done"],
  "Paid Customer Demo Failed": ["Paid Customer Demo Failed"],
  "Call Back (Demo Scheduled)": ["Call Back (Demo Scheduled)","Demo Completed with Demo Data","Demo Completed with Synced Data","Active Partner","active & done"],
  "Unable to sync (Oracle user)": ["Unable to sync (Oracle user)"],
  "Paid Customer Demo to be Done": ["Paid Customer Demo to be Done"],
  "Not Interested (For Demo Done)": ["For Demo Done"],
  "Interested Followup Counselling": ["Interested for Demo"],
  "Discussion Pending (Answered Calls)": ["Can't talk right now","Internet Issue"],
  "Not Interested (For Making Payment)": ["For Making Payment"],
  "Not Interested (For Scheduling Demo)": ["In Scheduling Demo"],
};

async function main() {
  const { getPipelineConfig, setPipelineConfig } = await import(
    "../lib/services/workspace/pipeline-config"
  );

  console.log(`🌱  Seeding leadPipelineConfig for org: ${ORG_ID}\n`);
  const before = await getPipelineConfig(ORG_ID);
  console.log(`  before → stages=${before.stages.length} statuses=${before.statuses.length} substatuses=${before.substatuses.length} stageToStatuses=${Object.keys(before.dependentRules.stageToStatuses ?? {}).length}`);

  await setPipelineConfig(ORG_ID, {
    stages: STAGES,
    dependentRules: {
      sourceToStages: SOURCE_TO_STAGES,
      stageToStatuses: STAGE_TO_STATUSES,
      statusToSubstatuses: STATUS_TO_SUBSTATUSES,
    },
  });

  const after = await getPipelineConfig(ORG_ID);
  console.log(`  after  → stages=${after.stages.length} statuses=${after.statuses.length} substatuses=${after.substatuses.length} stageToStatuses=${Object.keys(after.dependentRules.stageToStatuses ?? {}).length} sourceToStages=${Object.keys(after.dependentRules.sourceToStages ?? {}).length}`);
  console.log("\n✅  Done. Restart the app to pick it up.");
}

main()
  .catch((e: unknown) => { console.error("❌  failed:", e instanceof Error ? e.message : e); process.exit(1); })
  .finally(() => process.exit(0));