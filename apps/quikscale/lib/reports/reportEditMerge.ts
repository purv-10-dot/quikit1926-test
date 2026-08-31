/**
 * Facilitator edits to a stored report — the allow-list that keeps a hand-edit
 * from rewriting a measurement.
 *
 * WHY A MERGE AND NOT A REPLACE
 * -----------------------------
 * The edit endpoints take the WHOLE report document and persist it. That is
 * convenient for a form and dangerous on its own: the same payload that carries
 * a corrected observation also carries every attendance percentage, heat-map
 * score and metric tile, so a replace would let the browser dictate numbers this
 * app insists are computed. `apps/quikscale/CLAUDE.md` is unambiguous —
 * "Deterministic code owns every number" — and a report whose 90.4% came from a
 * text box is worse than no report, because it still looks like a measurement.
 *
 * So an edit is a MERGE: prose is taken from the incoming payload, everything
 * else from the stored row. A field not on the list below cannot be changed
 * through this path at all, whatever the client sends.
 *
 * WHAT IS EDITABLE
 * ----------------
 * Exactly the text a model wrote, because that is what a human is better at:
 *
 *   · title
 *   · executive.keyHighlights[]                    — the §4.2 bullets
 *   · facilitatorObservations.<six>.text           — §4.6 prose
 *   · stucks.all[].category|description|impact|requiredAction|raisedFor|status
 *   · stucks.recurring[].blocker                   — the group label
 *   · newWww.rows[].what|whenText                  — proposals, not yet records
 *
 * WHAT IS NOT, AND WHY
 * --------------------
 *   · Attendance matrix, heat map, executive metrics, confidence — computed.
 *   · `namedMembers` / `sourceDates` on an observation — the validator checks
 *     the prose against them, so letting one payload edit both would let an
 *     edit certify itself.
 *   · Blocker `date` / `huddleId` — provenance. §4.5A's value is that every row
 *     is traceable to one huddle; a re-pointed date breaks that silently.
 *   · `wwwReview` rows — statuses come from a live `WWWItem` query, and
 *     `lib/reports/wwwReview.ts` deliberately renders a transcript claim as an
 *     annotation BESIDE the stored status rather than instead of it. An edit
 *     here would make the report disagree with the WWW module while looking
 *     authoritative. Fix the item in the WWW module; the report follows.
 *
 * Rows are matched positionally and only when the incoming array has the same
 * length as the stored one — a mismatch means the client is out of date, and the
 * safe reading of "the list changed under me" is to keep the stored list. Adding
 * or deleting rows is therefore not possible through an edit, by design.
 */

import type { StoredWeeklyReport } from "@/lib/ai/weeklyHuddleCompose";

/** Documentation and test surface: every path an edit may touch. */
export const WEEKLY_EDITABLE_PATHS = [
  "title",
  "executive.keyHighlights[]",
  "facilitatorObservations.*.text",
  "stucks.all[].category",
  "stucks.all[].description",
  "stucks.all[].impact",
  "stucks.all[].requiredAction",
  "stucks.all[].raisedFor",
  "stucks.all[].status",
  "stucks.recurring[].blocker",
  "newWww.rows[].what",
  "newWww.rows[].whenText",
] as const;

/** Stamped onto a report the moment a human changes any of its text. */
export interface ManualEditMark {
  at: string;
  by: string;
  /** Dotted paths actually changed by this edit, for the UI and the audit log. */
  fields: string[];
}

export interface MergeResult {
  /** The document to persist: incoming prose over stored everything-else. */
  report: StoredWeeklyReport;
  /** Empty when the payload changed nothing an edit is allowed to change. */
  changedFields: string[];
}

const OBSERVATION_KEYS = [
  "attendanceParticipation",
  "strongPerformers",
  "achievementGap",
  "focusSpecificity",
  "stuckProtocol",
  "recommendations",
] as const;

