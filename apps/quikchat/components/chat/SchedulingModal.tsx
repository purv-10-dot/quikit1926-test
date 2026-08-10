"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { MeetingDto, PublicUser } from "@/lib/shared";
import { Avatar, Button, Modal, Segmented, Switch, TimeInput, Video } from "@/components/ui";
import {
  MICROSOFT_CONNECT_URL,
  createMeetingApi,
  fetchCalendarConnection,
  fetchFreeBusy,
} from "@/lib/api";
import { FreeBusyGrid } from "./FreeBusyGrid";

// Mirror of `ASSISTANT_BOT_USER_ID` in @quikit/shared. Defined locally (not
// value-imported) so this client module never pulls the shared barrel's
// server-only deps into the browser bundle (same rule as ticks.ts). The bot has
// no calendar and isn't an org member — it can never be a meeting attendee.
const ASSISTANT_BOT_USER_ID = "quikchat-assistant-bot";

function todayLocal(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Local "YYYY-MM-DD" + "HH:MM" → a UTC ISO instant. */
function toIso(date: string, time: string): string {
  return new Date(`${date}T${time}:00`).toISOString();
}

const DURATIONS = [
  { label: "30m", value: "30" },
  { label: "45m", value: "45" },
  { label: "1h", value: "60" },
  { label: "90m", value: "90" },
];

export interface SchedulingModalProps {
  channelId: string;
  currentUserId: string;
  /** Candidate attendees (channel members). */
  members: PublicUser[];
  /** Pre-selected attendee ids (channel members, or one user from a profile). */
  seedAttendeeIds: string[];
  onClose: () => void;
  onCreated?: (meeting: MeetingDto) => void;
}

/**
 * Schedule-a-meeting modal (S15a): attendee picker, title/description, day +
 * start time + duration, a free/busy grid for the chosen attendees, and a
 * conferencing toggle (on by default). Submits via the message pipeline so the
 * meeting card fans out like any message.
 */
export function SchedulingModal({
  channelId,
  currentUserId,
  members,
  seedAttendeeIds,
  onClose,
  onCreated,
}: SchedulingModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [date, setDate] = useState(todayLocal());
  const [time, setTime] = useState("10:00");
  const [duration, setDuration] = useState("30");
  const [conferencing, setConferencing] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Free-text filter over the candidate attendees passed in via `members`. */
  const [attendeeQuery, setAttendeeQuery] = useState("");
  const qc = useQueryClient();

  /**
   * Whether THIS user still needs to connect a calendar before a meeting can be
   * created. Only Microsoft requires it (`requiresUserConnect`); the stub and
   * Google never do.
   *
   * Without this, switching the deployment to CALENDAR_MODE=microsoft made every
   * unconnected organizer's submit fail with a raw provider string relayed as a
   * 502 ("Calendar provider couldn't create the meeting: Organizer has not
   * connected a Microsoft calendar") — technically accurate, and useless as an
   * instruction. Under the stub this could never fire, so it arrived as a
   * regression the moment the mode changed.
   *
   * NOT a pre-flight request per modal open: `["calendar-connection"]` is the
   * same key CalendarsSettings uses, and it is invalidated there on connect and
   * disconnect — the only two ways this answer can change. So a long staleTime
   * is correct rather than merely cheap, and repeat opens are served from cache.
   *
   * `retry: false` and a fail-open read: this endpoint is module-gated
   * (`moduleKey: "calendar"`) and 403s when the calendar module is off for the
   * org. A failed probe must never block scheduling or assert "not connected" —
   * it just means no banner, and the submit path below is still the backstop.
   */
  const connection = useQuery({
    queryKey: ["calendar-connection"],
    queryFn: fetchCalendarConnection,
    staleTime: 5 * 60_000,
    retry: false,
  });
  const needsCalendarConnect =
    connection.data?.requiresUserConnect === true && connection.data.connected === false;

  // Organizer is always an attendee; others are toggleable. Exclude the
  // assistant bot (S15c) — it has no calendar and can't be scheduled.
  const others = members.filter((m) => m.id !== currentUserId && m.id !== ASSISTANT_BOT_USER_ID);
  const seed = useMemo(
    () => new Set(seedAttendeeIds.filter((id) => id !== currentUserId)),
    [seedAttendeeIds, currentUserId],
  );
  const [selected, setSelected] = useState<Set<string>>(seed);

  const organizer = members.find((m) => m.id === currentUserId) ?? {
    id: currentUserId,
    displayName: "You",
    avatarUrl: null,
  };
  const attendeeIds = [currentUserId, ...others.filter((m) => selected.has(m.id)).map((m) => m.id)];
  const attendeeUsers: PublicUser[] = [organizer, ...others.filter((m) => selected.has(m.id))];

  const durMin = parseInt(duration, 10);
  const [hh = 0, mm = 0] = time.split(":").map((n) => parseInt(n, 10) || 0);
  const selStartMin = hh * 60 + mm;
  const selEndMin = selStartMin + durMin;

  const fb = useQuery({
    queryKey: ["free-busy", channelId, [...attendeeIds].sort().join(","), date],
    queryFn: () => fetchFreeBusy(attendeeIds, `${date}T00:00:00.000Z`, `${date}T23:59:59.999Z`),
    enabled: attendeeIds.length > 0,
  });

  /**
   * The candidates actually rendered as chips. Filtering is a VIEW concern only:
   * `selected` stays keyed by user id, so someone who is selected and then
   * filtered out of view remains selected, remains in `attendeeUsers`, and
   * remains on the free/busy grid. Anything that derived attendees from the
   * rendered list instead would silently drop people as the user types.
   */
  const visibleOthers = useMemo(() => {
    const q = attendeeQuery.trim().toLowerCase();
    if (!q) return others;
    return others.filter((m) => m.displayName.toLowerCase().includes(q));
  }, [others, attendeeQuery]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function submit() {
    const t = title.trim();
    if (!t) {
      setError("Add a title");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const start = toIso(date, time);
      const end = new Date(new Date(start).getTime() + durMin * 60_000).toISOString();
      const { meeting } = await createMeetingApi(channelId, {
        title: t,
        description: description.trim() || undefined,
        start,
        end,
        attendeeUserIds: others.filter((m) => selected.has(m.id)).map((m) => m.id),
        conferencing,
        clientMessageId: crypto.randomUUID(),
      });
      onCreated?.(meeting);
      onClose();
    } catch (e) {
      // Surface the real reason (S15c) instead of a blank generic failure.
      setError(e instanceof Error ? e.message : "Could not schedule the meeting");
      setSubmitting(false);
      // The banner above is a cached answer, and a connection can be revoked
      // (or expire) between that read and this submit. Re-ask the server rather
      // than pattern-matching the provider's error string, so a revoked
      // connection surfaces the Connect action here too. Deliberately not
      // awaited — the error is already shown; this only upgrades it.
      void qc.invalidateQueries({ queryKey: ["calendar-connection"] });
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Schedule meeting"
      footer={
        // Pinned in the modal foot (S16) so the actions are always visible, even
        // when the attendee list / grid scroll internally.
        <div className="qc-schedule__actions">
          {error ? (
            <span className="qc-form-error qc-schedule__err" role="alert">
              {error}
            </span>
          ) : null}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={submitting}>
            <Video size={16} aria-hidden /> {submitting ? "Scheduling…" : "Schedule"}
          </Button>
        </div>
      }
    >
      <div className="qc-schedule" data-testid="scheduling-modal">
        {/* Actionable precondition, shown INSTEAD of letting the submit fail with
            a provider error string. Non-blocking on purpose: the answer is
            cached and can be stale, so a user whose connection this read missed
            must still be able to try. */}
        {needsCalendarConnect ? (
          <div className="qc-schedule__connect" role="status" data-testid="calendar-connect-cta">
            <span>
              Connect your Microsoft calendar to schedule meetings and see attendee availability.
            </span>
            <Button
              variant="primary"
              onClick={() => {
                window.location.href = MICROSOFT_CONNECT_URL;
              }}
            >
              Connect your Microsoft calendar
            </Button>
          </div>
        ) : null}

        {/* Fixed top: the essentials never scroll out of reach. */}
        <div className="qc-schedule__top">
          <label className="qc-field">
            <span className="qc-field__label">Title</span>
            <input
              className="qc-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Meeting title"
              aria-label="Meeting title"
              autoFocus
            />
          </label>

          {/* ONE name for this field. It previously read "Description" as the
              label, "Agenda (optional)" as the placeholder and "Meeting
              description" to a screen reader — three names for the single
              `QcMeeting.description` column, which is why QA reported "agenda"
              as a missing field. "Agenda" is the word users and QA reach for;
              the column name stays `description`. Keep this in step with the
              identical field in CalendarModule. */}
          <label className="qc-field">
            <span className="qc-field__label">Agenda</span>
            <input
              className="qc-input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What to cover (optional)"
              aria-label="Meeting agenda"
            />
          </label>

          <div className="qc-schedule__when">
            <label className="qc-field">
              <span className="qc-field__label">Date</span>
              <input
                type="date"
                className="qc-input"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                aria-label="Meeting date"
              />
            </label>
            <TimeInput value={time} onChange={setTime} label="Start" />
            <div className="qc-field">
              <span className="qc-field__label">Duration</span>
              <Segmented options={DURATIONS} value={duration} onChange={setDuration} />
            </div>
          </div>

          <Switch
            checked={conferencing}
            onChange={setConferencing}
            label="Add a video conferencing link"
          />
        </div>

        {/* Scrollable middle: only the attendee list + grid scroll if long. */}
        <div className="qc-schedule__scroll">
          <div className="qc-field">
            <span className="qc-field__label">Attendees</span>
            {/* Filters ONLY the candidates already passed in via `members` (the
                channel's own members). Deliberately not org-wide search:
                UserPicker does that against a `q` endpoint and is the obvious
                reuse, but switching to it changes WHO can be invited, which is
                a product decision tangled with RBAC Phase 3. Follow-up, not
                this change. */}
            <input
              className="qc-input qc-schedule__attfilter"
              value={attendeeQuery}
              onChange={(e) => setAttendeeQuery(e.target.value)}
              placeholder="Filter attendees"
              aria-label="Filter attendees"
            />
            <div className="qc-schedule__attendees">
              <span className="qc-att-chip qc-att-chip--fixed">
                <Avatar
                  name={organizer.displayName}
                  id={organizer.id}
                  avatarUrl={organizer.avatarUrl}
                  size={20}
                />
                {organizer.displayName} (you)
              </span>
              {visibleOthers.length === 0 ? (
                <span className="qc-schedule__attempty" data-testid="attendee-no-match">
                  No members match “{attendeeQuery}”
                </span>
              ) : null}
              {visibleOthers.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className="qc-att-chip"
                  aria-pressed={selected.has(m.id)}
                  data-selected={selected.has(m.id)}
                  onClick={() => toggle(m.id)}
                >
                  <Avatar name={m.displayName} id={m.id} avatarUrl={m.avatarUrl} size={20} />
                  {m.displayName}
                </button>
              ))}
            </div>
          </div>

          <FreeBusyGrid
            attendees={attendeeUsers}
            busy={fb.data?.busy ?? {}}
            unknown={fb.data?.unknown ?? []}
            selStartMin={selStartMin}
            selEndMin={selEndMin}
            loading={fb.isLoading}
          />
        </div>
      </div>
    </Modal>
  );
}
