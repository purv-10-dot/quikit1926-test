/**
 * Exporting selected WWW candidates into the WWW module.
 *
 * ONE WRITE PATH, NOT TWO
 * -----------------------
 * Every item is created by calling `POST /api/www` — the same route the WWW
 * module's own Add button uses — with the caller's session forwarded. Inserting
 * `WWWItem` rows directly from here would be shorter and would silently skip
 * the Zod schema, the 409 duplicate guard, the per-assignee fan-out, the
 * `www.created` QuikFlow event, the audit trail and the assignment
 * notification. That divergence does not fail loudly; it surfaces weeks later
 * as "why didn't this WWW notify anyone?".
 *
 * PARTIAL SUCCESS IS NORMAL, AND REPORTED
 * ---------------------------------------
 * One duplicate must not roll back the other nine. There is deliberately no
 * transaction spanning the batch: each item is already atomic inside
 * `POST /api/www`, and the caller gets a per-item outcome so the UI can say
 * exactly what happened to each row rather than "something went wrong".
 *
 * SEQUENTIAL, AND CAPPED
 * ----------------------
 * `POST /api/www` carries its own per-user rate limit. Firing a batch at it in
 * parallel would trip that limit and turn a successful export into a partial
 * one for no reason. The cap keeps a batch inside the serverless duration
 * ceiling.
 *
 * See `docs/17-ai-meeting-rhythm-architecture.md` §I.5.
 */

import { db } from "@/lib/db";
import { linkCandidate } from "@/lib/reports/newWww";

/** Upper bound on one batch. See the header note on rate limiting. */
export const MAX_EXPORT_BATCH = 25;

export interface ExportDraft {
  factId: string;
  /** Owner. Required — never defaulted, never inferred from the speaker alone. */
  who: string;
  whoIds?: string[];
  what: string;
  /** ISO date. Required unless `dueDateTBD`. */
  when?: string;
  dueDateTBD?: boolean;
  category?: string | null;
  notes?: string | null;
}

export type SkipReason =
  /** No owner supplied, and the bridge would only have been guessing. */
  | "OWNER_REQUIRED"
  /** Neither a date nor an explicit To-Be-Decided. */
  | "WHEN_REQUIRED"
  /** No action text. */
  | "WHAT_REQUIRED"
  /** The candidate does not belong to this org, or to this meeting. */
  | "NOT_FOUND"
  /** `POST /api/www` refused for some other reason; `message` carries it. */
  | "REJECTED";

export interface ExportOutcome {
  created: { factId: string; wwwItemId: string }[];
  /** Already exported on an earlier press — returned, never duplicated. */
  alreadyCreated: { factId: string; wwwItemId: string }[];
  /** The WWW module already holds this commitment for this person and day. */
  duplicates: { factId: string; message: string }[];
  skipped: { factId: string; reason: SkipReason; message?: string }[];
}

const empty = (): ExportOutcome => ({
  created: [],
  alreadyCreated: [],
  duplicates: [],
  skipped: [],
});

export interface ExportContext {
  orgId: string;
  /** Origin of the incoming request, so the self-call reaches this deployment. */
  origin: string;
  /** The caller's cookie. Forwarded so the item is created AS THE HUMAN. */
  cookie: string;
  /** When set, a candidate from any other meeting is refused. */
  transcriptId?: string;
  /** When set, candidates must belong to one of these meetings. */
  transcriptIds?: string[];
}

/**
 * Create real WWW items from selected candidates.
 *
 * Validation is repeated here even though the UI disables an incomplete row:
 * the endpoint is reachable directly, and "the button was greyed out" is not a
 * server-side guarantee. Inventing a due date for an undated commitment is the
 * failure the requirement document names explicitly, so a missing date is
 * refused rather than filled.
 */
export async function exportWwwCandidates(
  ctx: ExportContext,
  drafts: ExportDraft[],
): Promise<ExportOutcome> {
  const out = empty();
  if (drafts.length === 0) return out;

  const scope =
    ctx.transcriptId !== undefined
      ? { transcriptId: ctx.transcriptId }
      : ctx.transcriptIds !== undefined
        ? { transcriptId: { in: ctx.transcriptIds } }
        : {};

  const facts = await db.meetingWwwFact.findMany({
    where: {
      id: { in: drafts.map((d) => d.factId) },
      orgId: ctx.orgId,
      deletedAt: null,
      ...scope,
    },
    select: { id: true, linkedWwwItemId: true },
  });
  const byId = new Map(facts.map((f) => [f.id, f]));

  for (const draft of drafts) {
    const fact = byId.get(draft.factId);
    if (!fact) {
      out.skipped.push({ factId: draft.factId, reason: "NOT_FOUND" });
      continue;
    }

    if (fact.linkedWwwItemId) {
      // Idempotent against a double-click, and against re-exporting a row the
      // user already exported in an earlier session.
      out.alreadyCreated.push({ factId: draft.factId, wwwItemId: fact.linkedWwwItemId });
      continue;
    }

    const what = draft.what?.trim();
    if (!what) {
      out.skipped.push({ factId: draft.factId, reason: "WHAT_REQUIRED" });
      continue;
    }
    const owners = draft.whoIds?.length ? draft.whoIds : draft.who ? [draft.who] : [];
    if (owners.length === 0) {
      out.skipped.push({ factId: draft.factId, reason: "OWNER_REQUIRED" });
      continue;
    }
    if (!draft.dueDateTBD && !draft.when) {
      out.skipped.push({ factId: draft.factId, reason: "WHEN_REQUIRED" });
      continue;
    }

    const body = {
      who: owners[0],
      whoIds: owners,
      what,
      ...(draft.dueDateTBD ? { dueDateTBD: true } : { when: draft.when }),
      ...(draft.category ? { category: draft.category } : {}),
      ...(draft.notes ? { notes: draft.notes } : {}),
    };

    const res = await fetch(`${ctx.origin}/api/www`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: ctx.cookie },
      body: JSON.stringify(body),
    });
    const payload = (await res.json().catch(() => null)) as
      | { success?: boolean; data?: { id?: string }; error?: string }
      | null;

    if (res.status === 409) {
      // Not a failure: the commitment is already recorded. Reported so the row
      // can say so rather than looking like it silently did nothing.
      out.duplicates.push({
        factId: draft.factId,
        message: payload?.error ?? "This WWW item already exists.",
      });
      continue;
    }

    if (!res.ok || !payload?.success || !payload.data?.id) {
      out.skipped.push({
        factId: draft.factId,
        reason: "REJECTED",
        message: payload?.error ?? "The WWW item could not be created.",
      });
      continue;
    }

    await linkCandidate(ctx.orgId, draft.factId, payload.data.id);
    out.created.push({ factId: draft.factId, wwwItemId: payload.data.id });
  }

  return out;
}
