/**
 * MicrosoftCalendarProvider — PER-USER OAuth connect (S15b). Each user connects
 * their own Microsoft 365 calendar; we store their refresh token ENCRYPTED in
 * `QcCalendarConnection`. Provider calls act AS the connected user (Graph
 * `/me/...`). Unconnected users degrade gracefully: `"unknown"` availability and
 * can't organize via MS (the UI shows a "Connect" affordance). fetch-based, no
 * SDK, server-only.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { db as prisma } from "@quikit/database";
import { logger } from "@/lib/shared";
import { decryptToken, encryptToken, resolveEncKey } from "./crypto";
import type {
  CalendarHealth,
  CalendarProvider,
  CreateMeetingInput,
  CreateMeetingResult,
  FreeBusyForEmail,
  RsvpStatus,
} from "./types";

const GRAPH = "https://graph.microsoft.com/v1.0";
const SCOPES = [
  "offline_access",
  "openid",
  "email",
  "profile",
  "User.Read",
  "Calendars.ReadWrite",
  "Calendars.Read.Shared",
];

export interface MicrosoftConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  tenant: string;
  encKey: Buffer;
}

/** Read MS config from env; null if incomplete (→ selection falls back to stub). */
export function microsoftConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
): MicrosoftConfig | null {
  const clientId = env.MICROSOFT_CLIENT_ID;
  const clientSecret = env.MICROSOFT_CLIENT_SECRET;
  const redirectUri = env.MICROSOFT_REDIRECT_URI || env.MICROSOFT_CALENDAR_REDIRECT_URL;
  const encKey = resolveEncKey(env.CALENDAR_TOKEN_ENC_KEY);
  if (!clientId || !clientSecret || !redirectUri || !encKey) return null;
  return { clientId, clientSecret, redirectUri, tenant: env.MICROSOFT_TENANT || "common", encKey };
}

const authBase = (tenant: string) => `https://login.microsoftonline.com/${tenant}/oauth2/v2.0`;

const RSVP_TO_ACTION: Record<RsvpStatus, string> = {
  accepted: "accept",
  declined: "decline",
  tentative: "tentativelyAccept",
};

// ---- connect flow (used by the routes) ----

/**
 * Sign/verify the OAuth `state` param to bind the callback to the user who
 * started the flow (CSRF defense): `base64url(userId).hmac`. The callback
 * rejects a state whose userId ≠ the session user, so a stolen code can't be
 * planted onto another account.
 */
export function signState(cfg: MicrosoftConfig, userId: string): string {
  const payload = Buffer.from(userId, "utf8").toString("base64url");
  const mac = createHmac("sha256", cfg.encKey).update(payload).digest("base64url");
  return `${payload}.${mac}`;
}

export function verifyState(cfg: MicrosoftConfig, state: string): string | null {
  const [payload, mac] = state.split(".");
  if (!payload || !mac) return null;
  const expected = createHmac("sha256", cfg.encKey).update(payload).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return Buffer.from(payload, "base64url").toString("utf8");
}

/** Authorize URL the user is redirected to (per-user consent). */
export function buildAuthUrl(cfg: MicrosoftConfig, state: string): string {
  const qs = new URLSearchParams({
    client_id: cfg.clientId,
    response_type: "code",
    redirect_uri: cfg.redirectUri,
    response_mode: "query",
    scope: SCOPES.join(" "),
    state,
  });
  return `${authBase(cfg.tenant)}/authorize?${qs.toString()}`;
}