const BLOCKER_TEXT_KEYS = [
  "category",
  "description",
  "impact",
  "requiredAction",
  "raisedFor",
] as const;

/**
 * New WWW rows: the commitment text and the date AS SPOKEN.
 *
 * `who` is absent on purpose. It is not a string but a `WhoResolution` object
 * from `wwwWhoBridge.ts` carrying a user id and a confidence, and export refuses
 * to create work for an owner who only "needs confirmation" — deliberately, so
 * nobody gets chased for work they never agreed to. Typing a name over that
 * object would produce a row that LOOKS owned and still cannot be exported.
 * Confirming an owner stays the export flow's picker; and when the cause is a
 * misspelled speaker, the fix is the unmapped-speaker mapping, which repairs
 * every future week instead of one row.
 */
const NEW_WWW_KEYS = ["what", "whenText"] as const;

const BLOCKER_STATUSES = new Set(["OPEN", "IN_PROGRESS", "RESOLVED"]);

/** Trim, and treat an all-whitespace string as "no value" rather than "". */
function cleanText(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

/**
 * A required string field: an edit may reword it but never blank it.
 *
 * Blanking a stuck's description would leave a row in §4.5A that reports
 * nothing, which reads as a rendering bug rather than an intentional deletion.
 */
function requiredText(incoming: unknown, stored: string): string {
  return cleanText(incoming) ?? stored;
}

/** An optional string field: an edit may reword it OR clear it. */
function optionalText(incoming: unknown, stored: string | null): string | null {
  if (typeof incoming !== "string") return stored;
  return cleanText(incoming);
}

/**
 * Merge one edit payload onto the stored report.
 *
 * `stored` is the source of truth for everything except the paths in
 * `WEEKLY_EDITABLE_PATHS`. Never throws on a malformed payload: a field it
 * cannot read is a field that keeps its stored value, because rejecting a whole
 * save over one bad field would lose the good edits alongside it.
 */
export function mergeWeeklyReportEdit(
  stored: StoredWeeklyReport,
  incoming: unknown,
  actor: { userId: string; at: Date },
): MergeResult {
  const changed: string[] = [];
  const patch = (incoming ?? {}) as Record<string, unknown>;

  // Deep-clone so the caller's stored object is never mutated — it is also the
  // fallback for every field, and mutating it mid-merge would corrupt that.
  const next: StoredWeeklyReport = structuredClone(stored);

  // --- title ---------------------------------------------------------------
  const title = cleanText(patch.title);
  if (title && title !== stored.title) {
    next.title = title;
    changed.push("title");
  }

  // --- §4.2 key highlights -------------------------------------------------
  const highlights = (patch.executive as { keyHighlights?: unknown } | undefined)?.keyHighlights;
  if (Array.isArray(highlights)) {
    // Blank bullets are dropped rather than rendered as empty list items, which
    // is also how a user deletes one.
    const cleaned = highlights.map(cleanText).filter((s): s is string => s !== null);
    if (JSON.stringify(cleaned) !== JSON.stringify(stored.executive.keyHighlights)) {
      next.executive.keyHighlights = cleaned;
      changed.push("executive.keyHighlights");
    }
  }

  // --- §4.6 facilitator observations ---------------------------------------
  const obs = patch.facilitatorObservations as Record<string, { text?: unknown }> | undefined;
  if (obs) {
    for (const key of OBSERVATION_KEYS) {
      const text = cleanText(obs[key]?.text);
      if (text && text !== stored.facilitatorObservations[key].text) {
        // Only `text` moves: `namedMembers` and `sourceDates` stay as generated,
        // because the validator checks the prose against them.
        next.facilitatorObservations[key].text = text;
        changed.push(`facilitatorObservations.${key}.text`);
      }
    }
  }

  // --- §4.5A stucks --------------------------------------------------------
  const stucks = patch.stucks as { all?: unknown; recurring?: unknown } | undefined;
  const incomingAll = stucks?.all;
  if (Array.isArray(incomingAll) && incomingAll.length === stored.stucks.all.length) {
    incomingAll.forEach((rawRow, i) => {
      const row = (rawRow ?? {}) as Record<string, unknown>;
      const storedRow = stored.stucks.all[i];
      // Positional match, verified by provenance: if the row at this index is
      // not the same blocker, the client's list is stale and nothing is applied.
      if (row.date !== storedRow.date || row.huddleId !== storedRow.huddleId) return;

      for (const key of BLOCKER_TEXT_KEYS) {
        const isRequired = key === "category" || key === "description";
        const value = isRequired
          ? requiredText(row[key], storedRow[key] as string)
          : optionalText(row[key], (storedRow[key] as string | null) ?? null);
        if (value !== (storedRow[key] ?? null)) {
          (next.stucks.all[i] as Record<string, unknown>)[key] = value;
          changed.push(`stucks.all[${i}].${key}`);
        }
      }

      // Status is an enum, and `null` means "the transcript never said" — a
      // meaning a facilitator may both set and take back.
      const rawStatus = row.status;
      const status =
        rawStatus === null
          ? null
          : typeof rawStatus === "string" && BLOCKER_STATUSES.has(rawStatus)
            ? (rawStatus as "OPEN" | "IN_PROGRESS" | "RESOLVED")
            : (storedRow.status ?? null);
      if (status !== (storedRow.status ?? null)) {
        next.stucks.all[i].status = status;
        changed.push(`stucks.all[${i}].status`);
      }
    });
  }

  // --- §4.5B recurring stuck labels ----------------------------------------
  const incomingRecurring = stucks?.recurring;
  if (
    Array.isArray(incomingRecurring) &&
    incomingRecurring.length === stored.stucks.recurring.length
  ) {
    incomingRecurring.forEach((rawRow, i) => {
      const label = cleanText((rawRow as Record<string, unknown> | null)?.blocker);
      if (label && label !== stored.stucks.recurring[i].blocker) {
        next.stucks.recurring[i].blocker = label;
        changed.push(`stucks.recurring[${i}].blocker`);
      }
      // `occurrences` and `blockerIndexes` are counted, not typed — they stay.
    });
  }

  // --- §8 New WWW proposals ------------------------------------------------
  // The one place an edit touches something destined to BECOME a record.
  // Editable precisely because it is not one yet: a commitment the model
  // paraphrased badly should be correctable before anyone creates work from it.
  const storedNewRows = (stored.newWww?.rows ?? []) as Record<string, unknown>[];
  const incomingNewRows = (patch.newWww as { rows?: unknown } | undefined)?.rows;
  if (
    Array.isArray(incomingNewRows) &&
    incomingNewRows.length === storedNewRows.length &&
    next.newWww
  ) {
    const nextRows = next.newWww.rows as Record<string, unknown>[];
    incomingNewRows.forEach((rawRow, i) => {
      const row = (rawRow ?? {}) as Record<string, unknown>;
      const storedRow = storedNewRows[i];
      // Same staleness guard as the stucks: a row that is not the same fact is
      // not the row the user edited.
      if (row.factId !== storedRow.factId) return;

      for (const key of NEW_WWW_KEYS) {
        const value =
          key === "what"
            ? requiredText(row[key], String(storedRow[key] ?? ""))
            : optionalText(row[key], (storedRow[key] as string | null) ?? null);
        if (value !== (storedRow[key] ?? null)) {
          nextRows[i][key] = value;
          changed.push(`newWww.rows[${i}].${key}`);
        }
      }
    });
  }

  if (changed.length) {
    // Stamped so the UI can say "edited by …", the Regenerate confirmation can
    // warn that regenerating discards these edits, and an export can be traced
    // back to a human decision.
    next.manualEdit = {
      at: actor.at.toISOString(),
      by: actor.userId,
      fields: changed,
    };
  }

  return { report: next, changedFields: changed };
}
