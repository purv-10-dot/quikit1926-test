/**
 * TEMP manual test: inbound UPDATE on an EXISTING lead.
 *
 * Run:
 *   npx tsx --env-file=.env.local scripts/tmp-inbound-himanshu-test.mjs
 *
 * Looks up himanshu.mishra.april1996@gmail.com's real ProspectID from the
 * QceLeadSquaredSyncMap, then POSTs a "Lead Modified" { Before, After } webhook
 * that CHANGES stage + status (New Lead/Open -> Demo Scheduled/Demo Scheduled).
 *
 * Redis is enabled, so the webhook ENQUEUES; the worker applies the write. We
 * print the HTTP response, then poll the QceLead to see whether stage/status
 * actually changed. If they DON'T change -> the inbound-update-dropped bug.
 *
 * Requires: dev server (3017) + BullMQ worker + Redis up.
 */
const _prismaMod = await import("../lib/db/prisma");
const { prisma } = _prismaMod.default ?? _prismaMod;

const EMAIL = "himanshu.mishra.april1996@gmail.com";
const WEBHOOK_URL =
  process.env.LEADSQUARED_WEBHOOK_URL || "http://localhost:3017/api/leadsquared/webhook";

const headers = { "content-type": "application/json" };
const secret = process.env.LEADSQUARED_WEBHOOK_SECRET;
if (secret) headers["x-webhook-secret"] = secret;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  // 1. Find the lead + its sync-map row (ProspectID).
  const lead = await prisma.qceLead.findFirst({
    where: { email: EMAIL },
    select: { id: true, orgId: true, name: true, firstName: true, stage: true, status: true, phone: true, mobile: true },
  });
  if (!lead) {
    console.error(`No QceLead found with email ${EMAIL}. Aborting.`);
    process.exit(1);
  }
  const map = await prisma.qceLeadSquaredSyncMap.findFirst({
    where: { crmLeadId: lead.id },
    select: { lsqProspectId: true, syncOrigin: true, lastSyncedAt: true, lastPayloadHash: true },
  });
  if (!map || !map.lsqProspectId) {
    console.error(`No QceLeadSquaredSyncMap / ProspectID for lead ${lead.id}. Aborting.`);
    console.error("lead:", lead);
    process.exit(1);
  }

  const prospectId = map.lsqProspectId;
  console.log("── Target lead (BEFORE) ─────────────────────────────");
  console.log({
    crmLeadId: lead.id,
    orgId: lead.orgId,
    name: lead.name,
    firstName: lead.firstName,
    stage: lead.stage,
    status: lead.status,
    phone: lead.phone,
    mobile: lead.mobile,
    lsqProspectId: prospectId,
    syncOrigin: map.syncOrigin,
    lastSyncedAt: map.lastSyncedAt,
  });

  // 2. Build the { Before, After } webhook. STATUS-ONLY change: status ->
  //    "Active Partner", stage left as-is (so only the Status line is logged).
  const TARGET_STATUS = "Active Partner";
  const TARGET_STAGE = lead.stage; // unchanged
  if (lead.status === TARGET_STATUS) {
    console.error(`\nLead is already at status '${TARGET_STATUS}' — nothing to change.`);
    process.exit(1);
  }

  // Snapshot activities BEFORE the webhook so we can detect any NEW disposition
  // entry created by the inbound path (feature under test — #3).
  const activityIdsBefore = new Set(
    (await prisma.qceActivity.findMany({ where: { leadId: lead.id }, select: { id: true } })).map(
      (a) => a.id,
    ),
  );
  const payload = {
    Before: {
      ProspectID: prospectId,
      EmailAddress: EMAIL,
      ProspectStage: lead.stage,
      mx_Status: lead.status,
    },
    After: {
      ProspectID: prospectId,
      EmailAddress: EMAIL,
      ProspectStage: TARGET_STAGE,
      mx_Status: TARGET_STATUS,
    },
  };

  console.log("\n── POST webhook ─────────────────────────────────────");
  console.log(`${WEBHOOK_URL}`);
  console.log(JSON.stringify(payload, null, 2));

  const res = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  console.log(`\nHTTP ${res.status} ${res.statusText}`);
  console.log("response body:", text);

  // 3. Poll the QceLead (Redis path enqueues; worker applies async).
  console.log("\n── Polling QceLead for stage/status change (up to 10s) ──");
  let after = lead;
  let changed = false;
  const start = Date.now();
  while (Date.now() - start < 10_000) {
    await sleep(500);
    after = await prisma.qceLead.findUnique({
      where: { id: lead.id },
      select: { id: true, stage: true, status: true },
    });
    if (after && after.status === TARGET_STATUS) {
      changed = true;
      break;
    }
  }

  console.log("── Target lead (AFTER) ──────────────────────────────");
  console.log({ crmLeadId: after.id, stage: after.stage, status: after.status });

  // 4. Re-read the map to see how the guard treated it.
  const mapAfter = await prisma.qceLeadSquaredSyncMap.findFirst({
    where: { crmLeadId: lead.id },
    select: { syncOrigin: true, lastSyncedAt: true, lastPayloadHash: true },
  });

  // 5. Check for a NEW activity/disposition entry (#3). Poll a bit — the worker
  //    would create it in the same job that applied the field change.
  let newActivities = [];
  const aStart = Date.now();
  while (Date.now() - aStart < 6000) {
    const acts = await prisma.qceActivity.findMany({
      where: { leadId: lead.id },
      select: { id: true, type: true, subject: true, outcome: true, detailNotes: true, occurredAt: true, ownerName: true },
      orderBy: { occurredAt: "desc" },
    });
    newActivities = acts.filter((a) => !activityIdsBefore.has(a.id));
    if (newActivities.length > 0) break;
    await sleep(500);
  }

  const statusChanged = after.status === TARGET_STATUS;
  const stageChanged = after.stage === TARGET_STAGE;

  console.log("\n══ RESULTS ══════════════════════════════════════════");
  console.log(`1. QceLead.status updated -> '${TARGET_STATUS}'? ${statusChanged ? "YES [OK]" : "NO [X]"}  (now: '${after.status}')`);
  console.log(`2. QceLead.stage  updated -> '${TARGET_STAGE}'?  ${stageChanged ? "YES [OK]" : "NO [X]"}  (now: '${after.stage}')`);
  console.log(`3. New Call Disposition / activity entry created? ${newActivities.length > 0 ? "YES [OK]" : "NO [X]"}`);
  if (newActivities.length > 0) {
    for (const a of newActivities) {
      console.log(`     • type=${a.type} subject="${a.subject}" owner="${a.ownerName ?? "-"}"`);
      if (a.detailNotes) console.log(`       notes: ${a.detailNotes.replace(/\n/g, " | ")}`);
    }
  } else {
    console.log("     (no new row in QceActivity for this lead — the inbound path did NOT log a disposition/timeline entry)");
  }
}

main()
  .catch((err) => {
    console.error("\nFatal error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });
