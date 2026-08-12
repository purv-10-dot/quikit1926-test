/**
 * TEMP repeated two-way sync stress test — 6 iterations on FRESH leads.
 *
 * Run:
 *   npx tsx --env-file=.env.local scripts/tmp-repeat-sync-test.mjs
 *
 * Requires: dev server (port 3017) + BullMQ worker + Redis all UP, and valid
 * LeadSquared credentials in env (outbound hits the real LSQ API).
 *
 * Per iteration:
 *   1. OUTBOUND create: createCrmLead(unique repeattest+<i>+<ts>@example.com,
 *      stage "New Lead", source "FB Lead Ads") in the target tenant. This
 *      enqueues an outbound push; the worker syncs to LSQ and stamps the
 *      QceLeadSquaredSyncMap row (syncOrigin='crm' + real lsqProspectId). We poll
 *      that row (10s timeout) and record create latency.
 *   2. OUTBOUND update: updateCrmLead(stage -> "Demo Scheduled") -> re-push ->
 *      poll until the mapping's lastSyncedAt advances past the create time.
 *   3. INBOUND update: POST a Before/After webhook for that SAME lsqProspectId
 *      with After.FirstName changed -> poll the QceLead until firstName reflects
 *      it (10s timeout), proving inbound update on the already-synced lead with
 *      NO duplicate (same QceLead id throughout).
 *
 * Cleanup: deletes every repeattest+ QceLead it created and their sync-map rows.
 * TEMP — delete this script after use.
 */
// tsx transpiles these .ts modules to CJS; Node's ESM named-export detection
// (cjs-module-lexer) can miss the exports, so pull them off the module object
// with a `.default` fallback that works for both CJS and ESM shapes.
const _prismaMod = await import("../lib/db/prisma");
const { prisma } = _prismaMod.default ?? _prismaMod;
const _createRecord = await import("../lib/services/leads/create-record");
const { createCrmLead, updateCrmLead } = _createRecord.default ?? _createRecord;

const TENANT_ID = "cmpzc0bn70000a1xp642kgwmf";
const WEBHOOK_URL =
  process.env.LEADSQUARED_WEBHOOK_URL || "http://localhost:3017/api/leadsquared/webhook";
const ITERATIONS = 6;
const POLL_TIMEOUT_MS = 10_000;
const POLL_INTERVAL_MS = 400;
const TS = Date.now();

/** Wall-clock ms — perf-style monotonic timer (Date.now unavailable? it's fine in scripts). */
const nowMs = () => Date.now();

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Poll `check` until it returns a truthy value or the timeout elapses.
 * Returns { ok, value, elapsedMs }.
 */
async function poll(check, timeoutMs = POLL_TIMEOUT_MS, intervalMs = POLL_INTERVAL_MS) {
  const start = nowMs();
  for (;;) {
    const value = await check();
    if (value) return { ok: true, value, elapsedMs: nowMs() - start };
    if (nowMs() - start >= timeoutMs) return { ok: false, value: null, elapsedMs: nowMs() - start };
    await sleep(intervalMs);
  }
}

const headers = { "content-type": "application/json" };
const secret = process.env.LEADSQUARED_WEBHOOK_SECRET;
if (secret) headers["x-webhook-secret"] = secret;

/** POST a { Before, After } "Lead Modified" webhook that changes FirstName. */
async function postInboundFirstNameChange(prospectId, email, oldFirstName, newFirstName) {
  const body = {
    Before: {
      ProspectID: prospectId,
      EmailAddress: email,
      FirstName: oldFirstName,
    },
    After: {
      ProspectID: prospectId,
      EmailAddress: email,
      FirstName: newFirstName,
    },
  };
  const res = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text };
}

/** Track everything we create so cleanup is exhaustive even on partial failure. */
const createdLeadIds = [];

