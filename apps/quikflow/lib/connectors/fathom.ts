/**
 * Fathom.ai connector — a meeting-notetaker source (NOT a mailbox), so it does
 * NOT implement the `MailProvider` interface. Fathom authenticates with a
 * per-account **API key** (`X-Api-Key` header) generated in the Fathom settings
 * area; there is no OAuth redirect. This module is plain `fetch` (no SDK) and is
 * the single place that knows Fathom's REST shape + webhook signature scheme.
 *
 * Endpoints/paths are centralized here because Fathom's exact response shapes
 * can shift — the normalizer is deliberately tolerant of field-name variants so
 * a small API change doesn't ripple into the engine/UI.
 *
 * Docs: https://developers.fathom.ai
 */
import crypto from "node:crypto";

/** REST base; override in dev/tests via env. */
export const FATHOM_API_BASE = process.env.FATHOM_API_BASE ?? "https://api.fathom.ai/external/v1";

/** A normalized meeting — the shape carried on the `fathom.meeting.*` event. */
export interface FathomMeeting {
  recordingId: string;
  title: string | null;
  startedAt: string | null; // ISO-8601
  endedAt: string | null;
  durationMinutes: number | null;
  /**
   * Everyone Fathom associated with the meeting, from BOTH of its lists.
   *
   * Fathom's UI shows two visually distinct groups — calendar invitees (bare
   * email addresses) and identified people (named, with enrichment). They
   * arrive as separate arrays, and reading only the first one silently lost
   * whole people. `isInvitee`/`isIdentified` preserve that distinction so the
   * viewer can reproduce it; someone in both lists is ONE entry with both flags.
   */
  attendees: {
    name: string | null;
    email: string | null;
    isInvitee: boolean;
    isIdentified: boolean;
    linkedinUrl?: string | null;
  }[];
  recordingUrl: string | null;
  transcriptText: string | null;
  /**
   * The transcript in its STRUCTURED form, timestamps intact.
   *
   * `transcriptText` is a flattened "Speaker: text" rendering of this, and the
   * flattening DISCARDS every timestamp. QuikScale needs those timings for
   * evidence anchoring, time-windowed chunking and time-weighted coverage of
   * long meetings; without them it can only interpolate, which is honest but
   * strictly worse. Carrying the structured form alongside costs nothing and
   * changes no existing field — `transcriptText` is byte-for-byte unchanged,
   * so the transcript viewer and the DOCX export are unaffected.
   */
  transcriptSegments:
    | { speaker: string | null; text: string; timestamp: number | string | null }[]
    | null;
  summary: string | null;
  /**
   * Fathom's AI action items. Its own UI shows each with a timestamp ("@ 0:49")
   * and an assignee, both of which we previously threw away — the timestamp was
   * never parsed at all, and the assignee was read with a string-only helper, so
   * Fathom's object-shaped assignee became `null` without a trace.
   */
  actionItems: {
    text: string;
    assignee?: string | null;
    assigneeEmail?: string | null;
    dueDate?: string | null;
    /** Offset into the recording, in seconds. Drives the "@ 0:49" marker. */
    timestampSeconds?: number | null;
    completed?: boolean | null;
    /** Fathom's own id for the item, when it exposes one. */
    sourceId?: string | null;
  }[];
}

function authHeaders(apiKey: string): Record<string, string> {
  return { "X-Api-Key": apiKey, Accept: "application/json" };
}

/* --------------------------------- helpers -------------------------------- */

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function pick<T = unknown>(obj: Record<string, unknown>, ...keys: string[]): T | undefined {
  for (const k of keys) if (obj[k] != null) return obj[k] as T;
  return undefined;
}

/** Keys carrying calendar invitees — people who were asked to attend. */
const INVITEE_KEYS = ["attendees", "invitees", "calendar_invitees", "calendarInvitees"];
/** Keys carrying people Fathom actually identified — named, sometimes enriched. */
const IDENTIFIED_KEYS = ["participants", "team_members", "teamMembers", "identified_speakers", "speakers", "contacts"];

