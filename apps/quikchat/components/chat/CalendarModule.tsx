"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import type { CalendarEventDto, FreeBusyInterval, PublicUser } from "@/lib/shared";
import {
  Avatar,
  Button,
  ChevronLeft,
  Modal,
  MoreHorizontal,
  Plus,
  Search,
  Segmented,
  Switch,
  TimeInput,
  Video,
  useToast,
} from "@/components/ui";
import {
  createCalendarEvent,
  fetchCalendarEvents,
  fetchFreeBusy,
  fetchOrgUsers,
} from "@/lib/api";
import { toMonthEvents, toWeekEvents, type WeekEvent } from "@/lib/calendar-transform";
import { loadIndiaHolidays, type IndiaHoliday } from "@/lib/india-holidays";
import { FreeBusyGrid } from "./FreeBusyGrid";

const C = {
  blue: "#3b82f6",
  green: "#22a06b",
  purple: "#8b5cf6",
  pink: "#e0569e",
  amber: "#e08a2b",
  teal: "#0ea5a4",
};

const HOLIDAY_COLOR = "#c2410c";

const START_H = 8;
const END_H = 24;
const HOUR_H = 84;
const GRID_H = (END_H - START_H) * HOUR_H;
const HOURS = Array.from({ length: END_H - START_H + 1 }, (_, i) => START_H + i);
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Vertical pixel offset of an hour within the scrollable grid. */
const pos = (h: number) => (h - START_H) * HOUR_H;

const DURATIONS = [
  { label: "30m", value: "30" },
  { label: "45m", value: "45" },
  { label: "1h", value: "60" },
  { label: "90m", value: "90" },
];

