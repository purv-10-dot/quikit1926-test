/**
 * Mail-connector facade — the single surface the OAuth routes, the outbound
 * send action, and the inbound poll scan use. It owns the WfConnection store
 * (tokens encrypted via ./crypto), token refresh, and provider resolution, so
 * callers never touch Prisma columns or provider REST directly.
 */
import { db } from "@/lib/db";
import { decryptSecret, encryptSecret } from "./crypto";
import { GMAIL } from "./gmail";
import { OUTLOOK } from "./microsoft";
import { TEAMS } from "./teams";
import { CalendarEventNotFoundError } from "./types";
import type {
  CalendarEventInput,
  CalendarEventResult,
  CalendarEventView,
  CalendarProvider,
  CalendarProviderId,
  MailMessage,
  MailProvider,
  MailProviderId,
  OAuthProvider,
  OAuthProviderId,
  TokenSet,
} from "./types";

export * from "./types";
export { encryptSecret, decryptSecret } from "./crypto";
export { signState, verifyState } from "./state";

const PROVIDERS: Record<string, MailProvider> = { gmail: GMAIL, outlook: OUTLOOK };
const CALENDAR_PROVIDERS: Record<string, CalendarProvider> = { teams: TEAMS };

/**
 * Every OAuth-connectable provider (mail + calendar). The authorize/callback
 * routes and token refresh only need the OAuth half, so they resolve through
 * this superset registry.
 */
const OAUTH_PROVIDERS: Record<string, OAuthProvider> = { ...PROVIDERS, ...CALENDAR_PROVIDERS };

/** All mail-provider ids (the WfProvider values QuikFlow polls / sends through). */
export const MAIL_PROVIDER_IDS: MailProviderId[] = ["gmail", "outlook"];

/** All calendar-provider ids (Microsoft Teams calendar today). */
export const CALENDAR_PROVIDER_IDS: CalendarProviderId[] = ["teams"];

export function getMailProvider(id: string): MailProvider | undefined {
  return PROVIDERS[id];
}

export function isMailProvider(id: string): id is MailProviderId {
  return id in PROVIDERS;
}

export function getCalendarProvider(id: string): CalendarProvider | undefined {
  return CALENDAR_PROVIDERS[id];
}

export function isCalendarProvider(id: string): id is CalendarProviderId {
  return id in CALENDAR_PROVIDERS;
}

/** Resolve any OAuth-connectable provider (mail or calendar). */
export function getOAuthProvider(id: string): OAuthProvider | undefined {
  return OAUTH_PROVIDERS[id];
}

export function isOAuthProvider(id: string): id is OAuthProviderId {
  return id in OAUTH_PROVIDERS;
}

/**
 * This app's own public origin (UAT: https://uatflow.quikit.ai).
 *
 * Resolved per-call, never at module scope, so `next build` can import this
 * module while collecting page data without a live env.
 *
 * In production a missing QUIKFLOW_URL is fatal rather than a silent
 * localhost fallback: the value ends up in OAuth redirect URIs, and
 * "http://localhost:3014/api/connections/gmail/callback" does not match the
 * registered console URI — the consent screen fails with a redirect_uri_mismatch
 * that looks like a provider misconfiguration instead of a missing env var.
 * See docs/engineering/prod-safety-rules.md.
 */
export function quikflowBaseUrl(): string {
  const base = process.env.QUIKFLOW_URL;
  if (base) return base.replace(/\/$/, "");
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "QUIKFLOW_URL is not set. It is required in production to build OAuth " +
        "redirect URIs (e.g. https://uatflow.quikit.ai).",
    );
  }
  return "http://localhost:3014"; // prod-safety-allow: dev-only, guarded above
}

/** The OAuth redirect URI for a provider (must match the console registration). */
export function redirectUriFor(provider: string): string {
  return `${quikflowBaseUrl()}/api/connections/${provider}/callback`;
}

/** A row from WfConnection with the columns the facade reads. */
interface StoredConnection {
  id: string;
  orgId: string;
  provider: string;
  label: string;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: Date | null;
  settings?: unknown;
}

