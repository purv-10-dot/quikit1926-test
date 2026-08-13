/**
 * TEMP controlled test: ONE activity push to a SAFE throwaway lead.
 *
 * Run:
 *   npx tsx --env-file=.env.local scripts/tmp-lsq-activity-push-test.mjs
 *
 * Steps:
 *  1. Read valid `Status` dropdown options for ActivityEvent 200 from
 *     ActivityTypes.Get (read-only).
 *  2. Create a clearly-marked THROWAWAY lead in LeadSquared (NOT himanshu).
 *  3. Push ONE ProspectActivity.svc/Create with ActivityEvent 200 + a valid Status.
 *  4. Print the raw Create response so we learn the API contract (does it
 *     return the activity Id?).
 *
 * This is a controlled write (one throwaway lead + one activity). No pipeline.
 */

const HOST = (process.env.LEADSQUARED_HOST || "https://api-in21.leadsquared.com").replace(/\/+$/, "");
const ACCESS = process.env.LEADSQUARED_ACCESS_KEY;
const SECRET = process.env.LEADSQUARED_SECRET_KEY;
if (!ACCESS || !SECRET) {
  console.error("Missing LEADSQUARED creds");
  process.exit(1);
}

async function call(method, path, body) {
  const res = await fetch(`${HOST}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-LSQ-AccessKey": ACCESS,
      "x-LSQ-SecretKey": SECRET,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }
  return { status: res.status, ok: res.ok, parsed };
}

function pad(n) {
  return String(n).padStart(2, "0");
}
function lsqDateTime(d) {
  // "yyyy-MM-dd HH:mm:ss" using UTC parts — UTC is behind IST, so this is always
  // in the past for the India account (avoids a future-date rejection).
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(
    d.getUTCHours(),
  )}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
}

async function main() {
  // ── 1. Valid Status options for ActivityEvent 200 (read-only) ─────────────
  const meta = await call("GET", "/v2/ProspectActivity.svc/ActivityTypes.Get");
  const types = Array.isArray(meta.parsed) ? meta.parsed : [];
  const t200 = types.find((t) => t.ActivityEvent === 200);
  let statusOptions = [];
  if (t200) {
    try {
      const props = JSON.parse(t200.ActivityProperties || "{}");
      const statusField = (props.FormMetaData || []).find((f) => f.SchemaName === "Status");
      const optSet = statusField ? JSON.parse(statusField.OptionSet || "[]") : [];
      statusOptions = optSet
        .map((o) => ({ Text: o.Text, Value: o.Value }))
        .filter((o) => (o.Value ?? "") !== "");
    } catch (e) {
      console.log("Could not parse Status OptionSet:", e instanceof Error ? e.message : e);
    }
  }
  console.log(`===== Valid Status options for ActivityEvent 200 (${statusOptions.length}) =====`);
  for (const o of statusOptions) console.log(`   Value="${o.Value}"   Text="${o.Text}"`);

  const chosenStatus = statusOptions[0]?.Value ?? "";
  console.log(`\nChosen Status for the test push: "${chosenStatus}"`);

  // ── 2. Create a THROWAWAY lead (clearly marked) ───────────────────────────
  const stamp = Date.now();
  const email = `zz-activity-probe+${stamp}@example.com`;
  console.log(`\n===== Creating throwaway lead: ${email} =====`);
  const createLead = await call("POST", "/v2/LeadManagement.svc/Lead.CreateOrUpdate?postUpdatedLead=false", [
    { Attribute: "EmailAddress", Value: email },
    { Attribute: "FirstName", Value: "ZZ Activity Probe" },
    { Attribute: "LastName", Value: "DELETE-ME" },
    { Attribute: "Source", Value: "API Test" },
  ]);
  console.log(`HTTP ${createLead.status}`);
  console.log(JSON.stringify(createLead.parsed, null, 2));
  const msg = (createLead.parsed && createLead.parsed.Message) || {};
  const prospectId = msg.Id || msg.RelatedId || createLead.parsed?.RelatedId;
  if (!prospectId) {
    console.error("No ProspectId returned — aborting before the activity push.");
    process.exit(1);
  }
  console.log(`ProspectId: ${prospectId}`);

  // ── 3. Push ONE activity (ActivityEvent 200) ──────────────────────────────
  const activityBody = {
    RelatedProspectId: prospectId,
    ActivityEvent: 200,
    ActivityNote: "QuikCRM controlled test push — API contract probe (safe throwaway lead).",
    ActivityDateTime: lsqDateTime(new Date()),
    Fields: chosenStatus ? [{ SchemaName: "Status", Value: chosenStatus }] : [],
  };
  console.log(`\n===== Pushing activity (ActivityEvent 200) =====`);
  console.log(JSON.stringify(activityBody, null, 2));
  const push = await call("POST", "/v2/ProspectActivity.svc/Create", activityBody);
  console.log(`\nHTTP ${push.status} ${push.ok ? "OK" : "ERR"}`);
  console.log("RAW Create response:");
  console.log(JSON.stringify(push.parsed, null, 2));

  // ── 4. Read it back to confirm the activity Id shape ──────────────────────
  const back = await call(
    "POST",
    `/v2/ProspectActivity.svc/Retrieve?leadId=${encodeURIComponent(prospectId)}`,
    { Paging: { PageIndex: 1, PageSize: 10 }, Sorting: { ColumnName: "ActivityDate", Direction: "1" } },
  );
  console.log(`\n===== Read-back (Retrieve) =====`);
  const acts = back.parsed?.ProspectActivities || [];
  for (const a of acts) {
    console.log(`   Id=${a.Id}  EventCode=${a.EventCode}  EventName=${a.EventName}  CreatedOn=${a.CreatedOn}`);
  }

  console.log(`\nNOTE: throwaway lead ${email} (${prospectId}) left in LeadSquared — mark/delete on their side if needed.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Fatal:", e);
    process.exit(1);
  });