/** One raw attendee entry (string email or object) → our shape, ungrouped. */
function normalizeOneAttendee(a: unknown): { name: string | null; email: string | null; linkedinUrl: string | null } | null {
  if (typeof a === "string") {
    const email = str(a);
    return email ? { name: null, email, linkedinUrl: null } : null;
  }
  if (a && typeof a === "object") {
    const o = a as Record<string, unknown>;
    const name = str(pick(o, "name", "display_name", "displayName", "full_name"));
    const email = str(pick(o, "email", "email_address", "emailAddress"));
    if (!name && !email) return null;
    return { name, email, linkedinUrl: str(pick(o, "linkedin_url", "linkedinUrl", "linkedin")) };
  }
  return null;
}

/**
 * MERGE every attendee list Fathom sent, instead of taking the first non-null.
 *
 * `pick()` returns the first key that is present, so when Fathom sends
 * `calendar_invitees` AND `team_members` — which is exactly what its UI renders
 * as two separate groups — we were reading one array and silently discarding
 * the other. Whole people were missing from the app with no error anywhere.
 *
 * Dedupe is by lowercased email, falling back to lowercased name, and flags are
 * UNIONED: a person who is both invited and identified is one entry carrying
 * both, not a duplicate row.
 */
function mergeAttendees(m: Record<string, unknown>): FathomMeeting["attendees"] {
  const byKey = new Map<string, FathomMeeting["attendees"][number]>();

  const absorb = (raw: unknown, group: "invitee" | "identified") => {
    if (!Array.isArray(raw)) return;
    for (const entry of raw) {
      const a = normalizeOneAttendee(entry);
      if (!a) continue;
      const key = (a.email ?? a.name ?? "").toLowerCase();
      if (!key) continue;
      const existing = byKey.get(key);
      if (existing) {
        // Union: keep whichever list supplied the richer detail.
        existing.name = existing.name ?? a.name;
        existing.email = existing.email ?? a.email;
        existing.linkedinUrl = existing.linkedinUrl ?? a.linkedinUrl;
        if (group === "invitee") existing.isInvitee = true;
        else existing.isIdentified = true;
        continue;
      }
      byKey.set(key, {
        name: a.name,
        email: a.email,
        isInvitee: group === "invitee",
        isIdentified: group === "identified",
        linkedinUrl: a.linkedinUrl,
      });
    }
  };

  for (const k of INVITEE_KEYS) absorb(m[k], "invitee");
  for (const k of IDENTIFIED_KEYS) absorb(m[k], "identified");

  return [...byKey.values()];
}

/**
 * A person field that may be a bare string OR an object.
 *
 * `str()` returns null for anything non-string, so reading an assignee with it
 * meant Fathom's `{name, email}` assignee silently became `null` — the item
 * still rendered, just with nobody attached, which is indistinguishable from
 * "unassigned". Same tolerance `speakerName` already applies to transcript
 * speakers; this is that idea applied where it was missing.
 */
function personName(v: unknown): string | null {
  if (typeof v === "string") return str(v);
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return (
      str(pick(o, "name", "display_name", "displayName", "full_name")) ??
      str(pick(o, "email", "email_address", "emailAddress"))
    );
  }
  return null;
}

/** The email behind a person field, when it carries one. */
function personEmail(v: unknown): string | null {
  if (v && typeof v === "object") {
    return str(pick(v as Record<string, unknown>, "email", "email_address", "emailAddress"));
  }
  return typeof v === "string" && v.includes("@") ? str(v) : null;
}

/**
 * `"0:49"` / `"1:02:03"` / `"49"` → seconds.
 *
 * Deliberately a local copy rather than an import of QuikScale's
 * `parseTimestampMs`: quikflow must not depend on quikscale (they are separate
 * deployables and the dependency would be the wrong direction). Six lines is a
 * cheaper price than that coupling.
 */