async function runIteration(i) {
  const email = `repeattest+${i}+${TS}@example.com`;
  const result = {
    iteration: i,
    outboundCreate: "FAIL",
    createLatencyMs: null,
    outboundUpdate: "FAIL",
    inboundUpdate: "FAIL",
    notes: [],
  };

  // ── 1. OUTBOUND create ────────────────────────────────────────────────────
  let lead;
  try {
    lead = await createCrmLead({
      orgId: TENANT_ID,
      name: `RepeatTest ${i} ${TS}`,
      firstName: `RepeatTest${i}`,
      email,
      stage: "New Lead",
      source: "FB Lead Ads",
    });
    createdLeadIds.push(lead.id);
  } catch (err) {
    result.notes.push(`create threw: ${err instanceof Error ? err.message : String(err)}`);
    return result; // nothing more we can do this iteration
  }

  // Poll the mapping for a CRM-origin row with a real ProspectId.
  const mapCreated = await poll(async () => {
    const m = await prisma.qceLeadSquaredSyncMap.findFirst({
      where: { crmLeadId: lead.id, orgId: TENANT_ID },
    });
    return m && m.syncOrigin === "crm" && m.lsqProspectId ? m : null;
  });

  if (!mapCreated.ok) {
    result.notes.push("outbound create: no CRM-origin mapping w/ ProspectId within 10s");
    return result;
  }
  result.outboundCreate = "PASS";
  result.createLatencyMs = mapCreated.elapsedMs;
  const prospectId = mapCreated.value.lsqProspectId;
  const createSyncedAt = mapCreated.value.lastSyncedAt
    ? new Date(mapCreated.value.lastSyncedAt).getTime()
    : 0;

  // ── 2. OUTBOUND update (stage -> "Demo Scheduled") ────────────────────────
  try {
    await updateCrmLead(lead.id, { stage: "Demo Scheduled" });
  } catch (err) {
    result.notes.push(`update threw: ${err instanceof Error ? err.message : String(err)}`);
    // still attempt inbound below
  }

  const mapUpdated = await poll(async () => {
    const m = await prisma.qceLeadSquaredSyncMap.findFirst({
      where: { crmLeadId: lead.id, orgId: TENANT_ID },
    });
    const t = m && m.lastSyncedAt ? new Date(m.lastSyncedAt).getTime() : 0;
    return m && t > createSyncedAt ? m : null;
  });
  if (mapUpdated.ok) {
    result.outboundUpdate = "PASS";
  } else {
    result.notes.push("outbound update: lastSyncedAt did not advance within 10s");
  }

  // ── 3. INBOUND update (FirstName via webhook) ─────────────────────────────
  const newFirstName = `Inbound${i}-${TS}`;
  try {
    const resp = await postInboundFirstNameChange(prospectId, email, `RepeatTest${i}`, newFirstName);
    if (resp.status !== 200) {
      result.notes.push(`inbound webhook HTTP ${resp.status}: ${resp.body}`);
    }
  } catch (err) {
    result.notes.push(`inbound POST threw: ${err instanceof Error ? err.message : String(err)}`);
  }

  const inboundApplied = await poll(async () => {
    const l = await prisma.qceLead.findUnique({
      where: { id: lead.id },
      select: { id: true, firstName: true },
    });
    return l && l.firstName === newFirstName ? l : null;
  });
  if (inboundApplied.ok) {
    result.inboundUpdate = "PASS";
    // Confirm no duplicate: same QceLead id still owns this ProspectId.
    const dupes = await prisma.qceLead.count({
      where: {
        orgId: TENANT_ID,
        sourceSystem: "leadsquared",
        externalId: prospectId,
      },
    });
    if (dupes > 1) result.notes.push(`⚠ DUPLICATE: ${dupes} leads share ProspectId ${prospectId}`);
  } else {
    result.notes.push("inbound update: firstName did not reflect webhook within 10s");
  }

  return result;
}

