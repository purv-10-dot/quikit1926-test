import { env } from "./env";
import type { CreateMeetingInput, CreateMeetingResult, MeetingProvider } from "./types";

// App-only (client_credentials) Microsoft Graph integration.
// The Azure app holds `Calendars.ReadWrite` (Application) — every interview is
// created as a calendar EVENT on MS_TEAMS_ORGANIZER_USER_ID's calendar with an
// embedded Teams meeting, so it shows up on the organizer's calendar and the
// invited attendees (interviewer + candidate) receive a calendar invite.

const TENANT = () => env("MS_TEAMS_TENANT_ID");
const CLIENT = () => env("MS_TEAMS_CLIENT_ID");
const SECRET = () => env("MS_TEAMS_CLIENT_SECRET");
const ORGANIZER = () => env("MS_TEAMS_ORGANIZER_USER_ID");

// Module-level token cache — Graph app tokens last ~1h; reuse across requests.
let tokenCache: { value: string; expiresAt: number } | null = null;

async function getToken(): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now + 60_000) return tokenCache.value;

  const tenant = TENANT(), client = CLIENT(), secret = SECRET();
  if (!tenant || !client || !secret) throw new Error("MS Teams credentials are not configured");

  const res = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: client,
      client_secret: secret,
      scope: "https://graph.microsoft.com/.default",
      grant_type: "client_credentials",
    }),
  });
  const json = await res.json().catch(() => ({} as Record<string, unknown>));
  const accessToken = (json as { access_token?: string }).access_token;
  if (!res.ok || !accessToken) {
    const j = json as { error_description?: string; error?: string };
    throw new Error(`MS Teams token request failed: ${j.error_description ?? j.error ?? res.status}`);
  }
  const expiresIn = Number((json as { expires_in?: number }).expires_in ?? 3600);
  tokenCache = { value: accessToken, expiresAt: now + expiresIn * 1000 };
  return accessToken;
}

export const teamsProvider: MeetingProvider = {
  id: "teams",

  isConfigured() {
    return Boolean(TENANT() && CLIENT() && SECRET() && ORGANIZER());
  },

  async createMeeting(input: CreateMeetingInput): Promise<CreateMeetingResult> {
    const organizer = ORGANIZER();
    if (!organizer) throw new Error("MS_TEAMS_ORGANIZER_USER_ID is not set");

    const token = await getToken();

    // Graph wants a naive dateTime + explicit timeZone (no trailing 'Z'); we
    // send everything as UTC and let attendees' clients localize.
    const toGraphDateTime = (d: Date) => d.toISOString().slice(0, 19);
    const attendees = (input.attendees ?? [])
      .filter((a) => a.email)
      .map((a) => ({
        emailAddress: { address: a.email, name: a.name ?? a.email },
        type: "required" as const,
      }));

    const res = await fetch(
      `https://graph.microsoft.com/v1.0/users/${organizer}/events`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: input.subject,
          start: { dateTime: toGraphDateTime(input.start), timeZone: "UTC" },
          end: { dateTime: toGraphDateTime(input.end), timeZone: "UTC" },
          isOnlineMeeting: true,
          onlineMeetingProvider: "teamsForBusiness",
          ...(attendees.length ? { attendees } : {}),
        }),
      },
    );
    const json = await res.json().catch(() => ({} as Record<string, unknown>));
    if (!res.ok) {
      const msg = (json as { error?: { message?: string } }).error?.message ?? `HTTP ${res.status}`;
      throw new Error(`MS Teams meeting creation failed: ${msg}`);
    }
    const j = json as { id?: string; onlineMeeting?: { joinUrl?: string } };
    const joinUrl = j.onlineMeeting?.joinUrl;
    if (!joinUrl) throw new Error("MS Teams response missing onlineMeeting.joinUrl");
    return { provider: "teams", joinUrl, externalId: j.id };
  },
};
