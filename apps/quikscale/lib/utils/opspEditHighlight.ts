/**
 * Helpers for the "edited after finalize" highlight feature.
 *
 * The OPSP edit-log (`GET /api/opsp/edit-log`) records every field change made
 * after an OPSP was finalized. These pure functions turn that list into the two
 * shapes the UI needs:
 *   - a set of edited field paths → highlight the matching inputs on the OPSP Form
 *   - a set of edited row indices per source array → highlight Review table rows
 *
 * Field paths look like: `employees.0`, `purpose`, `goalRows.3.projected`,
 * `targetRows.2.category`, `actionsQtr.1.m1`, `rocks.0`, `keyInitiatives.2`.
 */

/** Minimal shape consumed here — the edit-log GET returns a superset. */
export interface EditLogLike {
  field: string;
  actorName: string;
  createdAt: string;
  /** Author of the edit. Used by the OPSP Form to exclude the viewer's own edits. */
  actorId?: string;
}

/** Distinct field paths that were edited after finalize. */
export function editedFieldPaths(entries: EditLogLike[]): string[] {
  return [...new Set(entries.map((e) => e.field).filter(Boolean))];
}

/**
 * Does a DOM field (an element's `data-opsp-field`) correspond to an edited
 * path? Matches with bidirectional prefix tolerance so granularity mismatches
 * line up both ways:
 *   - logged `rocks.0`              → highlights `rocks.0.desc` / `rocks.0.owner`
 *   - logged `goalRows.3.projected` → highlights the exact `goalRows.3.projected`
 *   - logged `goalRows.3.projected` → also highlights a row container `goalRows.3`
 */
export function fieldMatchesEdited(domField: string, editedPaths: Set<string>): boolean {
  if (!domField) return false;
  if (editedPaths.has(domField)) return true;
  for (const e of editedPaths) {
    if (e === domField) return true;
    if (e.startsWith(domField + ".")) return true;
    if (domField.startsWith(e + ".")) return true;
  }
  return false;
}

/**
 * Row indices edited within a given source array. E.g. for `arrayName="goalRows"`
 * and a logged `goalRows.3.projected`, returns `{3}`. Used to highlight OPSP
 * Review rows (whose `rowIndex` equals the source-array position).
 */
export function editedRowIndices(entries: EditLogLike[], arrayName: string): Set<number> {
  const out = new Set<number>();
  const prefix = arrayName + ".";
  for (const e of entries) {
    if (!e.field.startsWith(prefix)) continue;
    const idx = Number.parseInt(e.field.slice(prefix.length).split(".")[0], 10);
    if (Number.isInteger(idx) && idx >= 0) out.add(idx);
  }
  return out;
}

/**
 * Entries created strictly after `sinceTs` (epoch ms) — i.e. the edits made
 * *since* the viewer last acknowledged. `sinceTs === 0` means "never acked", so
 * every entry is returned. Used to highlight only the changes from the latest
 * round, not the whole post-finalize set.
 */
export function editsSince<T extends { createdAt: string }>(entries: T[], sinceTs: number): T[] {
  if (!sinceTs) return entries;
  return entries.filter((e) => Date.parse(e.createdAt) > sinceTs);
}

/**
 * A history-drawer view scope. `null`/absent = show everything. When set, the
 * drawer shows every edit with `createdAt <= untilTs` (the "cumulative up to
 * this user" view described in the change stepper).
 */
export interface HistoryScope {
  actorId: string;
  actorName: string;
  untilTs: number;
}

/**
 * One row of the post-finalize change stepper — a single user's aggregated
 * edits. `latestTs` doubles as the "cumulative up to this user" cutoff: the
 * history drawer shows every edit (by anyone) with `createdAt <= latestTs`, so
 * a later editor's row surfaces both their own changes AND the earlier ones
 * they edited on top of.
 */
export interface ActorChangeGroup {
  actorId: string;
  actorName: string;
  latestTs: number; // epoch ms of this actor's most recent edit
  fieldCount: number; // distinct field paths this actor changed
  editCount: number; // total edit-log rows for this actor
}

/**
 * Group edit-log entries by author, one row per user, sorted so the most recent
 * editor is first. `fieldCount` counts DISTINCT field paths (so re-editing the
 * same field twice still reads as one field), `editCount` counts raw rows.
 * Entries with an unparseable `createdAt` are skipped. Actor identity falls back
 * to `actorName` when `actorId` is absent (the drawer's cutoff is time-based, so
 * a missing id never breaks the cumulative view).
 */
export function groupEditsByActor(entries: EditLogLike[]): ActorChangeGroup[] {
  const map = new Map<
    string,
    { actorId: string; actorName: string; latestTs: number; fields: Set<string>; editCount: number }
  >();
  for (const e of entries) {
    const ts = Date.parse(e.createdAt);
    if (Number.isNaN(ts)) continue;
    const key = e.actorId ?? e.actorName;
    const g = map.get(key) ?? {
      actorId: e.actorId ?? "",
      actorName: e.actorName,
      latestTs: ts,
      fields: new Set<string>(),
      editCount: 0,
    };
    g.latestTs = Math.max(g.latestTs, ts);
    if (e.field) g.fields.add(e.field);
    g.editCount += 1;
    // Keep the freshest display name if it ever varies across rows.
    if (ts >= g.latestTs) g.actorName = e.actorName;
    map.set(key, g);
  }
  return [...map.values()]
    .map((g) => ({
      actorId: g.actorId,
      actorName: g.actorName,
      latestTs: g.latestTs,
      fieldCount: g.fields.size,
      editCount: g.editCount,
    }))
    .sort((a, b) => b.latestTs - a.latestTs);
}

/** The most recent edit (max createdAt) + who made it. Null when no entries. */
export function latestEdit(entries: EditLogLike[]): { ts: number; actorName: string } | null {
  let best: { ts: number; actorName: string } | null = null;
  for (const e of entries) {
    const ts = Date.parse(e.createdAt);
    if (Number.isNaN(ts)) continue;
    if (!best || ts > best.ts) best = { ts, actorName: e.actorName };
  }
  return best;
}

/**
 * OPSP Review horizon → the OPSP source array that feeds it. The review table's
 * `rowIndex` is the position in these arrays (see `api/opsp/review/route.ts`
 * `extractSourceRows`), so an edit to `<array>.<i>` highlights review row `i`.
 */
export const REVIEW_PRIMARY_ARRAY: Record<string, string> = {
  quarter: "actionsQtr",
  yearly: "goalRows",
  "3to5year": "targetRows",
};

export const REVIEW_SECONDARY_ARRAY: Record<string, string> = {
  quarter: "rocks",
  yearly: "keyInitiatives",
  "3to5year": "keyThrusts",
};