function printTable(rows) {
  const H = ["iteration", "outbound-create", "outbound-update", "inbound-update", "notes"];
  const line = (c) =>
    `| ${String(c[0]).padEnd(9)} | ${String(c[1]).padEnd(15)} | ${String(c[2]).padEnd(15)} | ${String(
      c[3],
    ).padEnd(14)} | ${c[4]}`;
  console.log("\n" + line(H));
  console.log(`| ${"-".repeat(9)} | ${"-".repeat(15)} | ${"-".repeat(15)} | ${"-".repeat(14)} | -----`);
  for (const r of rows) {
    const create = r.outboundCreate === "PASS" ? `PASS (${r.createLatencyMs}ms)` : "FAIL";
    console.log(line([r.iteration, create, r.outboundUpdate, r.inboundUpdate, r.notes.join("; ")]));
  }
}

async function cleanup() {
  // Delete by tracked ids AND by the email pattern (backstop for any created
  // outside the id list). deleteMany is a HARD delete (soft-delete middleware
  // only rewrites reads). Sync-map rows first to respect the FK.
  const leads = await prisma.qceLead.findMany({
    where: {
      orgId: TENANT_ID,
      OR: [
        { id: { in: createdLeadIds.length ? createdLeadIds : ["__none__"] } },
        { email: { startsWith: "repeattest+" } },
      ],
    },
    select: { id: true },
  });
  const ids = [...new Set([...createdLeadIds, ...leads.map((l) => l.id)])];
  if (!ids.length) return { maps: 0, leads: 0 };
  const maps = await prisma.qceLeadSquaredSyncMap.deleteMany({
    where: { orgId: TENANT_ID, crmLeadId: { in: ids } },
  });
  const delLeads = await prisma.qceLead.deleteMany({
    where: { orgId: TENANT_ID, id: { in: ids } },
  });
  return { maps: maps.count, leads: delLeads.count };
}

async function main() {
  console.log(`Two-way sync stress test — ${ITERATIONS} iterations, tenant ${TENANT_ID}`);
  console.log(`Webhook: ${WEBHOOK_URL}\n`);

  const rows = [];
  for (let i = 1; i <= ITERATIONS; i++) {
    process.stdout.write(`Iteration ${i}/${ITERATIONS} ... `);
    const r = await runIteration(i);
    rows.push(r);
    console.log(
      `create=${r.outboundCreate} update=${r.outboundUpdate} inbound=${r.inboundUpdate}`,
    );
  }

  printTable(rows);

  // Totals.
  const passCreate = rows.filter((r) => r.outboundCreate === "PASS").length;
  const passUpdate = rows.filter((r) => r.outboundUpdate === "PASS").length;
  const passInbound = rows.filter((r) => r.inboundUpdate === "PASS").length;
  const latencies = rows.filter((r) => r.createLatencyMs != null).map((r) => r.createLatencyMs);
  const avgLatency = latencies.length
    ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
    : null;

  console.log("\n── Totals ──────────────────────────────────────────");
  console.log(`outbound-create : ${passCreate}/${ITERATIONS} passed`);
  console.log(`outbound-update : ${passUpdate}/${ITERATIONS} passed`);
  console.log(`inbound-update  : ${passInbound}/${ITERATIONS} passed`);
  console.log(`avg outbound-create latency: ${avgLatency != null ? avgLatency + "ms" : "n/a"}`);

  // Cleanup (always).
  const cleaned = await cleanup();
  console.log(`\nCleanup: deleted ${cleaned.leads} QceLead(s) + ${cleaned.maps} sync-map row(s).`);

  const allPass = passCreate === ITERATIONS && passUpdate === ITERATIONS && passInbound === ITERATIONS;
  console.log(allPass ? "\n✔ ALL iterations passed in both directions." : "\n⚠ Some iterations failed — see notes.");
  process.exit(allPass ? 0 : 1);
}

main()
  .catch(async (err) => {
    console.error("\nFatal error:", err);
    try {
      const cleaned = await cleanup();
      console.log(`Cleanup after error: deleted ${cleaned.leads} lead(s) + ${cleaned.maps} map(s).`);
    } catch (e) {
      console.error("Cleanup also failed:", e instanceof Error ? e.message : e);
    }
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });
