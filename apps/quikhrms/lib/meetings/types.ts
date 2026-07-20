// Provider-agnostic meeting abstraction.
// Teams is implemented today; Google Meet plugs in later behind the same
// interface, so the interview-scheduling call site never has to change.

export type MeetingProviderId = "teams" | "google-meet";

export interface CreateMeetingInput {
  /** Meeting title shown in Teams / the calendar invite. */
  subject: string;
  /** Meeting start time. */
  start: Date;
  /** Meeting end time. */
  end: Date;
  /**
   * People to invite. They receive a calendar invite and the event appears on
   * their calendar. Optional — when empty, the event is still created on the
   * organizer's calendar with a join link, just without invitees.
   */
  attendees?: { email: string; name?: string }[];
}

export interface CreateMeetingResult {
  provider: MeetingProviderId;
  /** The URL attendees click to join. */
  joinUrl: string;
  /** Provider-side meeting id — kept for a future update/cancel flow. */
  externalId?: string;
}

export interface MeetingProvider {
  readonly id: MeetingProviderId;
  /** True when every required credential / config value is present. */
  isConfigured(): boolean;
  /** Create a meeting and return its join URL. Throws on failure. */
  createMeeting(input: CreateMeetingInput): Promise<CreateMeetingResult>;
}
