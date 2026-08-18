/**
 * Mail-connector contracts. Gmail and Outlook implement the same `MailProvider`
 * interface so the OAuth routes, the outbound send action, and the inbound
 * poll scan are all provider-agnostic — adding a provider is one new file, no
 * plumbing changes.
 */

/** A provider id backed by a WfProvider enum value. */
export type MailProviderId = "gmail" | "outlook";

/**
 * Any provider QuikFlow can OAuth-connect and store in WfConnection. Mail
 * providers (gmail/outlook) and the Teams calendar provider all share the same
 * Microsoft-identity-style OAuth half; the messaging/calendar halves differ.
 */
export type OAuthProviderId = "gmail" | "outlook" | "teams";

/** A calendar-capable provider id (Microsoft Teams calendar = Outlook/Exchange). */
export type CalendarProviderId = "teams";

/** An outbound message to send from a connected mailbox. */
export interface MailMessage {
  to: string;
  subject: string;
  body: string;
  cc?: string;
  bcc?: string;
  /** Send the body as text/html instead of text/plain. */
  html?: boolean;
}

/** A normalized inbound message surfaced by a poll. */
export interface InboundMail {
  messageId: string;
  threadId: string | null;
  from: string;
  fromName: string | null;
  to: string;
  cc: string;
  subject: string;
  snippet: string;
  /** ISO-8601 receive time. */
  receivedAt: string;
  hasAttachments: boolean;
}

/** The result of a token exchange or refresh. */
export interface TokenSet {
  accessToken: string;
  /** Absent on refresh responses that don't re-issue one. */
  refreshToken: string | null;
  expiresAt: Date | null;
  scopes: string[];
  /** The connected mailbox address — used as the WfConnection label. */
  email: string;
}

/**
 * The OAuth half shared by every connectable provider (mail + calendar), all
 * via plain fetch (no SDK deps). The messaging/calendar surface is added by the
 * MailProvider / CalendarProvider sub-interfaces.
 */
export interface OAuthProvider {
  id: string;
  label: string;
  scopes: string[];
  /** Build the consent-screen URL the user is redirected to. */
  buildAuthUrl(redirectUri: string, state: string): string;
  /** Exchange an authorization code for tokens + the connected account address. */
  exchangeCode(code: string, redirectUri: string): Promise<TokenSet>;
  /** Refresh an access token; `email` may be re-resolved or echoed by the caller. */
  refresh(refreshToken: string): Promise<TokenSet>;
}

/** A provider's OAuth + Mail REST surface, all via plain fetch (no SDK deps). */
export interface MailProvider extends OAuthProvider {
  id: MailProviderId;
  /** Send one message from the mailbox; returns the provider message id. */
  sendMessage(accessToken: string, from: string, msg: MailMessage): Promise<{ id: string }>;
  /**
   * List messages newer than `cursor` (a provider-specific watermark). On the
   * first poll (`cursor === null`) it returns no messages and a fresh watermark
   * of "now", so QuikFlow never backfills an entire mailbox.
   */
  listSince(accessToken: string, cursor: string | null): Promise<{ messages: InboundMail[]; nextCursor: string | null }>;
}

/** A recurrence pattern for a calendar event (daily huddle / weekly meeting). */
export interface CalendarRecurrence {
  pattern: "daily" | "weekly";
  /** Repeat every N days/weeks (default 1). */
  interval?: number;
  /** Weekly only: lowercase day names, e.g. ["monday"]. */
  daysOfWeek?: string[];
  /** First occurrence date "YYYY-MM-DD". */
  startDate: string;
  /** Optional bounded end date "YYYY-MM-DD" (else open-ended or by occurrences). */
  endDate?: string | null;
  /** Optional occurrence count (numbered range). */
  occurrences?: number | null;
}

/** An outbound calendar event to create on a connected Microsoft account. */
export interface CalendarEventInput {
  subject: string;
  body?: string;
  /** Render the body as HTML instead of plain text. */
  html?: boolean;
  /** Local start date-time (no offset), e.g. "2026-07-29T09:00:00". */
  start: string;
  /** Local end date-time (no offset). */
  end: string;
  /** IANA/Windows time zone the start/end are expressed in, e.g. "Asia/Kolkata". */
  timeZone: string;
  /** Attendee email addresses. */
  attendees?: string[];
  location?: string;
  /** Attach a Teams online meeting (isOnlineMeeting + teamsForBusiness). */
  onlineMeeting?: boolean;
  recurrence?: CalendarRecurrence | null;
}

/** The result of creating/updating a calendar event. */
export interface CalendarEventResult {
  id: string;
  webLink?: string | null;
  joinUrl?: string | null;
}

/** A normalized calendar event surfaced by a calendar-view read. */
export interface CalendarEventView {
  id: string;
  subject: string;
  /** ISO-8601 start/end. */
  start: string;
  end: string;
  isOnlineMeeting: boolean;
  joinUrl: string | null;
  organizer: string | null;
  webLink: string | null;
}

/** A provider's OAuth + Calendar REST surface (Microsoft Graph calendar). */
export interface CalendarProvider extends OAuthProvider {
  id: CalendarProviderId;
  createEvent(accessToken: string, event: CalendarEventInput): Promise<CalendarEventResult>;
  updateEvent(
    accessToken: string,
    eventId: string,
    event: Partial<CalendarEventInput>,
  ): Promise<CalendarEventResult>;
  deleteEvent(accessToken: string, eventId: string): Promise<void>;
  /** List events overlapping [startIso, endIso) on the connected calendar. */
  listCalendarView(accessToken: string, startIso: string, endIso: string): Promise<CalendarEventView[]>;
}