/** Upsert (org, provider, mailbox) with freshly-encrypted tokens. */
export async function saveMailConnection(
  orgId: string,
  userId: string,
  provider: OAuthProviderId,
  tokens: TokenSet,
): Promise<{ id: string; label: string }> {
  const encAccess = encryptSecret(tokens.accessToken);
  const encRefresh = tokens.refreshToken ? encryptSecret(tokens.refreshToken) : undefined;
  const row = await db.wfConnection.upsert({
    where: { orgId_provider_label: { orgId, provider, label: tokens.email } },
    create: {
      orgId,
      provider,
      label: tokens.email,
      status: "connected",
      createdBy: userId,
      accessToken: encAccess,
      refreshToken: encRefresh ?? null,
      scopes: tokens.scopes,
      expiresAt: tokens.expiresAt,
    },
    update: {
      status: "connected",
      accessToken: encAccess,
      // Keep the existing refresh token if the provider didn't re-issue one.
      ...(encRefresh ? { refreshToken: encRefresh } : {}),
      scopes: tokens.scopes,
      expiresAt: tokens.expiresAt,
    },
    select: { id: true, label: true },
  });
  return row;
}

/* ----------------------------- API-key providers ---------------------------- */
/**
 * Non-OAuth, non-mail providers (Fathom.ai today) authenticate with a single
 * API key. We reuse WfConnection's encrypted columns: `accessToken` holds the
 * encrypted API key, `refreshToken` optionally holds an encrypted webhook
 * signing secret. `expiresAt` stays null (API keys don't expire).
 */
export const FATHOM_PROVIDER_ID = "fathom" as const;

/** Upsert an API-key connection (encrypted at rest). One row per (org, provider, label). */
export async function saveApiKeyConnection(
  orgId: string,
  userId: string,
  provider: string,
  label: string,
  apiKey: string,
  opts?: { webhookSecret?: string },
): Promise<{ id: string; label: string }> {
  const encKey = encryptSecret(apiKey);
  const encWebhook = opts?.webhookSecret ? encryptSecret(opts.webhookSecret) : undefined;
  return db.wfConnection.upsert({
    where: { orgId_provider_label: { orgId, provider: provider as never, label } },
    create: {
      orgId,
      provider: provider as never,
      label,
      status: "connected",
      createdBy: userId,
      accessToken: encKey,
      refreshToken: encWebhook ?? null,
      scopes: [],
      expiresAt: null,
    },
    update: {
      status: "connected",
      accessToken: encKey,
      ...(encWebhook ? { refreshToken: encWebhook } : {}),
    },
    select: { id: true, label: true },
  });
}

/** Decrypt the API key for an org's first connected Fathom account (or null). */
export async function getFathomKey(
  orgId: string,
): Promise<{ id: string; apiKey: string; webhookSecret: string | null } | null> {
  const conn = await db.wfConnection.findFirst({
    where: { orgId, provider: FATHOM_PROVIDER_ID as never, status: "connected" },
    orderBy: { createdAt: "asc" },
    select: { id: true, accessToken: true, refreshToken: true },
  });
  if (!conn?.accessToken) return null;
  return {
    id: conn.id,
    apiKey: decryptSecret(conn.accessToken),
    webhookSecret: conn.refreshToken ? decryptSecret(conn.refreshToken) : null,
  };
}

const EXPIRY_SKEW_MS = 60_000;

/**
 * Return a valid access token for a connection, refreshing (and persisting the
 * new token) when it's within a minute of expiry. Throws if a refresh is needed
 * but no refresh token is stored (user must reconnect).
 */
export async function getFreshAccessToken(conn: StoredConnection): Promise<string> {
  const provider = getOAuthProvider(conn.provider);
  if (!provider) throw new Error(`Unknown OAuth provider "${conn.provider}".`);

  const notExpired = conn.expiresAt && conn.expiresAt.getTime() - EXPIRY_SKEW_MS > Date.now();
  if (conn.accessToken && notExpired) return decryptSecret(conn.accessToken);

  if (!conn.refreshToken) throw new Error("Connection has no refresh token — reconnect required.");
  const refreshed = await provider.refresh(decryptSecret(conn.refreshToken));
  await db.wfConnection.update({
    where: { id: conn.id },
    data: {
      status: "connected",
      accessToken: encryptSecret(refreshed.accessToken),
      expiresAt: refreshed.expiresAt,
      ...(refreshed.refreshToken ? { refreshToken: encryptSecret(refreshed.refreshToken) } : {}),
    },
  });
  return refreshed.accessToken;
}