/** Map arbitrary minutes to the nearest duration preset. */
function nearestDuration(min: number): string {
  const opts = [30, 45, 60, 90];
  let best = opts[0] ?? 30;
  for (const o of opts) if (Math.abs(o - min) < Math.abs(best - min)) best = o;
  return String(best);
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** "YYYY-MM-DD" for a Date (local). */
function dateInput(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function hourLabel(h: number): string {
  if (h === 12) return "12 PM";
  if (h === 0 || h === 24) return "12 AM";
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
}
function timeLabel(h: number): string {
  const hr = Math.floor(h);
  const min = Math.round((h - hr) * 60);
  const suffix = hr < 12 ? "am" : "pm";
  const h12 = hr % 12 === 0 ? 12 : hr % 12;
  return `${h12}.${String(min).padStart(2, "0")}${suffix}`;
}

/** Schedule/edit modal pre-filled from a calendar event (demo, no persistence). */
function EventScheduleModal({
  event,
  date,
  onClose,
  onScheduled,
  currentUserId,
}: {
  event: WeekEvent;
  date: Date;
  onClose: () => void;
  onScheduled: () => void;
  currentUserId: string;
}) {
  const toast = useToast();
  const [title, setTitle] = useState(event.title === "(no title)" ? "" : event.title);
  const [description, setDescription] = useState("");
  const [dateStr, setDateStr] = useState(dateInput(date));
  const startHr = Math.floor(event.start);
  const startMin = Math.round((event.start - startHr) * 60);
  const [time, setTime] = useState(`${pad2(startHr)}:${pad2(startMin)}`);
  const [duration, setDuration] = useState(
    nearestDuration(Math.round((event.end - event.start) * 60)),
  );
  const [conferencing, setConferencing] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [orgUsers, setOrgUsers] = useState<PublicUser[]>([]);
  const [fb, setFb] = useState<{ busy: Record<string, FreeBusyInterval[]>; unknown: string[] }>({
    busy: {},
    unknown: [],
  });
  const [fbLoading, setFbLoading] = useState(false);

  // Real org users for the attendee picker.
  useEffect(() => {
    let alive = true;
    void fetchOrgUsers({})
      .then((u) => {
        if (alive) setOrgUsers(u);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const organizer = orgUsers.find((u) => u.id === currentUserId) ?? {
    id: currentUserId,
    displayName: "You",
    avatarUrl: null,
  };
  const others = orgUsers.filter((u) => u.id !== currentUserId);
  const attendeeUsers = [organizer, ...others.filter((m) => selected.has(m.id))];

  const durMin = parseInt(duration, 10);
  const [hh = 0, mm = 0] = time.split(":").map((n) => parseInt(n, 10) || 0);
  const selStartMin = hh * 60 + mm;
  const selEndMin = selStartMin + durMin;

  // Live free/busy for the organizer + selected attendees over the chosen day.
  // Deps on `orgUsers` (not the derived `others`) so a new-array-per-render
  // doesn't retrigger the fetch in a loop.
  useEffect(() => {
    const selectedIds = orgUsers
      .filter((u) => u.id !== currentUserId && selected.has(u.id))
      .map((u) => u.id);
    const ids = [currentUserId, ...selectedIds];
    const from = new Date(`${dateStr}T00:00:00`).toISOString();
    const to = new Date(`${dateStr}T23:59:59`).toISOString();
    let alive = true;
    setFbLoading(true);
    void fetchFreeBusy(ids, from, to)
      .then((dto) => {
        if (alive) setFb({ busy: dto.busy, unknown: dto.unknown });
      })
      .catch(() => {
        if (alive) setFb({ busy: {}, unknown: [] });
      })
      .finally(() => {
        if (alive) setFbLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [dateStr, selected, currentUserId, orgUsers]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Modal
      open
      onClose={onClose}
      title="Schedule meeting"
      footer={
        <div className="qc-schedule__actions">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={async () => {
              const t = title.trim();
              if (!t) {
                toast.error({ title: "Add a title" });
                return;
              }
              const start = new Date(`${dateStr}T${pad2(hh)}:${pad2(mm)}:00`);
              const end = new Date(start.getTime() + durMin * 60000);
              try {
                await createCalendarEvent({
                  title: t,
                  description: description.trim() || undefined,
                  start: start.toISOString(),
                  end: end.toISOString(),
                  allDay: false,
                  joinUrl: conferencing ? "https://meet.quikchat.dev/new" : undefined,
                });
                toast.success({ title: `Scheduled “${t}”` });
                onScheduled();
                onClose();
              } catch (e) {
                toast.error({
                  title: "Couldn't schedule",
                  body: e instanceof Error ? e.message : "Please try again.",
                });
              }
            }}
          >
            <Video size={16} aria-hidden /> Schedule
          </Button>
        </div>
      }
    >
      <div className="qc-schedule" data-testid="calendar-scheduling-modal">
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

          <label className="qc-field">
            <span className="qc-field__label">Description</span>
            <input
              className="qc-input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Agenda (optional)"
              aria-label="Meeting description"
            />
          </label>

          <div className="qc-schedule__when">
            <label className="qc-field">
              <span className="qc-field__label">Date</span>
              <input
                type="date"
                className="qc-input"
                value={dateStr}
                onChange={(e) => setDateStr(e.target.value)}
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

        <div className="qc-schedule__scroll">
          <div className="qc-field">
            <span className="qc-field__label">Attendees</span>
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
              {others.map((m) => (
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
            busy={fb.busy}
            unknown={fb.unknown}
            loading={fbLoading}
            selStartMin={selStartMin}
            selEndMin={selEndMin}
          />
        </div>
      </div>
    </Modal>
  );
}

export interface CalendarModuleProps {
  currentUserId: string;
}

export function CalendarModule({ currentUserId }: CalendarModuleProps) {
  const [cursor, setCursor] = useState(() => new Date());
  const [mode, setMode] = useState<"Day" | "Week" | "Month">("Week");
  const [events, setEvents] = useState<CalendarEventDto[]>([]);
  const [upcoming, setUpcoming] = useState<CalendarEventDto[]>([]);
  const [showMeetings, setShowMeetings] = useState(true);
  const [holidays, setHolidays] = useState<IndiaHoliday[]>([]);
  const [showHolidays, setShowHolidays] = useState(true);
  // Bumped after a create so both event fetches re-run and the new event appears.
  const [refreshTick, setRefreshTick] = useState(0);

  const weekStart = useMemo(() => startOfWeek(cursor, { weekStartsOn: 0 }), [cursor]);
  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  // Mini-month grid (6 weeks) for the sidebar.
  const miniDays = useMemo(() => {
    const gStart = startOfWeek(startOfMonth(cursor), { weekStartsOn: 0 });
    const gEnd = endOfWeek(endOfMonth(cursor), { weekStartsOn: 0 });
    return eachDayOfInterval({ start: gStart, end: gEnd });
  }, [cursor]);

  const now = new Date();
  const todayIdx = days.findIndex((d) => isToday(d));

  const visibleDayIdx = mode === "Day" ? (todayIdx >= 0 ? todayIdx : 0) : null;
  const shownDays = visibleDayIdx !== null ? [visibleDayIdx] : days.map((_, i) => i);

  // "Up next" agenda: the caller's items over the next 30 days, fetched once.
  useEffect(() => {
    const from = new Date().toISOString();
    const to = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    void fetchCalendarEvents(from, to)
      .then(setUpcoming)
      .catch(() => undefined);
  }, [refreshTick]);

  // Events for the visible month-grid range (the 6-week mini/month grid). The
  // range is stable within a month, so this refetches only on month change.
  const fromISO = miniDays[0]?.toISOString() ?? "";
  const toISO = miniDays[miniDays.length - 1]?.toISOString() ?? "";
  useEffect(() => {
    if (!fromISO || !toISO) return;
    void fetchCalendarEvents(fromISO, toISO)
      .then(setEvents)
      .catch(() => undefined);
  }, [fromISO, toISO, refreshTick]);

  // Indian public holidays for the cursor's year (+ next, for late-Dec spillover).
  const cursorYear = cursor.getFullYear();
  useEffect(() => {
    let alive = true;
    void Promise.all([loadIndiaHolidays(cursorYear), loadIndiaHolidays(cursorYear + 1)])
      .then((lists) => {
        if (alive) setHolidays(lists.flat());
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [cursorYear]);

  const holidayByKey = useMemo(
    () => new Map(holidays.map((h) => [dateInput(h.date), h.name])),
    [holidays],
  );

  // Personal events always show; meeting overlays honor the "Show meetings"
  // toggle. This is the single filter that flows into the whole grid.
  const visibleEvents = useMemo(
    () => events.filter((e) => (e.source === "meeting" ? showMeetings : true)),
    [events, showMeetings],
  );
  const agendaItems = useMemo(() => {
    const nowMs = Date.now();
    const windowEnd = nowMs + 30 * 24 * 60 * 60 * 1000;
    type Item = {
      id: string;
      startMs: number;
      title: string;
      color: string;
      when: string;
      isHoliday: boolean;
    };
    const evts: Item[] = upcoming
      .filter((e) => (e.source === "meeting" ? showMeetings : true))
      .filter((e) => Date.parse(e.end) >= nowMs)
      .map((e) => {
        const d = new Date(e.start);
        return {
          id: e.id,
          startMs: Date.parse(e.start),
          title: e.title,
          color: e.color,
          when: e.allDay ? `${format(d, "EEE")} · All day` : format(d, "EEE h:mm a"),
          isHoliday: false,
        };
      });
    const hols: Item[] = showHolidays
      ? holidays
          .filter((h) => h.date.getTime() >= nowMs && h.date.getTime() <= windowEnd)
          .map((h) => ({
            id: h.id,
            startMs: h.date.getTime(),
            title: h.name,
            color: HOLIDAY_COLOR,
            when: `${format(h.date, "EEE")} · Holiday`,
            isHoliday: true,
          }))
      : [];
    return [...evts, ...hols].sort((a, b) => a.startMs - b.startMs).slice(0, 6);
  }, [upcoming, showMeetings, holidays, showHolidays]);
  const weekEvents = useMemo(
    () => toWeekEvents(visibleEvents, weekStart),
    [visibleEvents, weekStart],
  );
  const monthEvents = useMemo(() => toMonthEvents(visibleEvents, cursor), [visibleEvents, cursor]);

  // Week/Day all-day strip: holiday names grouped by their day-index in `days`.
  const weekHolidaysByDay = useMemo(() => {
    const m = new Map<number, string[]>();
    if (!showHolidays) return m;
    for (const h of holidays) {
      const key = dateInput(h.date);
      const idx = days.findIndex((d) => dateInput(d) === key);
      if (idx >= 0) {
        const list = m.get(idx);
        if (list) list.push(h.name);
        else m.set(idx, [h.name]);
      }
    }
    return m;
  }, [holidays, showHolidays, days]);

  // Event whose 3-dot menu opened the pre-filled schedule modal.
  const [scheduleTarget, setScheduleTarget] = useState<{ event: WeekEvent; date: Date } | null>(
    null,
  );
  // Week-view event to flash after an "Up next" click (cleared after the animation).
  const [highlightId, setHighlightId] = useState<string | null>(null);

  useEffect(() => {
    if (!highlightId) return;
    const el = document.querySelector(`[data-event-id="${highlightId}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    const t = setTimeout(() => setHighlightId(null), 2000);
    return () => clearTimeout(t);
  }, [highlightId, cursor, mode]);

  // "New meeting" CTA: open the schedule modal blank at a sensible default slot.
  const openNewMeeting = () =>
    setScheduleTarget({
      event: { day: cursor.getDay(), start: 10, end: 10.5, title: "", color: C.blue },
      date: cursor,
    });

  return (
    <div className="qc-card qc-cal2">
      <aside className="qc-cal2-side">
        <div className="qc-cal2-sidehead">Calendar</div>

        <div className="qc-mini">
          <div className="qc-mini-head">
            <span className="qc-mini-title">{format(cursor, "MMMM yyyy")}</span>
            <div className="qc-mini-nav">
              <button
                type="button"
                className="qc-iconbtn"
                aria-label="Previous month"
                onClick={() => setCursor((c) => addMonths(c, -1))}
              >
                <ChevronLeft size={15} />
              </button>
              <button
                type="button"
                className="qc-iconbtn"
                aria-label="Next month"
                onClick={() => setCursor((c) => addMonths(c, 1))}
              >
                <ChevronLeft size={15} style={{ transform: "rotate(180deg)" }} />
              </button>
            </div>
          </div>
          <div className="qc-mini-grid">
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <span key={i} className="qc-mini-dow">
                {d}
              </span>
            ))}
            {miniDays.map((day) => {
              const dow = day.getDay();
              const inWeek = day >= weekStart && day <= weekEnd;
              const holName = showHolidays ? holidayByKey.get(dateInput(day)) : undefined;
              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  className="qc-mini-day"
                  data-dim={!isSameMonth(day, cursor)}
                  data-today={isToday(day)}
                  data-inweek={inWeek}
                  data-wk-start={inWeek && dow === 0}
                  data-wk-end={inWeek && dow === 6}
                  data-holiday={!!holName}
                  title={holName}
                  onClick={() => setCursor(day)}
                >
                  {format(day, "d")}
                </button>
              );
            })}
          </div>
        </div>

        <div className="qc-cal2-sec">
          <div className="qc-cal2-sec__title">Up next</div>
          <div className="qc-cal2-agenda">
            {agendaItems.length === 0 ? (
              <div className="qc-cal2-agenda__empty">Nothing coming up</div>
            ) : (
              agendaItems.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  className="qc-cal2-agenda__item"
                  onClick={() => {
                    setCursor(new Date(e.startMs));
                    if (!e.isHoliday) {
                      setMode("Week");
                      setHighlightId(e.id);
                    }
                  }}
                  title={`${e.title} · ${e.when}`}
                >
                  <span
                    className="qc-cal2-agenda__dot"
                    style={{ backgroundColor: e.color }}
                    aria-hidden
                  />
                  <span className="qc-cal2-agenda__body">
                    <span className="qc-cal2-agenda__title">{e.title}</span>
                    <span className="qc-cal2-agenda__time">{e.when}</span>
                  </span>
                </button>
              ))
            )}
          </div>
          <div className="qc-cal2-filters">
            <div className="qc-cal2-filter">
              <span>Show meetings</span>
              <Switch checked={showMeetings} onChange={setShowMeetings} label="Show meetings" />
            </div>
            <div className="qc-cal2-filter">
              <span>Show holidays</span>
              <Switch checked={showHolidays} onChange={setShowHolidays} label="Show holidays" />
            </div>
          </div>
        </div>
      </aside>

      <div className="qc-cal2-main">
        <header className="qc-cal2-head">
          <div className="qc-cal2-head__left">
            <h1 className="qc-cal2-title">{format(cursor, "MMMM yyyy")}</h1>
            <button
              type="button"
              className="qc-btn qc-btn--ghost"
              onClick={() => setCursor(new Date())}
            >
              Today
            </button>
            <div className="qc-cal2-nav">
              <button
                type="button"
                className="qc-iconbtn"
                aria-label={mode === "Month" ? "Previous month" : "Previous week"}
                onClick={() =>
                  setCursor((c) => (mode === "Month" ? addMonths(c, -1) : addWeeks(c, -1)))
                }
              >
                <ChevronLeft size={18} />
              </button>
              <button
                type="button"
                className="qc-iconbtn"
                aria-label={mode === "Month" ? "Next month" : "Next week"}
                onClick={() =>
                  setCursor((c) => (mode === "Month" ? addMonths(c, 1) : addWeeks(c, 1)))
                }
              >
                <ChevronLeft size={18} style={{ transform: "rotate(180deg)" }} />
              </button>
            </div>
          </div>
          <div className="qc-cal2-head__right">
            <span className="qc-cal2-search">
              <Search size={15} aria-hidden />
              <input className="qc-input" placeholder="Search" aria-label="Search events" />
            </span>
            <div className="qc-cal2-modes" role="tablist" aria-label="Calendar view">
              {(["Day", "Week", "Month"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="tab"
                  aria-selected={mode === m}
                  data-active={mode === m}
                  className="qc-cal2-mode"
                  onClick={() => setMode(m)}
                >
                  {m}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="qc-btn qc-btn--primary qc-cal2-create"
              onClick={openNewMeeting}
            >
              <Plus size={15} aria-hidden /> New meeting
            </button>
          </div>
        </header>

        <div className="qc-cal2-grid">
          {mode === "Month" ? (
            <div className="qc-cal2-month">
              <div className="qc-cal2-month__head">
                {WEEKDAYS.map((w) => (
                  <div key={w} className="qc-cal2-month__dow">
                    {w.toUpperCase()}
                  </div>
                ))}
              </div>
              <div className="qc-cal2-month__grid">
                {miniDays.map((day) => {
                  const inMonth = isSameMonth(day, cursor);
                  const dayEvents = inMonth ? monthEvents.filter((e) => e.d === day.getDate()) : [];
                  const dayHolidays =
                    inMonth && showHolidays
                      ? holidays.filter(
                          (h) => isSameMonth(h.date, cursor) && h.date.getDate() === day.getDate(),
                        )
                      : [];
                  return (
                    <div
                      key={day.toISOString()}
                      className="qc-cal2-mcell"
                      data-dim={!inMonth}
                      data-today={isToday(day)}
                    >
                      <div className="qc-cal2-mdate">{format(day, "d")}</div>
                      <div className="qc-cal2-mcell__events">
                        {dayEvents.map((e, k) => (
                          <button
                            key={k}
                            type="button"
                            className="qc-cal2-mev"
                            title={`${e.title} · ${e.time}`}
                            onClick={() =>
                              setScheduleTarget({
                                event: {
                                  day: day.getDay(),
                                  start: e.start,
                                  end: e.end,
                                  title: e.title,
                                  color: C.blue,
                                },
                                date: day,
                              })
                            }
                          >
                            <span className="qc-cal2-mev__dot" aria-hidden />
                            <span className="qc-cal2-mev__title">{e.title}</span>
                            <span className="qc-cal2-mev__time">{e.time}</span>
                          </button>
                        ))}
                        {dayHolidays.map((h) => (
                          <div
                            key={h.id}
                            className="qc-cal2-mev qc-cal2-mev--holiday"
                            title={h.name}
                          >
                            <span
                              className="qc-cal2-mev__dot"
                              style={{ backgroundColor: HOLIDAY_COLOR }}
                              aria-hidden
                            />
                            <span className="qc-cal2-mev__title">{h.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <>
              <div className="qc-cal2-dayhead">
                <div className="qc-cal2-tzcol">{format(now, "'GMT'xxx").replace(":00", "")}</div>
                {shownDays.map((i) => {
                  const day = days[i];
                  if (!day) return null;
                  return (
                    <div key={i} className="qc-cal2-daycol-head" data-today={isToday(day)}>
                      <span className="qc-cal2-dow">{(WEEKDAYS[i] ?? "").toUpperCase()}</span>
                      <span className="qc-cal2-dnum">{format(day, "d")}</span>
                    </div>
                  );
                })}
              </div>

              {shownDays.some((i) => (weekHolidaysByDay.get(i)?.length ?? 0) > 0) ? (
                <div className="qc-cal2-allday">
                  <div className="qc-cal2-allday__gutter" aria-hidden />
                  {shownDays.map((i) => (
                    <div key={i} className="qc-cal2-allday__cell">
                      {(weekHolidaysByDay.get(i) ?? []).map((name, k) => (
                        <span key={k} className="qc-cal2-allday__chip" title={name}>
                          {name}
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="qc-cal2-body">
                <div
                  className="qc-cal2-timecol"
                  style={{ height: GRID_H, backgroundSize: `100% ${HOUR_H}px` }}
                >
                  {HOURS.map((h) => (
                    <div key={h} className="qc-cal2-hourlabel" style={{ top: pos(h) }}>
                      <span>{hourLabel(h)}</span>
                    </div>
                  ))}
                </div>
                <div className="qc-cal2-cols">
                  {shownDays.map((i) => {
                    const day = days[i];
                    if (!day) return null;
                    return (
                      <div
                        key={i}
                        className="qc-cal2-daycol"
                        style={{ height: GRID_H, backgroundSize: `100% ${HOUR_H}px` }}
                      >
                        {weekEvents
                          .filter((e) => e.day === i)
                          .map((e, k) => (
                            <div
                              key={k}
                              data-event-id={e.id}
                              className={`qc-cal2-event${e.id && e.id === highlightId ? " qc-cal2-event--flash" : ""}`}
                              style={
                                {
                                  top: pos(e.start),
                                  height: (e.end - e.start) * HOUR_H - 3,
                                  ["--ev" as string]: e.color,
                                } as CSSProperties
                              }
                              title={`${e.title} · ${timeLabel(e.start)} - ${timeLabel(e.end)}`}
                            >
                              <span className="qc-cal2-event__title">{e.title}</span>
                              <span className="qc-cal2-event__time">
                                {timeLabel(e.start)} - {timeLabel(e.end)}
                              </span>
                              <button
                                type="button"
                                className="qc-cal2-event__more"
                                aria-label="Event actions"
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  setScheduleTarget({ event: e, date: day });
                                }}
                              >
                                <MoreHorizontal size={14} />
                              </button>
                            </div>
                          ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      {scheduleTarget ? (
        <EventScheduleModal
          event={scheduleTarget.event}
          date={scheduleTarget.date}
          onClose={() => setScheduleTarget(null)}
          onScheduled={() => setRefreshTick((t) => t + 1)}
          currentUserId={currentUserId}
        />
      ) : null}
    </div>
  );
}
