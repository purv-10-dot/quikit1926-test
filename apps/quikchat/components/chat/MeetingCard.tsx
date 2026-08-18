"use client";

import { useState } from "react";
import type { AttendeeRsvp, MeetingAttendeeDto, MeetingDto, RsvpStatus } from "@/lib/shared";
import { Avatar, Button, Calendar, Clock, MapPin, Phone, Video } from "@/components/ui";
import { formatAllDayRange } from "@/lib/all-day";
import { rsvpMeetingApi } from "@/lib/api";
import { useProfile } from "@/components/profile/ProfileProvider";

/** "Fri, Jun 20 · 10:00 – 10:30 AM" in the viewer's local timezone. */
/**
 * All-day meetings are rendered from their UTC parts by `formatAllDayRange` —
 * NOT with the local-zone formatting below. Storing midnight UTC is only half
 * the fix: `toLocaleDateString` on 2026-08-14T00:00:00Z shows **13 Aug** to a
 * viewer at UTC−5, so the database would be right and the screen wrong. This
 * branch is the other half, and it is invisible to anyone developing on UTC.
 */
function formatRange(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const day = start.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const t = (d: Date) => d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${day} · ${t(start)} – ${t(end)}`;
}

/** "{name} — {RSVP}", plus "· Optional" only when it applies. */
function attendeeLabel(a: MeetingAttendeeDto): string {
  const base = `${a.user.displayName} — ${RSVP_LABEL[a.rsvp]}`;
  return a.optional ? `${base} · Optional` : base;
}

const RSVP_OPTS: { status: RsvpStatus; label: string }[] = [
  { status: "accepted", label: "Accept" },
  { status: "tentative", label: "Maybe" },
  { status: "declined", label: "Decline" },
];

const RSVP_LABEL: Record<AttendeeRsvp, string> = {
  needs_action: "No response",
  accepted: "Going",
  declined: "Declined",
  tentative: "Maybe",
};

export interface MeetingCardProps {
  meeting: MeetingDto;
  currentUserId: string;
  onStartCall?: () => void;
}

/**
 * In-chat meeting card (S15a) rendered for a `Meeting` message. Shows the title,
 * local-rendered time, join link, attendee avatars (with RSVP state), and RSVP
 * buttons for the viewer. RSVP patches the server and the card refreshes live
 * for everyone via the message_update echo.
 */
export function MeetingCard({ meeting, currentUserId, onStartCall }: MeetingCardProps) {
  const { openProfile } = useProfile();
  // Optimistic override of the viewer's own RSVP until the echo lands.
  const [override, setOverride] = useState<RsvpStatus | null>(null);
  const [error, setError] = useState(false);

  const me = meeting.attendees.find((a) => a.user.id === currentUserId);
  const myRsvp: AttendeeRsvp = override ?? me?.rsvp ?? "needs_action";
  // Required first, optional after: POSITION carries the distinction, so no
  // second dot competes with the RSVP one. The label already exists in both
  // aria-label and title, so extending it is free for screen readers and hover.
  const sortedAttendees = [...meeting.attendees].sort(
    (a, b) => Number(a.optional) - Number(b.optional),
  );
  const optionalCount = meeting.attendees.filter((a) => a.optional).length;
  const requiredCount = meeting.attendees.length - optionalCount;
  const cancelled = meeting.status === "cancelled";

  async function rsvp(status: RsvpStatus) {
    setOverride(status);
    setError(false);
    try {
      await rsvpMeetingApi(meeting.id, status);
    } catch {
      setOverride(null);
      setError(true);
    }
  }

  return (
    <div className="qc-meeting" data-testid="meeting-card" data-cancelled={cancelled || undefined}>
      <div className="qc-meeting__head">
        <span className="qc-meeting__icon" aria-hidden>
          <Calendar size={18} />
        </span>
        <div className="qc-min0">
          <div className="qc-meeting__title qc-truncate">{meeting.title}</div>
          <div className="qc-meeting__time">
            <Clock size={13} aria-hidden />{" "}
            {meeting.allDay
              ? formatAllDayRange(meeting.start, meeting.end)
              : formatRange(meeting.start, meeting.end)}
          </div>
        </div>
      </div>

      {meeting.location ? (
        <p className="qc-meeting__location">
          <MapPin size={13} aria-hidden /> {meeting.location}
        </p>
      ) : null}

      {meeting.description ? <p className="qc-meeting__desc">{meeting.description}</p> : null}

      {/* PRIMARY, and first for a reason: `meeting.joinUrl` is a TEAMS link by
          construction — `conferencing: true` asks Graph for an online meeting
          and Graph always answers with Teams. Leading with it sent people out
          of the product and into the competitor. This one stays inside
          QuikChat (LiveKit), resolving to the meeting's own call. Same address
          every time, so it is safe to paste into a calendar invite. */}
      {!cancelled ? (
        <a className="qc-meeting__join" href={`/meeting/${meeting.id}/join`}>
          <Video size={15} aria-hidden /> Join in QuikChat
        </a>
      ) : null}

      {/* Secondary, and retained deliberately: the QuikChat link needs a
          QuikChat account AND membership of this channel, so external guests
          invited by email have nothing else to click. Dropping this is a
          two-line change in microsoft.ts once usage says nobody needs it. */}
      {meeting.joinUrl && !cancelled ? (
        <a
          className="qc-meeting__join qc-meeting__join--secondary"
          href={meeting.joinUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Video size={15} aria-hidden /> Join in Teams
        </a>
      ) : null}

      {onStartCall && !cancelled ? (
        <button type="button" className="qc-meeting__start-call" onClick={onStartCall}>
          <Phone size={15} aria-hidden /> Start call
        </button>
      ) : null}

      {optionalCount > 0 ? (
        <div className="qc-meeting__att-counts">
          {requiredCount} required · {optionalCount} optional
        </div>
      ) : null}

      <div className="qc-meeting__attendees" data-testid="meeting-attendees">
        {sortedAttendees.map((a) => (
          <button
            key={a.user.id}
            type="button"
            className="qc-meeting__att"
            data-rsvp={a.rsvp}
            data-optional={a.optional || undefined}
            aria-label={attendeeLabel(a)}
            title={attendeeLabel(a)}
            onClick={() => openProfile({ user: a.user })}
          >
            <Avatar
              name={a.user.displayName}
              id={a.user.id}
              avatarUrl={a.user.avatarUrl}
              size={28}
            />
            <span className="qc-meeting__att-dot" data-rsvp={a.rsvp} aria-hidden />
          </button>
        ))}
      </div>

      {me && !cancelled ? (
        <div className="qc-meeting__rsvp" role="group" aria-label="Your RSVP">
          {RSVP_OPTS.map((o) => (
            <Button
              key={o.status}
              variant={myRsvp === o.status ? "primary" : "ghost"}
              onClick={() => rsvp(o.status)}
            >
              {o.label}
            </Button>
          ))}
        </div>
      ) : null}

      {error ? (
        <div className="qc-form-error" role="alert">
          Could not update your RSVP
        </div>
      ) : null}
      {cancelled ? <div className="qc-meeting__cancelled">Cancelled</div> : null}
    </div>
  );
}