const CONNECTION_SELECT = {
  id: true,
  orgId: true,
  provider: true,
  label: true,
  accessToken: true,
  refreshToken: true,
  expiresAt: true,
  settings: true,
} as const;

/**
 * Resolve a comma-separated `to`/`cc` value that may mix real addresses with
 * QuikScale user ids (what `{{trigger.owner}}` resolves to) into a list of email
 * addresses. Entries containing "@" pass through; the rest are looked up in the
 * org's active members. Org-scoped, so a cross-org id never resolves. Unknown
 * ids are dropped.
 */
export async function resolveRecipients(orgId: string, raw: string): Promise<string> {
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const emails: string[] = [];
  const ids: string[] = [];
  for (const p of parts) (p.includes("@") ? emails : ids).push(p);

  if (ids.length > 0) {
    const members = await db.orgMember.findMany({
      where: { orgId, userId: { in: ids } },
      select: { userId: true, user: { select: { email: true } } },
    });
    const byId = new Map(members.map((m) => [m.userId, m.user.email]));
    for (const id of ids) {
      const email = byId.get(id);
      if (email) emails.push(email);
    }
  }
  // De-dupe while preserving order.
  return [...new Set(emails)].join(", ");
}

/**
 * Send a message from an org's connected mailbox. `providerHint` pins a provider
 * (gmail.send / outlook.send); when null, the oldest connected mailbox is used
 * (the provider-agnostic email.send). Returns null when the org has no matching
 * connected mailbox, so the action can skip cleanly rather than fail.
 */
export async function sendMailForOrg(
  orgId: string,
  providerHint: MailProviderId | null,
  msg: MailMessage,
  opts?: { connectionId?: string },
): Promise<{ id: string; from: string; provider: string } | null> {
  // Resolve owner/user ids to real addresses before we bother finding a mailbox.
  const to = await resolveRecipients(orgId, msg.to);
  if (!to) throw new Error(`No email address resolved for recipient "${msg.to}"`);
  const cc = msg.cc ? await resolveRecipients(orgId, msg.cc) : undefined;

  const conn = await db.wfConnection.findFirst({
    where: {
      orgId,
      status: "connected",
      // A specific "From account" (the builder's picker) wins; otherwise the
      // provider hint (gmail.send/outlook.send) or the oldest connected mailbox.
      ...(opts?.connectionId
        ? { id: opts.connectionId }
        : { provider: providerHint ? { equals: providerHint } : { in: MAIL_PROVIDER_IDS } }),
    },
    orderBy: { createdAt: "asc" },
    select: CONNECTION_SELECT,
  });
  if (!conn) return null;

  const provider = getMailProvider(conn.provider);
  if (!provider) return null;
  const accessToken = await getFreshAccessToken(conn);
  const sent = await provider.sendMessage(accessToken, conn.label, { ...msg, to, cc: cc || undefined });
  return { id: sent.id, from: conn.label, provider: conn.provider };
}

/**
 * Resolve the org's connected calendar. A specific connectionId wins; otherwise
 * the oldest connected calendar provider (Microsoft Teams today). Returns null
 * (not throws) when the org has none, so actions can skip cleanly.
 */
async function findCalendarConnection(
  orgId: string,
  connectionId?: string,
): Promise<{ conn: StoredConnection; provider: CalendarProvider } | null> {
  const conn = await db.wfConnection.findFirst({
    where: {
      orgId,
      status: "connected",
      ...(connectionId ? { id: connectionId } : { provider: { in: CALENDAR_PROVIDER_IDS } }),
    },
    orderBy: { createdAt: "asc" },
    select: CONNECTION_SELECT,
  });
  if (!conn) return null;
  const provider = getCalendarProvider(conn.provider);
  if (!provider) return null;
  return { conn, provider };
}

