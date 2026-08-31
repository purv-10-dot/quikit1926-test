/**
 * Capture ONE real Fathom meeting and report exactly which of its fields reach
 * the QuikScale screen.
 *
 * WHY THIS EXISTS
 * ---------------
 * "Does my app show the same as Fathom?" was, until this script, unanswerable.
 * Every Fathom payload in every test is hand-written — five fields, a plain
 * string transcript, no summary, no action items. So the connector's field
 * aliases were guesses that nothing had ever checked against reality, and a
 * field Fathom sends but we drop produced no error anywhere: the data was
 * simply missing three layers away from the cause.
 *
 * This talks to the live API ONCE, dumps the raw response, and diffs it against
 * what the app actually renders.
 *
 * IT DELIBERATELY BYPASSES `listMeetingsSince`
 * --------------------------------------------
 * That function normalises and discards, which is precisely the behaviour under
 * audit. Auditing it with itself would report perfect parity forever. So the
 * raw fetch here is hand-rolled; only `FATHOM_API_BASE` is shared, to keep one
 * source of truth for the URL.
 *
 * Usage (from the repo root):
 *   npx tsx apps/quikflow/scripts/fathom-capture.ts --org=<orgId> --dry-run
 *   npx tsx apps/quikflow/scripts/fathom-capture.ts --org=<orgId>
 *   npx tsx apps/quikflow/scripts/fathom-capture.ts --org=<orgId> --recording=<id> --no-redact
 *
 * Requires DATABASE_URL and WF_CONNECTION_ENC_KEY. Both are loaded from the
 * env files below — nothing needs exporting by hand.
 *
 * PRIVACY. The RAW dump contains real emails and everything people said. It is
 * written to a scratch directory and must never be committed. The REDACTED file
 * is the fixture candidate, and even that requires you to read it first — see
 * `redactFathomPayload.ts`.
 */
import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { mkdirSync, writeFileSync } from "fs";

// packages/database/.env has DATABASE_URL; apps/quikflow/.env.local is the ONLY
// place WF_CONNECTION_ENC_KEY lives. Loaded last so its DATABASE_URL wins.
loadEnv({ path: resolve(process.cwd(), "packages/database/.env") });
loadEnv({ path: resolve(process.cwd(), "apps/quikflow/.env.local") });

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

/** Every JSON path in an object, with its type and a truncated sample value. */
function keyInventory(node: unknown, prefix = "", out: Map<string, string> = new Map()): Map<string, string> {
  if (Array.isArray(node)) {
    // Describe the first element only — an array of 200 turns has one shape.
    if (node.length > 0) keyInventory(node[0], `${prefix}[]`, out);
    else out.set(prefix, "empty array");
    return out;
  }
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      keyInventory(v, prefix ? `${prefix}.${k}` : k, out);
    }
    return out;
  }
  const sample = typeof node === "string" ? `"${node.slice(0, 40)}${node.length > 40 ? "…" : ""}"` : String(node);
  out.set(prefix, `${node === null ? "null" : typeof node} = ${sample}`);
  return out;
}

/**
 * Every key `normalizeMeeting` looks at. Hard-coded rather than derived: the
 * point is to compare INTENT against reality, and a list derived from the code
 * would agree with the code by construction.
 */
const CONSUMED_KEYS = new Set(
  [
    "meeting", "recording", "data",
    "recording_id", "recordingId", "id", "meeting_id", "meetingId", "share_id", "shareId",
    "title", "meeting_title", "meetingTitle", "topic", "name",
    "started_at", "startedAt", "start_time", "startTime", "recording_start_time", "scheduled_start_time", "created_at",
    "ended_at", "endedAt", "end_time", "endTime", "recording_end_time", "scheduled_end_time",
    "duration_minutes", "durationMinutes", "duration_seconds", "durationSeconds", "duration",
    "summary", "ai_summary", "aiSummary", "default_summary",
    "markdown_formatted", "markdown", "text", "content",
    "attendees", "invitees", "calendar_invitees", "calendarInvitees",
    "participants", "team_members", "teamMembers", "identified_speakers", "speakers", "contacts",
    "email", "email_address", "emailAddress", "display_name", "displayName", "full_name",
    "linkedin_url", "linkedinUrl", "linkedin",
    "recording_url", "recordingUrl", "url", "share_url", "shareUrl",
    "transcript", "transcript_text", "transcriptText", "items",
    "speaker", "speaker_name", "timestamp", "start", "offset",
    "action_items", "actionItems", "description", "assignee", "owner", "assigned_to", "assignedTo", "user",
    "due_date", "dueDate", "due", "recording_timestamp", "recordingTimestamp", "playback_seconds",
    "recording_playback_url", "playback_url", "playbackUrl", "link",
    "completed", "is_completed", "isCompleted", "done", "action_item_id", "actionItemId",
  ].map((k) => k.toLowerCase()),
);

/** The leaf key of a JSON path: `action_items[].assignee.name` → `name`. */
function leafKey(path: string): string {
  const last = path.split(".").pop() ?? path;
  return last.replace(/\[\]$/, "").toLowerCase();
}