export function clockToSeconds(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : null;
  if (typeof value !== "string") return null;
  const t = value.trim();
  if (!t) return null;
  const parts = t.split(":");
  if (parts.length === 1) {
    const n = Number(t);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }
  if (parts.length > 3) return null;
  const nums = parts.map(Number);
  if (nums.some((n) => !Number.isFinite(n) || n < 0)) return null;
  const [a, b, c] = nums;
  return parts.length === 3 ? a * 3600 + b * 60 + c : a * 60 + b;
}

/**
 * The `?timestamp=142.5` query param Fathom hangs off a playback link.
 *
 * This is the same shape QuikScale's summary-citation regex already documents
 * Fathom using (`([View](https://fathom.video/calls/883?timestamp=142.5))`), so
 * it is the most likely place a per-item offset actually lives.
 */
function timestampFromUrl(v: unknown): number | null {
  const url = str(v);
  if (!url) return null;
  const m = /[?&]timestamp=([\d.]+)/i.exec(url);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function normalizeActionItems(raw: unknown): FathomMeeting["actionItems"] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((a): FathomMeeting["actionItems"][number] | null => {
      if (typeof a === "string") {
        const text = str(a);
        return text ? { text, assignee: null, assigneeEmail: null, dueDate: null, timestampSeconds: null, completed: null, sourceId: null } : null;
      }
      if (a && typeof a === "object") {
        const o = a as Record<string, unknown>;
        const text = str(pick(o, "text", "description", "title", "content"));
        if (!text) return null;
        const assigneeRaw = pick(o, "assignee", "owner", "assigned_to", "assignedTo", "user");
        // Three plausible carriers for the offset, cheapest first. The URL form
        // is last because it is the most indirect but, per the citation format,
        // the most likely to actually be present.
        const timestampSeconds =
          clockToSeconds(pick(o, "timestamp", "recording_timestamp", "recordingTimestamp", "start_time", "startTime", "playback_seconds", "offset")) ??
          timestampFromUrl(pick(o, "recording_playback_url", "playback_url", "playbackUrl", "url", "link"));
        return {
          text,
          assignee: personName(assigneeRaw),
          assigneeEmail: personEmail(assigneeRaw),
          dueDate: str(pick(o, "due_date", "dueDate", "due")),
          timestampSeconds,
          completed: typeof pick(o, "completed", "is_completed", "isCompleted", "done") === "boolean"
            ? (pick(o, "completed", "is_completed", "isCompleted", "done") as boolean)
            : null,
          sourceId: str(pick(o, "id", "action_item_id", "actionItemId")),
        };
      }
      return null;
    })
    .filter((a): a is FathomMeeting["actionItems"][number] => !!a);
}

/** A transcript segment's speaker may be a plain name or a {display_name} object. */
function speakerName(v: unknown): string | null {
  if (typeof v === "string") return str(v);
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return str(pick(o, "display_name", "displayName", "name"));
  }
  return null;
}

/**
 * Keep the transcript's structure instead of flattening it.
 *
 * Same input as `transcriptToText`, but preserves the per-segment timestamp
 * that flattening throws away. Returns null when the recorder gave us a plain
 * string (nothing structured to preserve) so callers can tell "no timings
 * available" from "timings present but empty".
 */
function transcriptToSegments(
  raw: unknown,
): { speaker: string | null; text: string; timestamp: number | string | null }[] | null {
  if (!Array.isArray(raw)) return null;

  const segments = raw
    .map((seg) => {
      if (!seg || typeof seg !== "object") return null;
      const o = seg as Record<string, unknown>;
      const text = str(pick(o, "text", "content", "transcript"));
      if (!text) return null;
      const ts = pick(o, "timestamp", "start_time", "startTime", "start", "offset");
      return {
        speaker: speakerName(pick(o, "speaker", "speaker_name", "name")),
        text,
        timestamp:
          typeof ts === "number" || typeof ts === "string" ? ts : null,
      };
    })
    .filter((s): s is { speaker: string | null; text: string; timestamp: number | string | null } => s !== null);

  return segments.length ? segments : null;
}