// Sentinel externalEventId for a WfCalendarLink row that has been claimed
// (reserved ahead of the outbound Graph call) but not yet resolved to a real
// event id. See createCalendarEventForOrg's `link` branch.
const PENDING_EVENT_ID = "__pending__";

/** Identifies the source-app record a calendar event represents, for idempotency. */
export interface CalendarLinkKey {
  /** Source record type, e.g. "clientMaster". */
  refType: string;
  /** Source record id, e.g. the Client id. */
  refId: string;
  /** "daily" | "weekly" | "" (a single event per record). */
  kind?: string;
}

/**
 * Create (or idempotently update) a calendar event on an org's connected
 * Microsoft calendar. Attendee owner/user ids are resolved to emails. When a
 * `link` key is supplied, a stored WfCalendarLink for (org, refType, refId,
 * kind) makes a re-run/edit PATCH the existing event instead of creating a
 * duplicate. Returns null when the org has no connected calendar (skip cleanly).
 */
export async function createCalendarEventForOrg(
  orgId: string,
  event: CalendarEventInput,
  opts?: { connectionId?: string; link?: CalendarLinkKey; createdBy?: string },
): Promise<(CalendarEventResult & { organizer: string; updated: boolean }) | null> {
  const found = await findCalendarConnection(orgId, opts?.connectionId);
  if (!found) return null;

  // Resolve any QuikScale user ids among the attendees to real addresses.
  const attendees = event.attendees?.length
    ? (await resolveRecipients(orgId, event.attendees.join(",")))
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  // Invite Fathom's notetaker bot on online meetings so it auto-joins and
  // records — no manual "Start Recording" click in Fathom. Per-connection
  // setting wins (org admins set this per Fathom account on /connections);
  // falls back to the org-wide env var; no-op when neither is set.
  const connSettings = found.conn.settings as { notetakerEmail?: string } | null | undefined;
  const notetaker = connSettings?.notetakerEmail?.trim() || process.env.FATHOM_NOTETAKER_EMAIL?.trim();
  if (event.onlineMeeting && notetaker && !attendees.some((a) => a.toLowerCase() === notetaker.toLowerCase())) {
    attendees.push(notetaker);
  }

  const accessToken = await getFreshAccessToken(found.conn);
  const payload = { ...event, attendees };
  const link = opts?.link;

  if (link) {
    const kind = link.kind ?? "";
    const where = { orgId_refType_refId_kind: { orgId, refType: link.refType, refId: link.refId, kind } } as const;
    // Two independent callers (e.g. the auto-fired clientMaster.created
    // workflow AND the direct "Create Teams meetings" button) can target the
    // exact same (orgId, refType, refId, kind) concurrently. A plain
    // findUnique-then-create isn't atomic — both could see "no link yet" and
    // both call provider.createEvent(), producing two real Teams events even
    // though the DB write below only ever keeps one row.
    //
    // The outbound Graph call can't be part of a DB transaction (it's an
    // external side effect, not something Postgres can roll back), so a
    // single "lock, call Graph, write" transaction still leaves a gap: if
    // Graph succeeds but the transaction fails to commit afterwards, the
    // created event is real but untracked, and the next attempt (a retry or
    // the second caller) sees no link and creates a genuine duplicate.
    //
    // Instead this claims a PENDING row in its own short, lock-serialized
    // transaction BEFORE calling Graph — so the claim survives independently
    // of whatever happens next. Only the caller that wins the claim calls
    // Graph; everyone else PATCHes the existing real link or, for a
    // still-pending claim, waits/bails rather than creating a second event.
    // A claim that crashes before the finishing update is reaped as stale
    // after CLAIM_STALE_MS so the record isn't permanently stuck.
    const lockKey = `wf-calendar-link:${orgId}:${link.refType}:${link.refId}:${kind}`;
    const CLAIM_STALE_MS = 2 * 60_000;

    const claim = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
      const existing = await tx.wfCalendarLink.findUnique({ where });
      if (existing && existing.externalEventId !== PENDING_EVENT_ID) {
        return { mode: "existing" as const, row: existing };
      }
      if (existing && Date.now() - existing.updatedAt.getTime() < CLAIM_STALE_MS) {
        return { mode: "in-flight" as const, row: existing };
      }
      const row = await tx.wfCalendarLink.upsert({
        where,
        create: {
          orgId,
          provider: found.conn.provider as never,
          connectionId: found.conn.id,
          refType: link.refType,
          refId: link.refId,
          kind,
          externalEventId: PENDING_EVENT_ID,
          createdBy: opts?.createdBy ?? "system",
        },
        update: { externalEventId: PENDING_EVENT_ID, connectionId: found.conn.id, provider: found.conn.provider as never },
      });
      return { mode: "claimed" as const, row };
    });

    if (claim.mode === "in-flight") {
      throw new Error("Calendar event creation already in progress for this record — try again shortly.");
    }

    if (claim.mode === "existing") {
      try {
        const updated = await found.provider.updateEvent(accessToken, claim.row.externalEventId, payload);
        await db.wfCalendarLink.update({
          where: { id: claim.row.id },
          data: {
            connectionId: found.conn.id,
            provider: found.conn.provider as never,
            webLink: updated.webLink ?? null,
            joinUrl: updated.joinUrl ?? null,
          },
        });
        return { ...updated, organizer: found.conn.label, updated: true };
      } catch (e) {
        // Stale link: the stored event id no longer exists on the connected
        // calendar (deleted manually, or orphaned by a Teams reconnect since
        // this link was created). Self-heal by recreating the event and
        // re-pointing the link at the new id, instead of failing every run
        // forever on a dead reference.
        if (!(e instanceof CalendarEventNotFoundError)) throw e;
        const recreated = await found.provider.createEvent(accessToken, payload);
        await db.wfCalendarLink.update({
          where: { id: claim.row.id },
          data: {
            connectionId: found.conn.id,
            provider: found.conn.provider as never,
            externalEventId: recreated.id,
            webLink: recreated.webLink ?? null,
            joinUrl: recreated.joinUrl ?? null,
          },
        });
        return { ...recreated, organizer: found.conn.label, updated: false };
      }
    }

    // claim.mode === "claimed" — we alone own creating this event.
    const created = await found.provider.createEvent(accessToken, payload);
    await db.wfCalendarLink.update({
      where: { id: claim.row.id },
      data: { externalEventId: created.id, webLink: created.webLink ?? null, joinUrl: created.joinUrl ?? null },
    });
    return { ...created, organizer: found.conn.label, updated: false };
  }

  const created = await found.provider.createEvent(accessToken, payload);
  return { ...created, organizer: found.conn.label, updated: false };
}

