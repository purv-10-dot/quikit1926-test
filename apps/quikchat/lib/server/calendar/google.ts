/**
 * GoogleCalendarProvider — SINGLE-ACCOUNT model (S15b). One Google account
 * (whoever consented `GMAIL_REFRESH_TOKEN`) is the identity/organizer for every
 * operation. Implemented over the Calendar REST API with `fetch` (no SDK → no
 * client-bundle risk, trivially mockable in tests). Server-only.
 *
 * LIMITATIONS (documented in docs/CALENDAR.md):
 *   - All events are organized by the single account; per-user organizing needs
 *     domain-wide delegation (a later session — credential swap, not a rewrite).
 *   - Free/busy is truthful only for calendars this account can see; everyone
 *     else comes back as `"unknown"` (never faked as free).
 *   - The token's calendar scopes are UNVERIFIED (the env name implies Gmail) —
 *     `verify()` probes them and returns an actionable error if insufficient.
 */
import { logger } from "@/lib/shared";
import type {
  CalendarHealth,
  CalendarProvider,
  CreateMeetingInput,
  CreateMeetingResult,
  FreeBusyBlock,
  FreeBusyForEmail,
  RsvpStatus,
} from "./types";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/calendar/v3";

export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  calendarId: string; // default "primary"
}

/** Read Google config from env; null if incomplete (→ selection falls back). */
export function googleConfigFromEnv(
  env: Record<string, string | undefined> = process.env,
): GoogleConfig | null {
  const clientId = env.GOOGLE_CLIENT_ID;
  const clientSecret = env.GOOGLE_CLIENT_SECRET;
  const refreshToken = env.GMAIL_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return null;
  return {
    clientId,
    clientSecret,
    refreshToken,
    calendarId: env.GOOGLE_CALENDAR_ID || "primary",
  };
}

const RSVP_TO_GOOGLE: Record<RsvpStatus, string> = {
  accepted: "accepted",
  declined: "declined",
  tentative: "tentative",
};

export class GoogleCalendarProvider implements CalendarProvider {
  private token: { value: string; expiresAt: number } | null = null;

  constructor(private cfg: GoogleConfig) {}

