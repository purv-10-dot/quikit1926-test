/**
 * Microsoft Teams calendar connector — OAuth (dedicated "QuikFlow-Teams" Azure
 * app) + the Microsoft Graph calendar calls QuikFlow needs. A Teams calendar IS
 * the user's Outlook/Exchange calendar, so we create ordinary /me/events and
 * flip `isOnlineMeeting` to attach a Teams meeting.
 *
 * Env: MICROSOFT_CLIENT_ID / MICROSOFT_CLIENT_SECRET / MICROSOFT_TENANT_ID —
 * the SAME Azure app registration as the Outlook mail connector (./microsoft.ts).
 * Deliberate, not an oversight: QuikFlow reuses one Azure app for both mail and
 * Teams calendar rather than keeping a QUIKFLOW_TEAMS_* copy. Practically this
 * means revoking/rotating consent for one connector affects the other.
 * (Still NOT the MS_TEAMS_* names — those are QuikHRMS's own, unrelated
 * app-only Graph integration on a different Azure app registration.)
 * Delegated Graph scopes: REQUIRED_SCOPES always, CAPTURE_SCOPES only for the
 * attendance report — see both constants below for why that split matters.
 */
import {
  GRAPH,
  msAppConfig,
  msBuildAuthUrl,
  msExchangeCode,
  msRefresh,
  type MsAppConfig,
} from "./microsoft-identity";
import {
  CalendarEventNotFoundError,
  type CalendarEventInput,
  type CalendarEventResult,
  type CalendarEventView,
  type CalendarProvider,
  type CalendarRecurrence,
} from "./types";

/**
 * Scopes without which this connector cannot do its job at all: create, update,
 * read and delete calendar events, and identify the connected mailbox.
 *
 * NOTHING on the create/update/delete/read path may depend on a scope outside
 * this list. That separation is load-bearing, not tidiness — see CAPTURE_SCOPES.
 */
export const REQUIRED_SCOPES = ["offline_access", "Calendars.ReadWrite", "User.Read"];

/**
 * OPTIONAL, READ-ONLY scopes for the attendance report only (teams-attendance.ts):
 * resolving a meeting from its join URL, and reading who joined and for how long.
 * Nothing writes through them — no auto-record, no lobby settings, no PATCH.
 *
 * The missing lobby settings are a PRODUCT REQUIREMENT, not an omission.
 * Fathom's notetaker joins anonymously, so with no `lobbyBypassSettings` on the
 * meeting it waits in the lobby until a human clicks Admit — which is exactly
 * the wanted flow (join → lobby → admit → record), and it keeps a bot out of
 * any meeting nobody showed up to. Writing `lobbyBypassSettings.scope` would
 * mean PATCHing /me/onlineMeetings/{id}, which needs OnlineMeetings.ReadWrite
 * and therefore re-consent for EVERY existing connection. Do not add it to
 * "fix" a bot stuck in the lobby — that is a Teams meeting-policy question for
 * the organiser's tenant. `__tests__/unit/teams-no-lobby-bypass.test.ts` pins
 * this by asserting on the Graph request body.
 *
 * Requesting them delegated rather than as application permissions is what
 * avoids the Teams application access policy (`Grant-CsApplicationAccessPolicy`)
 * that app-only access to these endpoints requires. The connected mailbox is
 * the organiser, so its own token is entitled to its own meetings.
 *
 * BOTH REQUIRE ENTRA ADMIN CONSENT. A tenant whose admin has not granted them
 * can still connect and run every calendar feature; only the attendance report
 * is unavailable, and `missingCaptureScopes()` reports that as an actionable
 * "reconnect to grant X" instead of an opaque 403 at report time.
 *
 * A connection consented before these existed keeps working exactly this way,
 * because the refresh grant never re-asserts scopes (see `msRefresh`). Do not
 * "fix" that by sending the full set on refresh — that is precisely the bug
 * that took calendar creation down tenant-wide.
 */