/**
 * Read events overlapping [startIso, endIso) from an org's connected calendar.
 * Returns null when the org has no connected calendar.
 */
export async function listCalendarForOrg(
  orgId: string,
  startIso: string,
  endIso: string,
  opts?: { connectionId?: string },
): Promise<{ organizer: string; events: CalendarEventView[] } | null> {
  const found = await findCalendarConnection(orgId, opts?.connectionId);
  if (!found) return null;
  const accessToken = await getFreshAccessToken(found.conn);
  const events = await found.provider.listCalendarView(accessToken, startIso, endIso);
  return { organizer: found.conn.label, events };
}

/**
 * Delete the calendar event(s) a workflow created for a source record — all
 * kinds, or just one `kind`. Deletes on the calendar via the stored connection
 * then drops the WfCalendarLink. Best-effort per event (an already-gone event
 * still drops its link), and idempotent (no links → deleted: 0).
 */
export async function deleteCalendarEventsForOrg(
  orgId: string,
  ref: CalendarLinkKey,
): Promise<{ deleted: number }> {
  const links = await db.wfCalendarLink.findMany({
    where: {
      orgId,
      refType: ref.refType,
      refId: ref.refId,
      ...(ref.kind ? { kind: ref.kind } : {}),
    },
    select: { id: true, connectionId: true, externalEventId: true },
  });

  let deleted = 0;
  for (const link of links) {
    const conn = await db.wfConnection.findFirst({
      where: { id: link.connectionId, orgId },
      select: CONNECTION_SELECT,
    });
    const provider = conn ? getCalendarProvider(conn.provider) : undefined;
    if (conn && provider) {
      try {
        const accessToken = await getFreshAccessToken(conn);
        await provider.deleteEvent(accessToken, link.externalEventId);
      } catch {
        // Event may already be gone / token expired — drop the link regardless
        // so we don't leak a dangling mapping.
      }
    }
    await db.wfCalendarLink.delete({ where: { id: link.id } });
    deleted++;
  }
  return { deleted };
}

