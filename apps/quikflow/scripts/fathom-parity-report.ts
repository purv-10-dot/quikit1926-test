/**
 * Four-column parity report:  RAW FATHOM → normalizeMeeting() → DB row → SCREEN.
 *
 * Runs OFFLINE against a file captured by `fathom-capture.ts`, so it can be
 * re-run after every fix without spending another API call.
 *
 * THE FOURTH COLUMN IS THE WHOLE POINT
 * ------------------------------------
 * It does not describe what the UI probably renders — it imports and calls the
 * exact functions the viewer calls (`cleanFathomSummary`, `buildTranscriptTurns`,
 * `actionItemMeta`, `attendeeGroups`) by relative path into apps/quikscale.
 * A report that reimplemented that logic would agree with itself and lie.
 *
 * Those three QuikScale modules are dependency-free for precisely this reason.
 * If someone adds a `@/`-aliased or React import to `summaryFormat.ts`,
 * `transcriptView.ts` or `meetingParts.ts`, this import breaks — that is the
 * intended alarm, not a bug here.
 *
 * Usage (from the repo root):
 *   npx tsx apps/quikflow/scripts/fathom-parity-report.ts --org=<orgId> --file=<capture.json>
 *   npx tsx apps/quikflow/scripts/fathom-parity-report.ts --file=<capture.json> --no-db
 */
import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { readFileSync } from "fs";

loadEnv({ path: resolve(process.cwd(), "packages/database/.env") });
loadEnv({ path: resolve(process.cwd(), "apps/quikflow/.env.local") });

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

type Verdict = "OK" | "LOSSY" | "MISSING" | "N/A";

interface Row {
  field: string;
  fathom: string;
  normalized: string;
  db: string;
  screen: string;
  verdict: Verdict;
}

const show = (v: unknown): string => {
  if (v === null || v === undefined) return "—";
  if (typeof v === "string") return v.length > 30 ? `${v.length} chars` : v;
  if (Array.isArray(v)) return `${v.length} item(s)`;
  return String(v);
};

function render(rows: Row[]): void {
  const w = { field: 20, fathom: 20, normalized: 20, db: 20, screen: 22 };
  const pad = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s.padEnd(n));
  const line = (r: Row) =>
    `  ${pad(r.field, w.field)}${pad(r.fathom, w.fathom)}${pad(r.normalized, w.normalized)}${pad(r.db, w.db)}${pad(r.screen, w.screen)}${r.verdict}`;

  console.log(
    `  ${pad("FIELD", w.field)}${pad("RAW FATHOM", w.fathom)}${pad("normalize()", w.normalized)}${pad("DB ROW", w.db)}${pad("SCREEN", w.screen)}VERDICT`,
  );
  console.log("  " + "─".repeat(w.field + w.fathom + w.normalized + w.db + w.screen + 8));
  for (const r of rows) console.log(line(r));
}