async function probe(url: string, apiKey: string): Promise<{ status: number; body: unknown }> {
  try {
    const res = await fetch(url, { headers: { "X-Api-Key": apiKey, Accept: "application/json" } });
    const text = await res.text();
    let body: unknown = text;
    try {
      body = JSON.parse(text);
    } catch {
      /* keep the raw text — a 404 HTML page is itself a finding */
    }
    return { status: res.status, body };
  } catch (e) {
    return { status: 0, body: `fetch failed: ${(e as Error).message}` };
  }
}

async function main() {
  const orgId = arg("org");
  const recordingArg = arg("recording");
  const since = arg("since") ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const redact = !flag("no-redact");
  const outDir = arg("out") ?? resolve(process.cwd(), ".fathom-capture");

  if (!orgId) {
    console.error("Missing --org=<orgId>.  Usage: npx tsx apps/quikflow/scripts/fathom-capture.ts --org=<orgId>");
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Run from the repo root so the .env files resolve.");
    process.exit(1);
  }
  if (!process.env.WF_CONNECTION_ENC_KEY) {
    console.error(
      "WF_CONNECTION_ENC_KEY is not set — the stored Fathom API key cannot be decrypted.\n" +
        "It lives in apps/quikflow/.env.local. Run from the repo root.",
    );
    process.exit(1);
  }

  const { FATHOM_API_BASE, normalizeMeeting } = await import("../lib/connectors/fathom");
  const { db } = await import("../lib/db");

  console.log(`\nFathom capture — org ${orgId}`);
  console.log(`API base: ${FATHOM_API_BASE}`);

  const conn = await db.wfConnection.findFirst({
    where: { orgId, provider: "fathom" as never, status: "connected" },
    orderBy: { createdAt: "asc" },
    select: { id: true, label: true, accessToken: true },
  });
  if (!conn?.accessToken) {
    console.error(
      `\nNo CONNECTED Fathom connection for org ${orgId}.\n` +
        "Check Settings → Connections in QuikFlow, or that the orgId is right.",
    );
    process.exit(1);
  }

  let apiKey: string;
  try {
    const { decryptSecret } = await import("../lib/connectors/crypto");
    apiKey = decryptSecret(conn.accessToken);
  } catch (e) {
    console.error(
      `\nFound connection ${conn.id} but could NOT decrypt its API key: ${(e as Error).message}\n` +
        "That points at a wrong or rotated WF_CONNECTION_ENC_KEY, not at a missing connection.",
    );
    process.exit(1);
  }
  console.log(`Connection: ${conn.label} (${conn.id})`);

  if (flag("dry-run")) {
    console.log("\n--dry-run: connection resolved and key decrypted OK. Would fetch:");
    console.log(`  GET ${FATHOM_API_BASE}/meetings?created_after=${since}&include_*=true`);
    console.log("No request was made.");
    return;
  }

  // --- 1. Raw list fetch, unnormalised ------------------------------------
  const params = new URLSearchParams({
    created_after: since,
    include_transcript: "true",
    include_summary: "true",
    include_action_items: "true",
  });
  console.log(`\nFetching meetings created after ${since} …`);
  const list = await probe(`${FATHOM_API_BASE}/meetings?${params.toString()}`, apiKey);
  if (list.status !== 200) {
    console.error(`Fathom returned ${list.status}. Body:\n${JSON.stringify(list.body).slice(0, 500)}`);
    process.exit(1);
  }

  const listBody = list.body as Record<string, unknown>;
  const items = (listBody.items ?? listBody.meetings ?? listBody.data ?? listBody.results ?? []) as unknown[];
  if (!Array.isArray(items) || items.length === 0) {
    console.error(
      `\nFathom returned no meetings created after ${since}.\n` +
        "Pass an earlier --since=<ISO date>, e.g. --since=2026-01-01T00:00:00.000Z",
    );
    process.exit(1);
  }

  const rawItem =
    (recordingArg
      ? items.find((i) => String((i as Record<string, unknown>).recording_id ?? (i as Record<string, unknown>).id) === recordingArg)
      : items[0]) ?? items[0];
  const recordingId = String(
    (rawItem as Record<string, unknown>).recording_id ?? (rawItem as Record<string, unknown>).id ?? "",
  );
  console.log(`Captured ${items.length} meeting(s); inspecting recording ${recordingId}.`);

  // --- 2. Probe the endpoints nothing in the app has ever called -----------
  console.log("\nProbing per-meeting endpoints …");
  const detail = await probe(`${FATHOM_API_BASE}/meetings/${encodeURIComponent(recordingId)}?${params}`, apiKey);
  const transcript = await probe(`${FATHOM_API_BASE}/meetings/${encodeURIComponent(recordingId)}/transcript`, apiKey);
  const summaryProbe = await probe(`${FATHOM_API_BASE}/meetings/${encodeURIComponent(recordingId)}/summary`, apiKey);
  const actionsProbe = await probe(`${FATHOM_API_BASE}/meetings/${encodeURIComponent(recordingId)}/action_items`, apiKey);
  for (const [label, p] of [
    ["GET /meetings/{id}", detail],
    ["GET /meetings/{id}/transcript", transcript],
    ["GET /meetings/{id}/summary", summaryProbe],
    ["GET /meetings/{id}/action_items", actionsProbe],
  ] as const) {
    console.log(`  ${p.status === 200 ? "200 OK  " : `${p.status || "ERR"}     `} ${label}`);
  }

  const listKeys = keyInventory(rawItem);
  if (detail.status === 200) {
    const detailKeys = keyInventory(detail.body);
    const extra = [...detailKeys.keys()].filter((k) => !listKeys.has(k));
    console.log(
      extra.length
        ? `  → the detail endpoint adds ${extra.length} key(s) the list item lacks: ${extra.slice(0, 12).join(", ")}`
        : "  → the detail endpoint adds nothing the list item does not already have.",
    );
  }

  // --- 3. Write the raw dump (scratch only) --------------------------------
  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const rawPath = resolve(outDir, `fathom-raw-${recordingId}-${stamp}.json`);
  writeFileSync(
    rawPath,
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        base: FATHOM_API_BASE,
        orgId,
        listItem: rawItem,
        detail: { status: detail.status, body: detail.body },
        transcript: { status: transcript.status, body: transcript.body },
        summaryProbe: { status: summaryProbe.status },
        actionItemsProbe: { status: actionsProbe.status },
      },
      null,
      2,
    ),
    "utf8",
  );
  console.log(`\nRAW dump → ${rawPath}`);
  console.log("  ⚠ contains real emails and real speech. Never commit this file.");

  // --- 4. Redact into a fixture candidate ---------------------------------
  if (redact) {
    const { redactFathomPayload, assertRedacted } = await import("./redactFathomPayload");
    const { payload, map, replacedCount } = redactFathomPayload(rawItem);
    const problems = assertRedacted(payload, map);
    if (problems.length) {
      console.error(`\n✗ Redaction INCOMPLETE — refusing to write the fixture. ${problems.length} problem(s):`);
      for (const p of problems.slice(0, 20)) console.error(`   ${p}`);
    } else {
      const redPath = resolve(outDir, `fathom-redacted-${stamp}.json`);
      writeFileSync(redPath, JSON.stringify(payload, null, 2), "utf8");
      writeFileSync(resolve(outDir, `redaction-map-${stamp}.json`), JSON.stringify(map, null, 2), "utf8");
      console.log(`\nREDACTED fixture candidate → ${redPath}   (${replacedCount} identifiers replaced)`);
      console.log("  ⚠ the reverse map sits beside it — DO NOT COMMIT the map.");
      console.log("  ⚠ READ the redacted transcript before promoting this to a committed fixture:");
      console.log("    a nickname or a company said aloud is PII no scanner catches.");
    }
  }

  // --- 5. What Fathom sends that we drop ----------------------------------
  const normalized = normalizeMeeting(rawItem);
  const dropped = [...listKeys.entries()].filter(([path]) => !CONSUMED_KEYS.has(leafKey(path)));

  console.log("\n" + "─".repeat(72));
  console.log("FIELDS FATHOM SENDS THAT WE DROP");
  console.log("─".repeat(72));
  if (dropped.length === 0) {
    console.log("  (none — every key in the payload is one the connector reads)");
  } else {
    for (const [path, desc] of dropped) console.log(`  ${path.padEnd(44)} ${desc}`);
  }

  console.log("\n" + "─".repeat(72));
  console.log("WHAT SURVIVED NORMALISATION");
  console.log("─".repeat(72));
  if (!normalized) {
    console.log("  ✗ normalizeMeeting() returned NULL — this meeting would be dropped entirely.");
  } else {
    const ai = normalized.actionItems;
    console.log(`  title              ${normalized.title ?? "(null)"}`);
    console.log(`  startedAt          ${normalized.startedAt ?? "(null)"}`);
    console.log(`  durationMinutes    ${normalized.durationMinutes ?? "(null)"}`);
    console.log(
      `  attendees          ${normalized.attendees.length}  ` +
        `(${normalized.attendees.filter((a) => a.isInvitee).length} invited, ` +
        `${normalized.attendees.filter((a) => a.isIdentified).length} identified)`,
    );
    console.log(`  summary            ${normalized.summary ? `${normalized.summary.length} chars` : "(null)"}`);
    console.log(`  transcriptText     ${normalized.transcriptText ? `${normalized.transcriptText.length} chars` : "(null)"}`);
    console.log(`  transcriptSegments ${normalized.transcriptSegments?.length ?? 0}`);
    console.log(`  actionItems        ${ai.length}`);
    console.log(`    with assignee    ${ai.filter((a) => a.assignee).length}`);
    console.log(`    with timestamp   ${ai.filter((a) => a.timestampSeconds != null).length}`);
  }

  console.log(`\nNext: render the same capture through the app's own view code with\n`);
  console.log(`  npx tsx apps/quikflow/scripts/fathom-parity-report.ts --org=${orgId} --file=${rawPath}\n`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