/** Is a Microsoft (Teams) calendar connected for this org? (light DB check). */
export async function isCalendarConnectedForOrg(orgId: string): Promise<boolean> {
  return (await findCalendarConnection(orgId)) !== null;
}

/** Local "YYYY-MM-DDTHH:mm:00" from a date + "HH:mm", or null when malformed. */
function composeLocalDateTime(date: string, time: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{1,2}:\d{2}$/.test(time)) return null;
  const [h, m] = time.split(":");
  return `${date}T${h.padStart(2, "0")}:${m}:00`;
}

const DEFAULT_WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"];

/** One meeting window from a client (times as HH:mm, dates as YYYY-MM-DD). */
export interface ClientMeetingWindow {
  start: string;
  end: string;
  /** Weekday names — daily huddle days, or a single weekly-meeting day. Empty ⇒ Mon–Fri. */
  days?: string[];
  startDate: string;
  until?: string | null;
}

/** The two recurring meetings a Client Master row schedules on the calendar. */
export interface ClientMeetingSpec {
  refType: string;
  refId: string;
  name: string;
  timeZone: string;
  attendees: string[];
  daily?: ClientMeetingWindow;
  weekly?: ClientMeetingWindow;
  createdBy?: string;
}

type ScheduledEvent = (CalendarEventResult & { organizer: string; updated: boolean }) | null;

function buildMeetingEvent(title: string, spec: ClientMeetingSpec, w: ClientMeetingWindow): CalendarEventInput | null {
  const start = composeLocalDateTime(w.startDate, w.start);
  const end = composeLocalDateTime(w.startDate, w.end);
  if (!start || !end) return null;
  const days = w.days && w.days.length ? w.days : DEFAULT_WEEKDAYS;
  return {
    subject: `${title} — ${spec.name}`,
    start,
    end,
    timeZone: spec.timeZone,
    attendees: spec.attendees,
    onlineMeeting: true,
    recurrence: { pattern: "weekly", interval: 1, daysOfWeek: days, startDate: w.startDate, endDate: w.until ?? null },
  };
}

/**
 * Create (or idempotently update) BOTH the Daily Huddle and Weekly Meeting for a
 * client in one call — the direct "Create Teams meetings" button path (no
 * QuikFlow workflow needed). Each is pinned by kind via WfCalendarLink, so
 * re-clicking updates the same events. Returns { connected: false } when the org
 * has no connected calendar.
 */
export async function scheduleClientMeetingsForOrg(
  orgId: string,
  spec: ClientMeetingSpec,
): Promise<{ connected: boolean; organizer?: string; daily?: ScheduledEvent; weekly?: ScheduledEvent }> {
  const found = await findCalendarConnection(orgId);
  if (!found) return { connected: false };

  const out: { connected: boolean; organizer?: string; daily?: ScheduledEvent; weekly?: ScheduledEvent } = {
    connected: true,
    organizer: found.conn.label,
  };
  if (spec.daily) {
    const ev = buildMeetingEvent("Daily Huddle", spec, spec.daily);
    if (ev) {
      out.daily = await createCalendarEventForOrg(orgId, ev, {
        link: { refType: spec.refType, refId: spec.refId, kind: "daily" },
        createdBy: spec.createdBy,
      });
    }
  }
  if (spec.weekly) {
    const ev = buildMeetingEvent("Weekly Meeting", spec, spec.weekly);
    if (ev) {
      out.weekly = await createCalendarEventForOrg(orgId, ev, {
        link: { refType: spec.refType, refId: spec.refId, kind: "weekly" },
        createdBy: spec.createdBy,
      });
    }
  }
  return out;
}