async function main() {
  const file = arg("file");
  const orgId = arg("org");
  const useDb = !flag("no-db") && !!orgId;

  if (!file) {
    console.error("Missing --file=<path to a fathom-capture.ts dump>.");
    process.exit(1);
  }

  const captured = JSON.parse(readFileSync(resolve(file), "utf8")) as Record<string, unknown>;
  // Accept either a full capture dump or a bare meeting object (a fixture).
  const rawItem = (captured.listItem ?? captured) as Record<string, unknown>;
  const synthetic = !captured.capturedAt;

  const { normalizeMeeting } = await import("../lib/connectors/fathom");
  // The app's OWN view code — relative, because these modules are pure.
  const { cleanFathomSummary, parseSummaryBlocks } = await import("../../quikscale/lib/meetings/summaryFormat");
  const { buildTranscriptTurns } = await import("../../quikscale/lib/meetings/transcriptView");
  const { actionItemMeta, attendeeGroups } = await import("../../quikscale/lib/meetings/meetingParts");

  const n = normalizeMeeting(rawItem);
  if (!n) {
    console.error("normalizeMeeting() returned null — this payload would be dropped entirely.");
    process.exit(1);
  }

  let dbRow: Record<string, unknown> | null = null;
  if (useDb) {
    const { db } = await import("../lib/db");
    dbRow = (await db.clientMeetingTranscript.findFirst({
      where: { orgId: orgId!, fathomRecordingId: n.recordingId },
      select: {
        title: true, startedAt: true, durationMinutes: true, attendees: true,
        summary: true, rawText: true, rawSegments: true, actionItems: true,
      },
    })) as Record<string, unknown> | null;
  }

  const dbCell = (v: unknown): string => (useDb ? (dbRow ? show(v) : "no row") : "skipped");

  // --- screen-side renderings, via the app's own functions -----------------
  const summaryBlocks = parseSummaryBlocks(cleanFathomSummary(n.summary));
  const turns = buildTranscriptTurns({ rawText: n.transcriptText, rawSegments: n.transcriptSegments });
  const groups = attendeeGroups(n.attendees);
  const itemsWithMeta = n.actionItems.filter((a) => actionItemMeta(a).length > 0);

  const rawAttendeeCount = ["attendees", "invitees", "calendar_invitees", "calendarInvitees", "participants", "team_members", "identified_speakers", "speakers", "contacts"]
    .flatMap((k) => (Array.isArray(rawItem[k]) ? (rawItem[k] as unknown[]) : []))
    .length;
  const rawActionItems = (rawItem.action_items ?? rawItem.actionItems) as unknown[] | undefined;

  const verdictFor = (fathomHas: boolean, onScreen: boolean): Verdict =>
    !fathomHas ? "N/A" : onScreen ? "OK" : "MISSING";

  const rows: Row[] = [
    {
      field: "title",
      fathom: show(rawItem.title ?? rawItem.meeting_title),
      normalized: show(n.title),
      db: dbCell(dbRow?.title),
      screen: show(n.title),
      verdict: verdictFor(!!(rawItem.title ?? rawItem.meeting_title), !!n.title),
    },
    {
      field: "startedAt",
      fathom: show(rawItem.started_at ?? rawItem.startedAt),
      normalized: show(n.startedAt),
      db: dbCell(dbRow?.startedAt),
      screen: show(n.startedAt),
      verdict: verdictFor(!!(rawItem.started_at ?? rawItem.startedAt), !!n.startedAt),
    },
    {
      field: "attendees",
      fathom: `${rawAttendeeCount} across lists`,
      normalized: `${n.attendees.length} merged`,
      db: dbCell(dbRow?.attendees),
      screen: groups.ungrouped ? `${n.attendees.length} flat` : `${groups.identified.length}+${groups.invitees.length} grouped`,
      verdict: rawAttendeeCount === 0 ? "N/A" : n.attendees.length >= 1 && !groups.ungrouped ? "OK" : n.attendees.length ? "LOSSY" : "MISSING",
    },
    {
      field: "summary",
      fathom: show(rawItem.default_summary ?? rawItem.summary),
      normalized: show(n.summary),
      db: dbCell(dbRow?.summary),
      screen: `${summaryBlocks.length} block(s)`,
      verdict: verdictFor(!!(rawItem.default_summary ?? rawItem.summary), summaryBlocks.length > 0),
    },
    {
      field: "transcript",
      fathom: show(rawItem.transcript),
      normalized: `${n.transcriptSegments?.length ?? 0} segment(s)`,
      db: dbCell(dbRow?.rawSegments ?? dbRow?.rawText),
      screen: `${turns.length} turn(s)`,
      verdict: verdictFor(!!rawItem.transcript, turns.length > 0),
    },
    {
      field: "actionItems",
      fathom: show(rawActionItems),
      normalized: `${n.actionItems.length} item(s)`,
      db: dbCell(dbRow?.actionItems),
      screen: `${n.actionItems.length} shown`,
      verdict: verdictFor(!!rawActionItems?.length, n.actionItems.length > 0),
    },
    {
      field: "  ↳ assignee",
      fathom: rawActionItems?.length ? "present" : "—",
      normalized: `${n.actionItems.filter((a) => a.assignee).length}/${n.actionItems.length}`,
      db: dbCell(dbRow?.actionItems),
      screen: `${n.actionItems.filter((a) => a.assignee).length} shown`,
      verdict: !rawActionItems?.length ? "N/A" : n.actionItems.every((a) => a.assignee) ? "OK" : n.actionItems.some((a) => a.assignee) ? "LOSSY" : "MISSING",
    },
    {
      field: "  ↳ timestamp",
      fathom: rawActionItems?.length ? "check raw" : "—",
      normalized: `${n.actionItems.filter((a) => a.timestampSeconds != null).length}/${n.actionItems.length}`,
      db: dbCell(dbRow?.actionItems),
      screen: `${itemsWithMeta.length} with meta`,
      verdict: !rawActionItems?.length ? "N/A" : n.actionItems.every((a) => a.timestampSeconds != null) ? "OK" : n.actionItems.some((a) => a.timestampSeconds != null) ? "LOSSY" : "MISSING",
    },
  ];

  console.log("\n" + "═".repeat(78));
  console.log(`FATHOM PARITY REPORT — recording ${n.recordingId}`);
  if (synthetic) {
    console.log("⚠ THIS FILE IS NOT A LIVE CAPTURE. It has no `capturedAt`, so it is a");
    console.log("  hand-built or already-promoted fixture. It proves the pipeline is");
    console.log("  self-consistent; it does NOT prove parity with the real Fathom API.");
  }
  if (!useDb) console.log("(DB column skipped — pass --org=<orgId> to compare against the stored row.)");
  else if (!dbRow) console.log(`(No ClientMeetingTranscript row for recording ${n.recordingId} in org ${orgId}.)`);
  console.log("═".repeat(78) + "\n");

  render(rows);

  const counted = rows.filter((r) => r.verdict !== "N/A");
  const ok = counted.filter((r) => r.verdict === "OK").length;
  console.log("\n" + "─".repeat(78));
  console.log(`PARITY SUMMARY: ${ok} of ${counted.length} Fathom fields reach the screen intact.`);
  const bad = counted.filter((r) => r.verdict !== "OK");
  if (bad.length) {
    console.log("\nNot reaching the screen:");
    for (const r of bad) console.log(`  ${r.verdict.padEnd(8)} ${r.field.trim()}`);
  }
  console.log("\nKNOWN DROPPED (agreed, not defects):");
  console.log("  · summary citation links — stripped by cleanFathomSummary at the user's request");
  console.log("  · action-item checkbox state — read-only here; nothing would persist back to Fathom");
  console.log("  · Fathom's RELATED meeting link and Ask Fathom — no QuikScale analogue");
  console.log("─".repeat(78) + "\n");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