function transcriptToText(raw: unknown): string | null {
  if (typeof raw === "string") return raw.trim() || null;
  // Fathom returns a structured transcript: { speaker: {display_name}, text, timestamp }[].
  if (Array.isArray(raw)) {
    const lines = raw
      .map((seg) => {
        if (typeof seg === "string") return seg;
        if (seg && typeof seg === "object") {
          const o = seg as Record<string, unknown>;
          const speaker = speakerName(pick(o, "speaker", "speaker_name", "name"));
          const text = str(pick(o, "text", "content", "transcript"));
          if (!text) return "";
          return speaker ? `${speaker}: ${text}` : text;
        }
        return "";
      })
      .filter(Boolean);
    return lines.length ? lines.join("\n") : null;
  }
  return null;
}

/** Turn a raw Fathom meeting object (webhook payload or list item) into our shape. */
export function normalizeMeeting(raw: unknown): FathomMeeting | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  // A webhook may nest the meeting under `meeting`/`recording`/`data`.
  const m = (pick<Record<string, unknown>>(o, "meeting", "recording", "data") ?? o) as Record<string, unknown>;

  // recording_id is a NUMBER in the live API — coerce to string (was dropping meetings).
  const ridRaw = pick(m, "recording_id", "recordingId", "id", "meeting_id", "meetingId", "share_id", "shareId");
  const recordingId = ridRaw == null ? null : String(ridRaw).trim() || null;
  if (!recordingId) return null;

  const startedAt = str(
    pick(m, "started_at", "startedAt", "start_time", "startTime", "recording_start_time", "scheduled_start_time", "created_at"),
  );
  const endedAt = str(
    pick(m, "ended_at", "endedAt", "end_time", "endTime", "recording_end_time", "scheduled_end_time"),
  );
  let durationMinutes = num(pick(m, "duration_minutes", "durationMinutes"));
  const durationSeconds = num(pick(m, "duration_seconds", "durationSeconds", "duration"));
  if (durationMinutes == null && durationSeconds != null) durationMinutes = Math.round(durationSeconds / 60);
  if (durationMinutes == null && startedAt && endedAt) {
    const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime();
    if (Number.isFinite(ms) && ms > 0) durationMinutes = Math.round(ms / 60000);
  }

  const summaryRaw = pick(m, "summary", "ai_summary", "aiSummary", "default_summary");
  const summary =
    typeof summaryRaw === "string"
      ? summaryRaw.trim() || null
      : summaryRaw && typeof summaryRaw === "object"
        ? str(pick(summaryRaw as Record<string, unknown>, "markdown_formatted", "markdown", "text", "content"))
        : null;

  return {
    recordingId,
    title: str(pick(m, "title", "meeting_title", "meetingTitle", "topic", "name")),
    startedAt,
    endedAt,
    durationMinutes,
    attendees: mergeAttendees(m),
    recordingUrl: str(pick(m, "recording_url", "recordingUrl", "url", "share_url", "shareUrl")),
    transcriptText: transcriptToText(pick(m, "transcript", "transcript_text", "transcriptText")),
    transcriptSegments: transcriptToSegments(
      pick(m, "transcript", "transcript_text", "transcriptText"),
    ),
    summary,
    actionItems: normalizeActionItems(pick(m, "action_items", "actionItems")),
  };
}

/**
 * Flatten a normalized meeting into the event payload the engine + save-transcript
 * consume. Shared by the poll scan and the webhook route so both emit an
 * identical shape. `meetingType` here is a duration-only guess; the authoritative
 * cadence is decided by QuikScale's matcher (which knows the client's windows).
 */