export const CAPTURE_SCOPES = ["OnlineMeetings.Read.All", "OnlineMeetingArtifact.Read.All"];

/** Everything the consent screen asks for. Optional scopes may be declined. */
const SCOPES = [...REQUIRED_SCOPES, ...CAPTURE_SCOPES];
const MAX_CALENDAR_VIEW = 250;

function cfg(): MsAppConfig {
  return msAppConfig("MICROSOFT", "common", "MICROSOFT_TENANT_ID");
}

/** Build the Graph recurrence object from QuikFlow's simplified shape. Exported for tests. */
export function toGraphRecurrence(r: CalendarRecurrence): Record<string, unknown> {
  const pattern: Record<string, unknown> = {
    type: r.pattern, // "daily" | "weekly"
    interval: r.interval && r.interval > 0 ? r.interval : 1,
  };
  if (r.pattern === "weekly") {
    pattern.daysOfWeek = r.daysOfWeek && r.daysOfWeek.length > 0 ? r.daysOfWeek : ["monday"];
  }
  const range: Record<string, unknown> = { startDate: r.startDate };
  if (r.occurrences && r.occurrences > 0) {
    range.type = "numbered";
    range.numberOfOccurrences = r.occurrences;
  } else if (r.endDate) {
    range.type = "endDate";
    range.endDate = r.endDate;
  } else {
    range.type = "noEnd";
  }
  return { pattern, range };
}

/** Build the Graph event body from a CalendarEventInput (create + update share this). */
function toGraphEvent(event: Partial<CalendarEventInput>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (event.subject !== undefined) body.subject = event.subject;
  if (event.body !== undefined) {
    body.body = { contentType: event.html ? "HTML" : "Text", content: event.body ?? "" };
  }
  if (event.start !== undefined && event.timeZone !== undefined) {
    body.start = { dateTime: event.start, timeZone: event.timeZone };
  }
  if (event.end !== undefined && event.timeZone !== undefined) {
    body.end = { dateTime: event.end, timeZone: event.timeZone };
  }
  // Graph carries required/optional on the attendee itself, and the distinction
  // is load-bearing downstream: the attendance report is read against the
  // invite, so an optional attendee who skips a huddle must not look like a
  // team member who did. Emitted whenever EITHER list is supplied, because
  // Graph replaces the whole array — sending only the required half on an
  // update would silently drop every optional invitee.
  if (event.attendees !== undefined || event.optionalAttendees !== undefined) {
    const asAttendee = (address: string, type: "required" | "optional") => ({
      emailAddress: { address: address.trim() },
      type,
    });
    const required = (event.attendees ?? []).filter(Boolean);
    const requiredSet = new Set(required.map((a) => a.trim().toLowerCase()));
    body.attendees = [
      ...required.map((a) => asAttendee(a, "required")),
      ...(event.optionalAttendees ?? [])
        .filter(Boolean)
        // Required wins a duplicate: the stricter obligation is the safe one to
        // keep, and Graph rejects the same address twice.
        .filter((a) => !requiredSet.has(a.trim().toLowerCase()))
        .map((a) => asAttendee(a, "optional")),
    ];
  }
  if (event.location !== undefined) {
    body.location = { displayName: event.location ?? "" };
  }
  if (event.onlineMeeting) {
    body.isOnlineMeeting = true;
    body.onlineMeetingProvider = "teamsForBusiness";
  }
  if (event.recurrence !== undefined) {
    body.recurrence = event.recurrence ? toGraphRecurrence(event.recurrence) : null;
  }
  return body;
}

interface GraphEvent {
  id: string;
  subject?: string;
  webLink?: string;
  isOnlineMeeting?: boolean;
  onlineMeeting?: { joinUrl?: string } | null;
  start?: { dateTime?: string };
  end?: { dateTime?: string };
  organizer?: { emailAddress?: { address?: string; name?: string } };
}

