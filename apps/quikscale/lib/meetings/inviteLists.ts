/**
 * Splitting a client's roster into the two lists a calendar invite needs.
 *
 * Microsoft distinguishes required from optional attendees on the event itself,
 * and that distinction is not cosmetic here: it is what lets the attendance
 * report say a no-show *mattered*. Without it every invitee is `required`, so
 * an optional attendee missing a huddle reads exactly like a team member who
 * skipped it, and the report either penalises them or has to ignore the whole
 * signal. See `occurrenceAttendance.ts` tiers 1c/1d.
 *
 * EXTERNAL members are invited as required. They are expected to attend — they
 * are simply not part of the team whose discipline is being measured, which is
 * a reporting distinction, not a calendar one.
 */

export type InviteAttendanceType = "REQUIRED" | "OPTIONAL" | "EXTERNAL" | null | undefined;

export interface InviteMember {
  email: string | null | undefined;
  attendanceType: InviteAttendanceType;
}

export interface InviteLists {
  /** Comma-separated emails for `{{trigger.teamMemberEmails}}`. */
  required: string;
  /** Comma-separated emails for `{{trigger.optionalMemberEmails}}`. */
  optional: string;
}

/**
 * Both lists as the comma-separated strings the QuikFlow event payload carries.
 *
 * Empty strings rather than nulls: the payload tokens are text, and an absent
 * token and an empty one must behave identically for a workflow that
 * interpolates them straight into an action input.
 */
export function splitInviteEmails(members: InviteMember[]): InviteLists {
  const required: string[] = [];
  const optional: string[] = [];

  for (const m of members) {
    const email = m.email?.trim();
    if (!email) continue;
    (m.attendanceType === "OPTIONAL" ? optional : required).push(email);
  }

  return { required: required.join(", "), optional: optional.join(", ") };
}