export function meetingToEventData(m: FathomMeeting): Record<string, unknown> {
  // Every attendee with an email, from BOTH lists. QuikScale's matcher resolves
  // a client by intersecting these against ClientMember, so wider recall is
  // strictly better here — a person Fathom identified but who was never on the
  // invite is still evidence of which client this meeting belongs to. If that
  // ever starts producing false matches, narrow this to `a.isInvitee`; the flag
  // is carried for exactly that reason.
  const emails = m.attendees.map((a) => a.email).filter((e): e is string => !!e);
  const meetingTypeGuess =
    m.durationMinutes != null
      ? m.durationMinutes <= 20
        ? "daily"
        : m.durationMinutes >= 45
          ? "weekly"
          : "unknown"
      : "unknown";
  return {
    recordingId: m.recordingId,
    title: m.title,
    startedAt: m.startedAt,
    endedAt: m.endedAt,
    durationMinutes: m.durationMinutes,
    attendees: m.attendees,
    attendeeEmails: emails.join(", "),
    attendeeCount: emails.length,
    recordingUrl: m.recordingUrl,
    transcriptText: m.transcriptText,
    transcriptSegments: m.transcriptSegments,
    summary: m.summary,
    actionItems: m.actionItems,
    hasActionItems: m.actionItems.length > 0,
    meetingType: meetingTypeGuess,
    clientMatched: false,
    clientName: "",
  };
}

/* ---------------------------------- REST ---------------------------------- */

/**
 * Validate an API key by making the cheapest authenticated call. Returns a
 * `label` (team/account name if the API exposes one) for the connection row.
 */
export async function validateKey(apiKey: string): Promise<{ ok: boolean; label?: string; error?: string }> {
  try {
    const res = await fetch(`${FATHOM_API_BASE}/meetings?limit=1`, { headers: authHeaders(apiKey) });
    if (res.status === 401 || res.status === 403) return { ok: false, error: "Invalid Fathom API key." };
    if (!res.ok) return { ok: false, error: `Fathom API error (${res.status}).` };
    // Try to derive a friendly label from a team-list call; non-fatal.
    let label: string | undefined;
    try {
      const teams = await fetch(`${FATHOM_API_BASE}/teams`, { headers: authHeaders(apiKey) });
      if (teams.ok) {
        const json = (await teams.json()) as { items?: { name?: string }[]; teams?: { name?: string }[] };
        label = (json.items ?? json.teams ?? [])[0]?.name;
      }
    } catch {
      /* ignore — label is optional */
    }
    return { ok: true, label };
  } catch (error: unknown) {
    return { ok: false, error: error instanceof Error ? error.message : "Fathom validation failed." };
  }
}

/** Overlap subtracted from the poll watermark so processing lag can't skip a
 * meeting created just before we polled. Re-fetched items collapse via dedupe. */
const POLL_OVERLAP_MS = 2 * 60 * 1000;

/**
 * List meetings created since `cursor` (an ISO-8601 watermark). Verified against
 * the live API: `/meetings` returns `{ items, next_cursor, limit }` and honors
 * `created_after` + the `include_*` flags. First poll (cursor null) seeds the
 * watermark to ~now and returns NO meetings, so we never backfill the whole
 * Fathom history. The watermark is a TIME window (advanced to now − overlap),
 * not a meeting's own timestamp, so it doesn't depend on per-object field names.
 * Follows `next_cursor` pages so a burst of >limit meetings isn't truncated.
 */