function toResult(g: GraphEvent): CalendarEventResult {
  return { id: g.id, webLink: g.webLink ?? null, joinUrl: g.onlineMeeting?.joinUrl ?? null };
}

async function graphJson<T>(
  path: string,
  accessToken: string,
  init: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
): Promise<{ res: Response; json: T }> {
  const res = await fetch(`${GRAPH}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(init.headers ?? {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as T;
  return { res, json };
}

function graphError(json: unknown, status: number): string {
  const e = (json as { error?: { message?: string } })?.error?.message;
  return e ?? `HTTP ${status}`;
}

export const TEAMS: CalendarProvider = {
  id: "teams",
  label: "Microsoft Teams",
  scopes: SCOPES,

  buildAuthUrl(redirectUri, state) {
    return msBuildAuthUrl(cfg(), SCOPES, redirectUri, state);
  },

  exchangeCode(code, redirectUri) {
    return msExchangeCode(cfg(), SCOPES, code, redirectUri);
  },

  // No scope argument: a refresh re-issues whatever was consented. Passing
  // SCOPES here is what broke every pre-attendance connection — see msRefresh.
  refresh(refreshToken) {
    return msRefresh(cfg(), refreshToken);
  },

  async createEvent(accessToken, event) {
    const { res, json } = await graphJson<GraphEvent>("/me/events", accessToken, {
      method: "POST",
      body: toGraphEvent(event),
    });
    if (!res.ok) throw new Error(`Teams calendar create failed: ${graphError(json, res.status)}`);
    return toResult(json);
  },

  async updateEvent(accessToken, eventId, event) {
    const { res, json } = await graphJson<GraphEvent>(
      `/me/events/${encodeURIComponent(eventId)}`,
      accessToken,
      { method: "PATCH", body: toGraphEvent(event) },
    );
    if (!res.ok) {
      const message = `Teams calendar update failed: ${graphError(json, res.status)}`;
      // 404 here means the stored event id is stale (deleted in Outlook/Teams,
      // or orphaned by a calendar reconnect) — not a real failure of this run.
      // Let the caller recreate the event instead of failing the workflow.
      if (res.status === 404) throw new CalendarEventNotFoundError(message);
      throw new Error(message);
    }
    return toResult(json);
  },

  async deleteEvent(accessToken, eventId) {
    const res = await fetch(`${GRAPH}/me/events/${encodeURIComponent(eventId)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    // 204 No Content on success; 404 (already gone) is treated as success.
    if (!res.ok && res.status !== 404) {
      const json = (await res.json().catch(() => ({}))) as unknown;
      throw new Error(`Teams calendar delete failed: ${graphError(json, res.status)}`);
    }
  },

  async listCalendarView(accessToken, startIso, endIso) {
    const q = new URLSearchParams({
      startDateTime: startIso,
      endDateTime: endIso,
      $orderby: "start/dateTime",
      $top: String(MAX_CALENDAR_VIEW),
      $select: "id,subject,start,end,isOnlineMeeting,onlineMeeting,organizer,webLink",
    });
    // Prefer UTC so the returned start/end dateTimes are unambiguous ISO instants.
    const { res, json } = await graphJson<{ value?: GraphEvent[] }>(
      `/me/calendarView?${q.toString()}`,
      accessToken,
      { headers: { Prefer: 'outlook.timezone="UTC"' } },
    );
    if (!res.ok) throw new Error(`Teams calendar read failed: ${graphError(json, res.status)}`);
    return (json.value ?? []).map((g): CalendarEventView => ({
      id: g.id,
      subject: g.subject ?? "(no subject)",
      start: g.start?.dateTime ?? startIso,
      end: g.end?.dateTime ?? startIso,
      isOnlineMeeting: g.isOnlineMeeting === true,
      joinUrl: g.onlineMeeting?.joinUrl ?? null,
      organizer: g.organizer?.emailAddress?.address ?? g.organizer?.emailAddress?.name ?? null,
      webLink: g.webLink ?? null,
    }));
  },
};