  /** Exchange the refresh token for a short-lived access token (cached). */
  private async accessToken(): Promise<string> {
    const now = Date.now();
    if (this.token && this.token.expiresAt > now + 30_000) return this.token.value;
    const body = new URLSearchParams({
      client_id: this.cfg.clientId,
      client_secret: this.cfg.clientSecret,
      refresh_token: this.cfg.refreshToken,
      grant_type: "refresh_token",
    });
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!res.ok) {
      throw new Error(`google token refresh failed (${res.status})`);
    }
    const json = (await res.json()) as { access_token: string; expires_in: number };
    this.token = {
      value: json.access_token,
      expiresAt: now + (json.expires_in ?? 3600) * 1000,
    };
    return this.token.value;
  }

  private async api(path: string, init: RequestInit = {}): Promise<Response> {
    const token = await this.accessToken();
    return fetch(`${API}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        ...(init.headers ?? {}),
      },
    });
  }

  /**
   * Scope probe: a cheap calendarList.list. 401/403 → the token lacks calendar
   * scopes (likely a Gmail-only token); return an actionable message instead of
   * throwing raw, so selection can mark the provider unhealthy.
   */
  async verify(): Promise<CalendarHealth> {
    try {
      const res = await this.api("/users/me/calendarList?maxResults=1");
      if (res.status === 401 || res.status === 403) {
        return {
          healthy: false,
          message:
            "GMAIL_REFRESH_TOKEN lacks calendar scopes — regenerate it with " +
            "https://www.googleapis.com/auth/calendar and .../calendar.events.",
        };
      }
      if (!res.ok)
        return { healthy: false, message: `Google calendar probe failed (${res.status})` };
      return { healthy: true };
    } catch (e) {
      return { healthy: false, message: `Google calendar unreachable: ${(e as Error).message}` };
    }
  }

  async getFreeBusy(input: {
    orgId: string;
    userEmails: string[];
    from: string;
    to: string;
  }): Promise<Record<string, FreeBusyForEmail>> {
    const out: Record<string, FreeBusyForEmail> = {};
    if (!input.userEmails.length) return out;
    try {
      const res = await this.api("/freeBusy", {
        method: "POST",
        body: JSON.stringify({
          timeMin: input.from,
          timeMax: input.to,
          items: input.userEmails.map((email) => ({ id: email })),
        }),
      });
      if (!res.ok) {
        // Whole query failed → everyone unknown (honest, not "free").
        for (const email of input.userEmails) out[email] = "unknown";
        return out;
      }
      const json = (await res.json()) as {
        calendars?: Record<string, { busy?: FreeBusyBlock[]; errors?: unknown[] }>;
      };
      for (const email of input.userEmails) {
        const cal = json.calendars?.[email];
        // An account we can't see returns an `errors` entry → unknown.
        out[email] = !cal || cal.errors?.length ? "unknown" : (cal.busy ?? []);
      }
      return out;
    } catch {
      // Token refresh / network failure must degrade, never 500 the request.
      for (const email of input.userEmails) out[email] = "unknown";
      return out;
    }
  }

  async createMeeting(input: CreateMeetingInput): Promise<CreateMeetingResult> {
    const body: Record<string, unknown> = {
      summary: input.title,
      description: input.description,
      start: { dateTime: input.start },
      end: { dateTime: input.end },
      attendees: input.attendeeEmails.map((email) => ({ email })),
    };
    if (input.conferencing) {
      body.conferenceData = {
        createRequest: {
          // Deterministic-enough request id; Google dedupes by it.
          requestId: `qc-${input.orgId}-${input.start}`,
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      };
    }
    const res = await this.api(
      `/calendars/${encodeURIComponent(this.cfg.calendarId)}/events?conferenceDataVersion=1&sendUpdates=all`,
      { method: "POST", body: JSON.stringify(body) },
    );
    if (!res.ok) throw new Error(`google events.insert failed (${res.status})`);
    const ev = (await res.json()) as {
      id: string;
      hangoutLink?: string;
      htmlLink?: string;
      conferenceData?: { entryPoints?: { uri?: string }[] };
    };
    const joinUrl =
      ev.hangoutLink ?? ev.conferenceData?.entryPoints?.find((e) => e.uri)?.uri ?? null;
    return { externalEventId: ev.id, joinUrl, htmlLink: ev.htmlLink ?? null };
  }

  async setRsvp(input: {
    orgId: string;
    externalEventId: string;
    userEmail: string;
    status: RsvpStatus;
  }): Promise<void> {
    const cal = encodeURIComponent(this.cfg.calendarId);
    // Fetch the event, flip the matching attendee's responseStatus, patch back
    // (events.patch needs the full attendees array to update one).
    const getRes = await this.api(`/calendars/${cal}/events/${input.externalEventId}`);
    if (!getRes.ok) throw new Error(`google events.get failed (${getRes.status})`);
    const ev = (await getRes.json()) as {
      attendees?: { email: string; responseStatus?: string }[];
    };
    const attendees = ev.attendees ?? [];
    const target = attendees.find((a) => a.email === input.userEmail);
    if (target) target.responseStatus = RSVP_TO_GOOGLE[input.status];
    else attendees.push({ email: input.userEmail, responseStatus: RSVP_TO_GOOGLE[input.status] });
    const patchRes = await this.api(`/calendars/${cal}/events/${input.externalEventId}`, {
      method: "PATCH",
      body: JSON.stringify({ attendees }),
    });
    if (!patchRes.ok) throw new Error(`google events.patch failed (${patchRes.status})`);
  }

  async cancel(input: { orgId: string; externalEventId: string }): Promise<void> {
    const cal = encodeURIComponent(this.cfg.calendarId);
    const res = await this.api(
      `/calendars/${cal}/events/${input.externalEventId}?sendUpdates=all`,
      {
        method: "DELETE",
      },
    );
    // 410 Gone = already deleted; treat as success.
    if (!res.ok && res.status !== 410) {
      logger.warn({ status: res.status }, "google events.delete failed");
    }
  }
}