export async function listMeetingsSince(
  apiKey: string,
  cursor: string | null,
): Promise<{ meetings: FathomMeeting[]; nextCursor: string }> {
  const nextCursor = new Date(Date.now() - POLL_OVERLAP_MS).toISOString();
  if (!cursor) return { meetings: [], nextCursor };

  const meetings: FathomMeeting[] = [];
  let pageCursor: string | null = null;
  // Bound the page walk defensively (10 pages ≈ plenty for one poll interval).
  for (let page = 0; page < 10; page++) {
    const params = new URLSearchParams({
      created_after: cursor,
      include_transcript: "true",
      include_summary: "true",
      include_action_items: "true",
    });
    if (pageCursor) params.set("cursor", pageCursor);
    const res = await fetch(`${FATHOM_API_BASE}/meetings?${params.toString()}`, { headers: authHeaders(apiKey) });
    if (!res.ok) throw new Error(`Fathom list meetings failed (${res.status}).`);
    const json = (await res.json()) as Record<string, unknown>;
    const rawItems = (pick(json, "items", "meetings", "data", "results") as unknown[]) ?? [];
    for (const raw of rawItems) {
      const m = normalizeMeeting(raw);
      if (m) meetings.push(m);
    }
    const nc = pick<string>(json, "next_cursor", "nextCursor");
    if (!nc) break;
    pageCursor = nc;
  }
  return { meetings, nextCursor };
}

/**
 * Fetch the transcript for a recording, if not already inlined.
 *
 * Returns BOTH renderings from the one request: the flattened text and the
 * structured segments. Returning only the text (as this did) threw away the
 * per-turn timestamps on exactly the path that needs them most — a meeting
 * whose transcript wasn't inlined has no timings from anywhere else.
 */
export async function getTranscript(
  apiKey: string,
  recordingId: string,
): Promise<{ text: string | null; segments: FathomMeeting["transcriptSegments"] }> {
  const res = await fetch(`${FATHOM_API_BASE}/meetings/${encodeURIComponent(recordingId)}/transcript`, {
    headers: authHeaders(apiKey),
  });
  if (!res.ok) return { text: null, segments: null };
  const json = (await res.json()) as Record<string, unknown>;
  const raw = pick(json, "transcript", "transcript_text", "transcriptText", "items");
  return { text: transcriptToText(raw), segments: transcriptToSegments(raw) };
}

/**
 * Ensure a meeting carries its transcript, fetching it separately when the
 * list/webhook payload didn't inline one.
 *
 * Fathom's webhook payload frequently omits the transcript entirely, and
 * neither the poll scan nor the webhook route ever called `getTranscript` — so
 * those meetings landed in QuikScale with `rawText: null` and the user saw an
 * empty transcript with no explanation. Failures are swallowed on purpose: a
 * meeting with metadata but no transcript is still worth saving, and the next
 * poll can fill it in.
 */
export async function withTranscript(apiKey: string, m: FathomMeeting): Promise<FathomMeeting> {
  return withFullDetail(apiKey, m);
}

/**
 * Fetch one meeting's full record. Returns null on any non-2xx — including a
 * 404 if this endpoint turns out not to exist — because a detail miss must
 * degrade to "less data this tick", never to a lost meeting.
 */
export async function getMeetingDetail(apiKey: string, recordingId: string): Promise<FathomMeeting | null> {
  try {
    const params = new URLSearchParams({
      include_transcript: "true",
      include_summary: "true",
      include_action_items: "true",
    });
    const res = await fetch(
      `${FATHOM_API_BASE}/meetings/${encodeURIComponent(recordingId)}?${params.toString()}`,
      { headers: authHeaders(apiKey) },
    );
    if (!res.ok) return null;
    return normalizeMeeting(await res.json());
  } catch {
    return null;
  }
}

/** How fresh a meeting must be before we spend a request chasing missing parts. */
const DETAIL_BACKFILL_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Fill in whatever the list/webhook payload left out — transcript, summary AND
 * action items.
 *
 * This exists because of a silent, unrecoverable data-loss path: Fathom's
 * webhook announces that a recording is ready rather than carrying it, so a
 * payload with no summary was saved as `summary: null` and NOTHING ever read it
 * again. The meeting kept an empty summary forever. Same for action items.
 *
 * COST CONTROL. In the healthy case (everything inlined) this makes ZERO extra
 * requests and returns the input untouched. Only when something is missing does
 * it spend one detail request, which may fill all three gaps at once.
 *
 * The awkward part, stated rather than hidden: an empty `actionItems` cannot be
 * told apart from "Fathom generated none for this meeting", so a genuinely
 * action-item-free meeting would pay for a detail fetch every time it is seen.
 * The freshness window bounds that — after 24h we only chase a missing
 * transcript or summary, which are unambiguous absences.
 */
