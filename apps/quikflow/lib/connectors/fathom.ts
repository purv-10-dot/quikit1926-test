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
  attendees: { name: string | null; email: string | null }[];
  recordingUrl: string | null;
  transcriptText: string | null;
  summary: string | null;
  actionItems: { text: string; assignee?: string | null; dueDate?: string | null }[];
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

function normalizeAttendees(raw: unknown): FathomMeeting["attendees"] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((a) => {
      if (typeof a === "string") return { name: null, email: str(a) };
      if (a && typeof a === "object") {
        const o = a as Record<string, unknown>;
        return {
          name: str(pick(o, "name", "display_name", "displayName", "full_name")),
          email: str(pick(o, "email", "email_address", "emailAddress")),
        };
      }
      return { name: null, email: null };
    })
    .filter((a) => a.name || a.email);
}

function normalizeActionItems(raw: unknown): FathomMeeting["actionItems"] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((a) => {
      if (typeof a === "string") return { text: a };
      if (a && typeof a === "object") {
        const o = a as Record<string, unknown>;
        const text = str(pick(o, "text", "description", "title", "content"));
        if (!text) return null;
        return {
          text,
          assignee: str(pick(o, "assignee", "owner", "assigned_to", "assignedTo")),
          dueDate: str(pick(o, "due_date", "dueDate", "due")),
        };
      }
      return null;
    })
    .filter((a): a is { text: string; assignee: string | null; dueDate: string | null } => !!a);
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
    attendees: normalizeAttendees(
      pick(m, "attendees", "invitees", "participants", "calendar_invitees", "calendarInvitees"),
    ),
    recordingUrl: str(pick(m, "recording_url", "recordingUrl", "url", "share_url", "shareUrl")),
    transcriptText: transcriptToText(pick(m, "transcript", "transcript_text", "transcriptText")),
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

/** Fetch just the transcript text for a recording, if not already inlined. */
export async function getTranscript(apiKey: string, recordingId: string): Promise<string | null> {
  const res = await fetch(`${FATHOM_API_BASE}/meetings/${encodeURIComponent(recordingId)}/transcript`, {
    headers: authHeaders(apiKey),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as Record<string, unknown>;
  return transcriptToText(pick(json, "transcript", "transcript_text", "transcriptText", "items"));
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
