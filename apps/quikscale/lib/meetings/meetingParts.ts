/**
 * Shared shaping for the two meeting fields that are NOT prose — action items
 * and attendees — so the viewer, the .txt download and the .docx export cannot
 * drift apart.
 *
 * They drifted before: the viewer rendered `a.text` and dropped the assignee,
 * the .txt did the same, and the .docx did it a third time in its own words.
 * Three copies of one decision is three places to forget it. Everything that
 * renders these fields now goes through here.
 *
 * DEPENDENCY-FREE, ON PURPOSE
 * ---------------------------
 * Like `summaryFormat.ts` and `transcriptView.ts`, this module imports nothing
 * outside `lib/meetings`. The Fathom parity script in `apps/quikflow` imports
 * these three by relative path to prove that what it reports is what the app
 * actually renders. Adding a `@/`-aliased or React import here breaks that.
 */
import { formatClock } from "./transcriptView";

export interface ActionItemInput {
  text?: string | null;
  assignee?: string | null;
  dueDate?: string | null;
  /** Offset into the recording, in SECONDS (Fathom's unit). */
  timestampSeconds?: number | null;
}

export interface AttendeeInput {
  name?: string | null;
  email?: string | null;
  isInvitee?: boolean;
  isIdentified?: boolean;
  linkedinUrl?: string | null;
}

/**
 * The meta chips shown under an action item, already ordered and free of
 * blanks: `["0:49", "Rohit Deshmukh", "due 2026-09-01"]`.
 *
 * Empty entries are omitted rather than rendered as "—", because rows ingested
 * before the connector carried a timestamp or assignee would otherwise show a
 * column of dashes forever.
 */
export function actionItemMeta(item: ActionItemInput | null | undefined): string[] {
  if (!item) return [];
  const clock = item.timestampSeconds != null ? formatClock(item.timestampSeconds * 1000) : null;
  return [clock, item.assignee?.trim() || null, item.dueDate ? `due ${item.dueDate}` : null].filter(
    (v): v is string => !!v,
  );
}

/** One action item as a plain-text line, for the .txt and .docx exports. */
export function actionItemLine(item: ActionItemInput | null | undefined): string {
  const text = item?.text?.trim() ?? "";
  const meta = actionItemMeta(item);
  return meta.length ? `- ${text} (${meta.join(" · ")})` : `- ${text}`;
}

export interface AttendeeGroups {
  /** People Fathom identified as actually present. */
  identified: AttendeeInput[];
  /** Calendar invitees who were not also identified. */
  invitees: AttendeeInput[];
  /**
   * True when NO attendee carries a group flag — i.e. a row ingested before the
   * connector learned to distinguish them. Callers must fall back to a single
   * flat list rather than inventing a group the data does not support.
   */
  ungrouped: boolean;
}

/** Split attendees into the two groups Fathom's own UI shows. */
export function attendeeGroups(attendees: AttendeeInput[] | null | undefined): AttendeeGroups {
  const rows = Array.isArray(attendees) ? attendees.filter(Boolean) : [];
  const identified = rows.filter((a) => a?.isIdentified);
  const invitees = rows.filter((a) => a?.isInvitee && !a?.isIdentified);
  return { identified, invitees, ungrouped: identified.length === 0 && invitees.length === 0 };
}

/** `Rohit Deshmukh <rohit@example.com>` — name and email, never one hiding the other. */
export function attendeeLabel(a: AttendeeInput | null | undefined): string {
  const name = a?.name?.trim() || "";
  const email = a?.email?.trim() || "";
  if (name && email) return `${name} <${email}>`;
  return name || email;
}

/**
 * Attendees as plain text for the exports: two labelled lines when the data
 * supports the distinction, one labelled line when it does not.
 *
 * EVERY line carries its `Label: ` prefix, including the ungrouped fallback —
 * callers split on ": " to render a bold label, and an unlabelled line would
 * silently lose it.
 */
export function attendeesToPlainText(attendees: AttendeeInput[] | null | undefined): string {
  const { identified, invitees, ungrouped } = attendeeGroups(attendees);
  const rows = Array.isArray(attendees) ? attendees.filter(Boolean) : [];
  if (rows.length === 0) return "";

  const join = (list: AttendeeInput[]) => list.map(attendeeLabel).filter(Boolean).join(", ");
  if (ungrouped) return `Attendees: ${join(rows)}`;

  const parts: string[] = [];
  if (identified.length) parts.push(`Attendees: ${join(identified)}`);
  if (invitees.length) parts.push(`Invited: ${join(invitees)}`);
  return parts.join("\n");
}
