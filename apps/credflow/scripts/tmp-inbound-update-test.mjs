/**
 * TEMP manual test: simulate a LeadSquared "Lead Modified" webhook for an
 * EXISTING synced lead and confirm QuikCRM applies the inbound update
 * (no duplicate).
 *
 * Run:
 *   npx tsx --env-file=.env.local scripts/tmp-inbound-update-test.mjs
 *
 * Target lead: 18july@gmail.com (ProspectID b230698b-f674-4a81-bdad-93960c8978cc)
 *
 * The route unwraps the { Before, After } snapshot to `After`, keys on
 * ProspectID, and — because Redis is enabled — ENQUEUES the job. The actual
 * CrmLead write happens in the BullMQ worker, so the worker must be running
 * for the DB to change. Expected HTTP response here: { ok: true, queued: true }.
 *
 * After running, check the CrmLead in the DB:
 *   name  -> "18-UpdatedFromLSQ"
 *   stage -> "Future Lead" (subject to the stage value-map reverse translation)
 */

const WEBHOOK_URL =
  process.env.LEADSQUARED_WEBHOOK_URL || "http://localhost:3076/api/leadsquared/webhook";

const PROSPECT_ID = "b230698b-f674-4a81-bdad-93960c8978cc";
const EMAIL = "18july@gmail.com";

// Only `After` is applied by the inbound handler (toRecord unwraps to After).
// `Before` is illustrative of the prior state — its values are not consumed.
const payload = {
  Before: {
    ProspectID: PROSPECT_ID,
    EmailAddress: EMAIL,
    FirstName: "18july",
    ProspectStage: "New Lead",
    mx_Status: "New",
  },
  After: {
    ProspectID: PROSPECT_ID,
    EmailAddress: EMAIL,
    FirstName: "18-UpdatedFromLSQ",
    ProspectStage: "Future Lead",
    mx_Status: "Future Lead",
  },
};

const headers = { "content-type": "application/json" };
// Attach the shared secret only if one is configured (dev usually has none).
const secret = process.env.LEADSQUARED_WEBHOOK_SECRET;
if (secret) headers["x-webhook-secret"] = secret;

async function main() {
  console.log(`POST ${WEBHOOK_URL}`);
  console.log("payload:", JSON.stringify(payload, null, 2));

  const res = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  console.log(`\nHTTP ${res.status} ${res.statusText}`);
  console.log("response body:", text);

  if (!res.ok) {
    console.error("\n⚠️  Non-2xx response — inbound update not accepted.");
    process.exit(1);
  }
  console.log(
    "\n✔ Webhook accepted. If the response says { queued: true }, the CrmLead " +
      "write happens in the BullMQ worker — make sure the worker is running, " +
      "then check the DB for name='18-UpdatedFromLSQ' / stage='Future Lead'.",
  );
}

main().catch((err) => {
  console.error("Request failed:", err);
  process.exit(1);
});
