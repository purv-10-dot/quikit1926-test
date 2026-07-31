"use client";

/**
 * Read-only "Teams meetings will be scheduled" model shown in the Client Master
 * Add/Edit form — but ONLY when an active QuikFlow calendar automation exists
 * (the parent gates on `calendarAutomation`). Presentational + pure so it's unit
 * testable; the actual events are created asynchronously by the workflow on save.
 */
import { CalendarDays, Video } from "lucide-react";

export interface ClientMeetingPreviewProps {
  clientName: string;
  dailyStart: string;
  dailyEnd: string;
  weeklyStart: string;
  weeklyEnd: string;
  /** Selected weekday for the weekly meeting (lowercase name), or "". */
  weeklyDay?: string;
  /** Selected weekdays for the daily huddle (lowercase names); empty ⇒ Mon–Fri. */
  dailyDays?: string[];
  /** Recurrence end date (YYYY-MM-DD), or "" for open-ended. */
  until?: string;
  /** Resolved display names of the selected team members (meeting attendees). */
  attendeeNames: string[];
}

const CAP = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const ORDER = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
/** "Mon, Wed, Fri" from lowercase day names, in week order. */
function daysLabel(days: string[]): string {
  const set = new Set(days);
  const picked = ORDER.filter((d) => set.has(d)).map((d) => SHORT[ORDER.indexOf(d)]);
  return picked.length ? picked.join(", ") : "Mon–Fri";
}

export function ClientMeetingPreview({
  clientName,
  dailyStart,
  dailyEnd,
  weeklyStart,
  weeklyEnd,
  weeklyDay,
  dailyDays,
  until,
  attendeeNames,
}: ClientMeetingPreviewProps) {
  const label = clientName || "this client";
  const dailyCadence = daysLabel(dailyDays ?? []);
  const weeklyCadence = weeklyDay ? CAP(weeklyDay) : "Weekly";
  const untilLabel = until ? ` · until ${until}` : "";
  return (
    <div className="rounded-lg border border-accent-200 bg-accent-50/60 p-3">
      <div className="flex items-center gap-2 mb-2">
        <CalendarDays className="h-4 w-4 text-accent-600" />
        <p className="text-xs font-semibold text-accent-700">Teams meetings will be scheduled</p>
        <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-accent-700 border border-accent-200">
          <Video className="h-3 w-3" /> Teams meeting
        </span>
      </div>
      <p className="text-[11px] text-gray-500 mb-2">
        On save, QuikFlow creates these recurring events on the connected Microsoft calendar. Open the
        calendar icon in the header to view them.
      </p>
      <div className="space-y-2">
        <div className="rounded-md bg-white border border-gray-200 px-2.5 py-1.5">
          <p className="text-[11px] font-medium text-gray-700">Daily Huddle — {label}</p>
          <p className="text-[10px] text-gray-500">
            {dailyStart || "--:--"} – {dailyEnd || "--:--"} · {dailyCadence}
            {untilLabel}
          </p>
        </div>
        <div className="rounded-md bg-white border border-gray-200 px-2.5 py-1.5">
          <p className="text-[11px] font-medium text-gray-700">Weekly Meeting — {label}</p>
          <p className="text-[10px] text-gray-500">
            {weeklyStart || "--:--"} – {weeklyEnd || "--:--"} · {weeklyCadence}
            {untilLabel}
          </p>
        </div>
        <div>
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Required attendees</p>
          {attendeeNames.length ? (
            <div className="flex flex-wrap gap-1">
              {attendeeNames.map((name, i) => (
                <span
                  key={`${name}-${i}`}
                  className="inline-flex items-center rounded-full bg-white border border-gray-200 px-2 py-0.5 text-[10px] text-gray-600"
                >
                  {name}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-[10px] text-gray-400">Select team members above to invite them to the meetings.</p>
          )}
        </div>
      </div>
    </div>
  );
}
