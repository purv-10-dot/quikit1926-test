"use client";

/**
 * Client Master → Microsoft Teams calendar viewer. Reads the org's connected
 * Teams/Outlook calendar via /api/client-meetings/calendar (which proxies to
 * QuikFlow, where the OAuth connection lives) and renders a month grid. Clicking
 * an event shows its detail (time, organizer, Teams join link). When no calendar
 * is connected the modal explains how to connect one in QuikFlow — matching the
 * "managed by QuikFlow only" rule (no workflow/connection → nothing to show).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, X, Video, ExternalLink, Clock } from "lucide-react";

interface CalendarEvent {
  id: string;
  subject: string;
  start: string;
  end: string;
  isOnlineMeeting: boolean;
  joinUrl: string | null;
  organizer: string | null;
  webLink: string | null;
}

interface CalendarData {
  connected: boolean;
  organizer: string | null;
  events: CalendarEvent[];
}

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Local YYYY-MM-DD key for grouping events by day. */
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Days (as Dates) that fill the month grid, padded to whole Mon–Sun weeks. */
function monthGridDays(anchor: Date): Date[] {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  // JS getDay(): 0=Sun..6=Sat → shift so Monday is column 0.
  const lead = (first.getDay() + 6) % 7;
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - lead);
  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    days.push(d);
  }
  return days;
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function ClientCalendarModal({ onClose }: { onClose: () => void }) {
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const [data, setData] = useState<CalendarData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<CalendarEvent | null>(null);

  const load = useCallback(async (a: Date) => {
    setLoading(true);
    setError(null);
    const start = new Date(Date.UTC(a.getFullYear(), a.getMonth(), 1)).toISOString();
    const end = new Date(Date.UTC(a.getFullYear(), a.getMonth() + 1, 1)).toISOString();
    try {
      const res = await fetch(
        `/api/client-meetings/calendar?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
        { cache: "no-store" },
      );
      const json = (await res.json().catch(() => null)) as { success?: boolean; data?: CalendarData; error?: string } | null;
      if (!res.ok || !json?.success || !json.data) {
        throw new Error(json?.error ?? "Failed to load calendar");
      }
      setData(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load calendar");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(anchor);
  }, [anchor, load]);

  // Close on Escape.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of data?.events ?? []) {
      const key = dayKey(new Date(ev.start));
      const list = map.get(key) ?? [];
      list.push(ev);
      map.set(key, list);
    }
    return map;
  }, [data]);

  const gridDays = useMemo(() => monthGridDays(anchor), [anchor]);
  const monthLabel = anchor.toLocaleDateString([], { month: "long", year: "numeric" });
  const todayKey = dayKey(new Date());

  const stepMonth = (delta: number) =>
    setAnchor((a) => new Date(a.getFullYear(), a.getMonth() + delta, 1));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-accent-600" />
            <h2 className="text-base font-semibold text-gray-800">Teams Calendar</h2>
            {data?.organizer ? (
              <span className="text-xs text-gray-400">· {data.organizer}</span>
            ) : null}
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => stepMonth(-1)}
              className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100"
              title="Previous month"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="min-w-[9rem] text-center text-sm font-medium text-gray-700">{monthLabel}</span>
            <button
              type="button"
              onClick={() => stepMonth(1)}
              className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100"
              title="Next month"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setAnchor(new Date())}
              className="ml-1 rounded-md border border-gray-200 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
            >
              Today
            </button>
            <button type="button" onClick={onClose} className="ml-1 rounded-md p-1.5 text-gray-400 hover:bg-gray-100">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-auto p-4">
          {loading ? (
            <div className="flex h-64 items-center justify-center text-sm text-gray-400">Loading calendar…</div>
          ) : error ? (
            <div className="flex h-64 items-center justify-center text-sm text-red-600">{error}</div>
          ) : data && !data.connected ? (
            <div className="flex h-64 flex-col items-center justify-center gap-2 text-center">
              <CalendarDays className="h-8 w-8 text-gray-300" />
              <p className="text-sm font-medium text-gray-600">No Microsoft Teams calendar connected</p>
              <p className="max-w-sm text-xs text-gray-400">
                Connect a Microsoft Teams account in QuikFlow → Integrations, then a workflow can create
                Daily Huddle &amp; Weekly Meeting events here.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-lg border border-gray-200">
              {/* Weekday header */}
              <div className="grid grid-cols-7 border-b border-gray-200 bg-accent-50">
                {WEEKDAY_LABELS.map((w) => (
                  <div key={w} className="px-2 py-1.5 text-center text-[11px] font-semibold text-gray-500">
                    {w}
                  </div>
                ))}
              </div>
              {/* Day grid */}
              <div className="grid grid-cols-7">
                {gridDays.map((d, i) => {
                  const key = dayKey(d);
                  const inMonth = d.getMonth() === anchor.getMonth();
                  const dayEvents = eventsByDay.get(key) ?? [];
                  const isToday = key === todayKey;
                  return (
                    <div
                      key={i}
                      className={`min-h-[92px] border-b border-r border-gray-100 p-1.5 ${
                        inMonth ? "bg-white" : "bg-gray-50/60"
                      }`}
                    >
                      <div
                        className={`mb-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${
                          isToday ? "bg-accent-600 font-semibold text-white" : inMonth ? "text-gray-600" : "text-gray-300"
                        }`}
                      >
                        {d.getDate()}
                      </div>
                      <div className="space-y-1">
                        {dayEvents.slice(0, 3).map((ev) => (
                          <button
                            key={ev.id}
                            type="button"
                            onClick={() => setSelected(ev)}
                            className="flex w-full items-center gap-1 truncate rounded bg-accent-50 px-1.5 py-0.5 text-left text-[11px] text-accent-700 hover:bg-accent-100"
                            title={ev.subject}
                          >
                            {ev.isOnlineMeeting ? <Video className="h-3 w-3 shrink-0" /> : null}
                            <span className="truncate">
                              {fmtTime(ev.start)} {ev.subject}
                            </span>
                          </button>
                        ))}
                        {dayEvents.length > 3 ? (
                          <p className="px-1 text-[10px] text-gray-400">+{dayEvents.length - 3} more</p>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Event detail */}
      {selected ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
          onClick={() => setSelected(null)}
          role="presentation"
        >
          <div
            className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="mb-3 flex items-start justify-between">
              <h3 className="text-base font-semibold text-gray-800">{selected.subject}</h3>
              <button type="button" onClick={() => setSelected(null)} className="rounded-md p-1 text-gray-400 hover:bg-gray-100">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-2 text-sm text-gray-600">
              <p className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-gray-400" />
                {new Date(selected.start).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })} –{" "}
                {fmtTime(selected.end)}
              </p>
              {selected.organizer ? (
                <p className="text-xs text-gray-500">Organizer: {selected.organizer}</p>
              ) : null}
              {selected.isOnlineMeeting && selected.joinUrl ? (
                <a
                  href={selected.joinUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-accent-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-700"
                >
                  <Video className="h-4 w-4" /> Join Teams meeting
                </a>
              ) : null}
              {selected.webLink ? (
                <a
                  href={selected.webLink}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-accent-700 hover:underline"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Open in Outlook
                </a>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