export async function withFullDetail(apiKey: string, m: FathomMeeting): Promise<FathomMeeting> {
  const needsTranscript = !m.transcriptText && !(m.transcriptSegments && m.transcriptSegments.length > 0);
  const needsSummary = !m.summary;
  const startedMs = m.startedAt ? new Date(m.startedAt).getTime() : NaN;
  const isFresh = !Number.isFinite(startedMs) || Date.now() - startedMs < DETAIL_BACKFILL_WINDOW_MS;
  const needsActions = m.actionItems.length === 0 && isFresh;

  if (!needsTranscript && !needsSummary && !needsActions) return m;

  let out = m;

  const detail = await getMeetingDetail(apiKey, m.recordingId);
  if (detail) {
    // Merge field-by-field. A present value is never overwritten with a null —
    // the payload we already have is at least as trustworthy as the refetch.
    out = {
      ...out,
      transcriptText: out.transcriptText ?? detail.transcriptText,
      transcriptSegments:
        out.transcriptSegments && out.transcriptSegments.length > 0
          ? out.transcriptSegments
          : detail.transcriptSegments,
      summary: out.summary ?? detail.summary,
      actionItems: out.actionItems.length > 0 ? out.actionItems : detail.actionItems,
      attendees: out.attendees.length > 0 ? out.attendees : detail.attendees,
      recordingUrl: out.recordingUrl ?? detail.recordingUrl,
      title: out.title ?? detail.title,
      durationMinutes: out.durationMinutes ?? detail.durationMinutes,
    };
  }

  // The detail endpoint may not exist, or may not inline the transcript. Fall
  // back to the dedicated transcript endpoint, which we know is real.
  const stillNeedsTranscript = !out.transcriptText && !(out.transcriptSegments && out.transcriptSegments.length > 0);
  if (stillNeedsTranscript) {
    try {
      const { text, segments } = await getTranscript(apiKey, m.recordingId);
      if (text || segments) {
        out = {
          ...out,
          transcriptText: text ?? out.transcriptText,
          transcriptSegments: segments ?? out.transcriptSegments,
        };
      }
    } catch {
      /* a meeting with metadata but no transcript is still worth saving */
    }
  }

  return out;
}

/* ------------------------------- Webhooks --------------------------------- */

/**
 * Verify a Fathom webhook using the Standard Webhooks (Svix) scheme:
 *   signed content = `${webhook-id}.${webhook-timestamp}.${rawBody}`
 *   signature      = base64( HMAC_SHA256(secret, signedContent) )
 * The `webhook-signature` header is a space-separated list of `v1,<sig>` values.
 * The secret is the base64 payload after the `whsec_` prefix. Rejects stamps
 * older than 5 minutes (replay protection). Constant-time compare.
 */
export function verifyWebhookSignature(
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  rawBody: string,
  secret: string,
): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const skewSec = Math.abs(Date.now() / 1000 - ts);
  if (skewSec > 5 * 60) return false;

  const key = secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret;
  let keyBuf: Buffer;
  try {
    keyBuf = Buffer.from(key, "base64");
  } catch {
    return false;
  }
  const signed = `${id}.${timestamp}.${rawBody}`;
  const expected = crypto.createHmac("sha256", keyBuf).update(signed).digest("base64");

  const expectedBuf = Buffer.from(expected);
  for (const part of signature.split(" ")) {
    const sig = part.includes(",") ? part.split(",")[1] : part;
    if (!sig) continue;
    const sigBuf = Buffer.from(sig);
    if (sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return true;
    }
  }
  return false;
}