async function exchange(cfg: MicrosoftConfig, params: Record<string, string>) {
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    redirect_uri: cfg.redirectUri,
    scope: SCOPES.join(" "),
    ...params,
  });
  const res = await fetch(`${authBase(cfg.tenant)}/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`microsoft token exchange failed (${res.status})`);
  return (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    scope?: string;
  };
}

/** Exchange the OAuth code, fetch the mailbox, store the ENCRYPTED refresh token. */
export async function handleCallback(
  cfg: MicrosoftConfig,
  orgId: string,
  userId: string,
  code: string,
): Promise<{ email: string }> {
  const tok = await exchange(cfg, { grant_type: "authorization_code", code });
  if (!tok.refresh_token) throw new Error("microsoft did not return a refresh token");
  const meRes = await fetch(`${GRAPH}/me`, {
    headers: { authorization: `Bearer ${tok.access_token}` },
  });
  const me = meRes.ok
    ? ((await meRes.json()) as { mail?: string; userPrincipalName?: string })
    : {};
  const email = me.mail || me.userPrincipalName || "unknown@microsoft";
  await prisma.qcCalendarConnection.upsert({
    where: { userId_provider: { userId, provider: "microsoft" } },
    update: {
      orgId,
      email,
      scopes: tok.scope ?? SCOPES.join(" "),
      refreshToken: encryptToken(tok.refresh_token, cfg.encKey),
    },
    create: {
      orgId,
      userId,
      provider: "microsoft",
      email,
      scopes: tok.scope ?? SCOPES.join(" "),
      refreshToken: encryptToken(tok.refresh_token, cfg.encKey),
    },
  });
  return { email };
}

export async function disconnect(userId: string): Promise<void> {
  await prisma.qcCalendarConnection.deleteMany({ where: { userId, provider: "microsoft" } });
}

export async function getConnection(userId: string): Promise<{ email: string } | null> {
  const row = await prisma.qcCalendarConnection.findUnique({
    where: { userId_provider: { userId, provider: "microsoft" } },
  });
  return row ? { email: row.email } : null;
}

export class MicrosoftCalendarProvider implements CalendarProvider {
  constructor(private cfg: MicrosoftConfig) {}

  /** Mint an access token for the acting user from their stored refresh token. */
  private async accessTokenFor(userId: string | undefined): Promise<string | null> {
    if (!userId) return null;
    const row = await prisma.qcCalendarConnection.findUnique({
      where: { userId_provider: { userId, provider: "microsoft" } },
    });
    if (!row) return null;
    const refreshToken = decryptToken(row.refreshToken, this.cfg.encKey);
    const tok = await exchange(this.cfg, {
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });
    // MS rotates refresh tokens — persist the new one (still encrypted).
    if (tok.refresh_token && tok.refresh_token !== refreshToken) {
      await prisma.qcCalendarConnection.update({
        where: { id: row.id },
        data: { refreshToken: encryptToken(tok.refresh_token, this.cfg.encKey) },
      });
    }
    return tok.access_token;
  }

  async verify(): Promise<CalendarHealth> {
    // Env presence is validated by selection; per-user health is per connection.
    return { healthy: true };
  }

  async getFreeBusy(input: {
    orgId: string;
    actingUserId?: string;
    userEmails: string[];
    from: string;
    to: string;
  }): Promise<Record<string, FreeBusyForEmail>> {
    const out: Record<string, FreeBusyForEmail> = {};
    const token = await this.accessTokenFor(input.actingUserId);
    if (!token || !input.userEmails.length) {
      for (const email of input.userEmails) out[email] = "unknown";
      return out;
    }
    const res = await fetch(`${GRAPH}/me/calendar/getSchedule`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        schedules: input.userEmails,
        startTime: { dateTime: input.from, timeZone: "UTC" },
        endTime: { dateTime: input.to, timeZone: "UTC" },
        availabilityViewInterval: 30,
      }),
    });
    if (!res.ok) {
      for (const email of input.userEmails) out[email] = "unknown";
      return out;
    }
    const json = (await res.json()) as {
      value?: {
        scheduleId?: string;
        error?: unknown;
        scheduleItems?: {
          status?: string;
          start?: { dateTime?: string };
          end?: { dateTime?: string };
        }[];
      }[];
    };
    const byId = new Map((json.value ?? []).map((v) => [v.scheduleId, v]));
    for (const email of input.userEmails) {
      const v = byId.get(email);
      if (!v || v.error) {
        out[email] = "unknown";
        continue;
      }
      out[email] = (v.scheduleItems ?? [])
        .filter((i) => i.status && i.status !== "free" && i.start?.dateTime && i.end?.dateTime)
        .map((i) => ({
          start: new Date(`${i.start!.dateTime}Z`).toISOString(),
          end: new Date(`${i.end!.dateTime}Z`).toISOString(),
        }));
    }
    return out;
  }

  async createMeeting(input: CreateMeetingInput): Promise<CreateMeetingResult> {
    const token = await this.accessTokenFor(input.organizerId);
    if (!token) {
      throw new Error("Organizer has not connected a Microsoft calendar");
    }
    const body: Record<string, unknown> = {
      subject: input.title,
      body: { contentType: "text", content: input.description ?? "" },
      start: { dateTime: input.start, timeZone: "UTC" },
      end: { dateTime: input.end, timeZone: "UTC" },
      attendees: input.attendees.map((a) => ({
        emailAddress: { address: a.email },
        // Was hardcoded "required" for everyone.
        type: a.optional ? "optional" : "required",
      })),
    };
    if (input.location) {
      body.location = { displayName: input.location };
    }
    if (input.allDay) {
      // Graph REJECTS isAllDay unless start/end are exactly T00:00:00 in the
      // supplied timeZone. The service guarantees midnight-UTC instants (and
      // asserts it) precisely so this holds — see lib/all-day.ts. `end` is
      // already exclusive, which is also what Graph expects.
      body.isAllDay = true;
    }
    if (input.conferencing) {
      body.isOnlineMeeting = true;
      body.onlineMeetingProvider = "teamsForBusiness";
    }
    const res = await fetch(`${GRAPH}/me/events`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`microsoft events.create failed (${res.status})`);
    const ev = (await res.json()) as {
      id: string;
      onlineMeeting?: { joinUrl?: string };
      webLink?: string;
    };
    return {
      externalEventId: ev.id,
      joinUrl: ev.onlineMeeting?.joinUrl ?? null,
      htmlLink: ev.webLink ?? null,
    };
  }

  async setRsvp(input: {
    orgId: string;
    actingUserId?: string;
    externalEventId: string;
    userEmail: string;
    status: RsvpStatus;
  }): Promise<void> {
    const token = await this.accessTokenFor(input.actingUserId);
    if (!token) return; // unconnected user can't RSVP via MS; degrade silently
    const action = RSVP_TO_ACTION[input.status];
    const res = await fetch(`${GRAPH}/me/events/${input.externalEventId}/${action}`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ sendResponse: true }),
    });
    if (!res.ok) logger.warn({ status: res.status }, "microsoft RSVP action failed");
  }

  async cancel(input: {
    orgId: string;
    actingUserId?: string;
    externalEventId: string;
  }): Promise<void> {
    const token = await this.accessTokenFor(input.actingUserId);
    if (!token) return;
    const res = await fetch(`${GRAPH}/me/events/${input.externalEventId}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${token}` },
    });
    if (!res.ok && res.status !== 404)
      logger.warn({ status: res.status }, "microsoft delete failed");
  }
}
