/**
 * TEMP read-only probe: discover LeadSquared's Lead Activity API surface.
 *
 * Run:
 *   npx tsx --env-file=.env.local scripts/tmp-lsq-activity-probe.mjs
 *
 * READ-ONLY. It only calls GET metadata endpoints and Retrieve (read) endpoints.
 * It NEVER calls ProspectActivity.svc/Create — nothing is written to LeadSquared.
 *
 * Goal: report (1) the activity-create endpoint + fields, (2) the configured
 * activity TYPES / event codes, (3) the codes for the call/disposition activities
 * we saw on inbound webhooks ("Outbound Phone Call Activity" / "Call Disposition").
 */

const HOST = (process.env.LEADSQUARED_HOST || "https://api-in21.leadsquared.com").replace(/\/+$/, "");
const ACCESS = process.env.LEADSQUARED_ACCESS_KEY;
const SECRET = process.env.LEADSQUARED_SECRET_KEY;
// himanshu.mishra.april1996@gmail.com — has call/disposition activities in LSQ.
const PROBE_PROSPECT_ID = process.env.PROBE_PROSPECT_ID || "3bca731a-7eb2-4fb4-b6e5-33cfceb9ea0a";

if (!ACCESS || !SECRET) {
  console.error("Missing LEADSQUARED_ACCESS_KEY / LEADSQUARED_SECRET_KEY");
  process.exit(1);
}

async function call(method, path, body) {
  const url = `${HOST}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-LSQ-AccessKey": ACCESS,
      "x-LSQ-SecretKey": SECRET,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  let parsed = null;
  const text = await res.text();
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }
  return { status: res.status, ok: res.ok, parsed };
}

function short(v, n = 1500) {
  const s = typeof v === "string" ? v : JSON.stringify(v, null, 2);
  return s.length > n ? s.slice(0, n) + `\n… (${s.length - n} more chars)` : s;
}

async function probe(label, method, path, body) {
  console.log(`\n===== ${label} =====`);
  console.log(`${method} ${path}`);
  try {
    const r = await call(method, path, body);
    console.log(`HTTP ${r.status} ${r.ok ? "OK" : "ERR"}`);
    console.log(short(r.parsed));
    return r;
  } catch (e) {
    console.log("request failed:", e instanceof Error ? e.message : String(e));
    return null;
  }
}

function fieldsOf(type) {
  // ActivityProperties is a JSON *string* holding FormMetaData (the fields the
  // activity accepts). Parse defensively.
  try {
    const props = JSON.parse(type.ActivityProperties || "{}");
    const meta = Array.isArray(props.FormMetaData) ? props.FormMetaData : [];
    return meta.map((f) => ({
      SchemaName: f.SchemaName,
      DisplayName: f.DisplayName,
      DataType: f.DataType,
      IsMandatory: !!f.IsMandatory,
    }));
  } catch {
    return [];
  }
}

async function main() {
  console.log(`Host: ${HOST}`);
  console.log(`Probe ProspectId: ${PROBE_PROSPECT_ID}`);

  // (2) Activity TYPES / event codes configured in this account.
  const r = await call("GET", "/v2/ProspectActivity.svc/ActivityTypes.Get");
  const types = Array.isArray(r.parsed) ? r.parsed : [];
  console.log(`\n===== ACTIVITY TYPES (${types.length}) — code | EventType | Tags | dir | name =====`);
  for (const t of types) {
    console.log(
      `  ${String(t.ActivityEvent).padStart(4)} | ET=${t.EventType} | ${String(t.Tags || "").padEnd(10)} | dir=${t.EventDirection} | ${t.ActivityEventName}`,
    );
  }

  // (3) Fields for the call / phone / disposition activity types.
  const callish = types.filter((t) =>
    /call|phone|disposition/i.test(`${t.ActivityEventName} ${t.DisplayName}`),
  );
  console.log(`\n===== CALL / PHONE / DISPOSITION TYPES & THEIR FIELDS (${callish.length}) =====`);
  for (const t of callish) {
    console.log(`\n• [${t.ActivityEvent}] ${t.ActivityEventName}  (EventType=${t.EventType}, Tags=${t.Tags}, dir=${t.EventDirection})`);
    for (const f of fieldsOf(t)) {
      console.log(`     - ${f.SchemaName}  "${f.DisplayName}"  (${f.DataType})${f.IsMandatory ? "  [MANDATORY]" : ""}`);
    }
  }

  // (1)/(3) Try to read himanshu's real activities (several documented shapes).
  await probe("Retrieve by lead (Activity/Retrieve/ByLead)", "POST", "/v2/ProspectActivity.svc/Activity/Retrieve/ByLead", {
    LeadId: PROBE_PROSPECT_ID, PageIndex: 1, PageSize: 25, RemoveEmptyValues: true,
  });
  await probe("Get activities (LeadManagement RetrieveLeadActivities)", "GET",
    `/v2/ProspectActivity.svc/RetrieveLeadActivities?leadId=${encodeURIComponent(PROBE_PROSPECT_ID)}`);
  await probe(
    "Retrieve activities (leadId as query param)",
    "POST",
    `/v2/ProspectActivity.svc/Retrieve?leadId=${encodeURIComponent(PROBE_PROSPECT_ID)}`,
    { Paging: { PageIndex: 1, PageSize: 25 }, Sorting: { ColumnName: "ActivityDate", Direction: "1" } },
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Fatal:", e);
    process.exit(1);
  });
