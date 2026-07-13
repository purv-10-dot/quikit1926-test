"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { useDashboardBatch } from "@/lib/hooks/use-dashboard-batch";
import {
  ChevronLeft, ChevronRight, ChevronDown, ChevronRight as ChevronRightIcon,
  Cake, PartyPopper, Plane, Home, Briefcase, Gift, MapPin, CalendarDays, Calendar,
  type LucideIcon,
} from "lucide-react";
import { clsx } from "clsx";

interface UpcomingHoliday {
  id: string;
  name: string;
  date: string;
  type: string;
  isFloater: boolean;
  calendar: { id: string; name: string } | null;
}

interface MonthHoliday {
  id: string;
  name: string;
  date: string;
}

interface HolidaysUpcomingResponse {
  upcoming: UpcomingHoliday[];
  monthHolidays: MonthHoliday[];
}

interface JobOpening {
  id: string;
  title: string;
  requisitionNumber: string;
  positions: number;
  filledPositions: number;
  employmentType: string;
  workLocation: string;
  department: { name: string } | null;
}

const FULL_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/* ─────────────────── HOLIDAYS WIDGET ─────────────────── */

export function HolidaysWidget() {
  const api = useApiClient();
  const { data: batch, isLoading } = useDashboardBatch();
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  // How many cards to render in the right-column list. User selectable via
  // the "Next N Events" chip — fetches a fixed superset so toggling is free.
  const [eventCount, setEventCount] = useState<2 | 4 | 6>(2);

  // The current real-world month's calendar dots ship in the single batch call.
  // Only when the user navigates to a *different* month do we fetch on demand.
  const now = new Date();
  const isCurrentMonthView =
    cursor.getMonth() === now.getMonth() && cursor.getFullYear() === now.getFullYear();

  const { data: monthData } = useQuery({
    queryKey: ["home", "holidays-month", cursor.getMonth(), cursor.getFullYear()],
    queryFn: () =>
      api.get<HolidaysUpcomingResponse>(
        `/api/v1/hrms/holidays/upcoming?limit=8&month=${cursor.getMonth()}&year=${cursor.getFullYear()}`
      ),
    staleTime: 5 * 60_000,
    enabled: !isCurrentMonthView,
  });

  // "Upcoming" cards are the next-from-today set (month-independent) — always
  // from the batch. Calendar dots follow the visible month.
  const data = batch;
  const upcoming = batch?.data?.holidays.upcoming ?? [];
  const monthHolidays = isCurrentMonthView
    ? (batch?.data?.holidays.monthHolidays ?? [])
    : (monthData?.data?.monthHolidays ?? []);

  const monthLabel = cursor.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const holidaySet = useMemo(() => {
    const s = new Set<number>();
    for (const h of monthHolidays) {
      const d = new Date(h.date);
      if (d.getMonth() === cursor.getMonth() && d.getFullYear() === cursor.getFullYear()) {
        s.add(d.getDate());
      }
    }
    return s;
  }, [monthHolidays, cursor]);

  return (
    <div className="surface-card p-4">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center">
            <CalendarDays size={16} className="text-green-600" />
          </div>
          <h3 className="text-[13px] font-semibold text-gray-900">Upcoming Holiday / Events</h3>
        </div>
        <Link
          href="/holidays"
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg ring-1 ring-gray-200 hover:bg-gray-50 text-xs font-medium text-gray-700 transition"
        >
          View All <ChevronRightIcon size={13} />
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <MiniCalendar cursor={cursor} setCursor={setCursor} monthLabel={monthLabel} holidaySet={holidaySet} />

        <div className="flex flex-col">
          {/* Section header — sits above the cards, separate from the widget title */}
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-[13px] font-semibold text-gray-900">Upcoming</h4>
            <EventCountChip value={eventCount} onChange={setEventCount} max={Math.min(upcoming.length, 6)} />
          </div>

          <div className="space-y-2.5 flex flex-col">
            {(isLoading || !data) ? (
              <>
                <div className="h-20 rounded-2xl bg-gray-100 animate-pulse" />
                <div className="h-20 rounded-2xl bg-gray-100 animate-pulse" />
              </>
            ) : upcoming.length === 0 ? (
              <HolidaysEmpty />
            ) : (
              upcoming.slice(0, eventCount).map((h, i) => <HolidayCard key={h.id} h={h} idx={i} />)
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Compact "Next N Events" toggle — cycles through 2 / 4 / 6 as the user clicks.
 * Stays inert when there are fewer holidays than the next step.
 */
function EventCountChip({
  value, onChange, max,
}: {
  value: 2 | 4 | 6;
  onChange: (v: 2 | 4 | 6) => void;
  max: number;
}) {
  const options: (2 | 4 | 6)[] = [2, 4, 6];
  const visible = options.filter((o) => o <= max || o === 2);
  const cycle = () => {
    const i = visible.indexOf(value);
    const next = visible[(i + 1) % visible.length] ?? 2;
    onChange(next);
  };
  return (
    <button
      type="button"
      onClick={cycle}
      disabled={visible.length <= 1}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-gray-200 bg-white text-[11px] font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
    >
      Next {value} Events <ChevronDown size={12} />
    </button>
  );
}

function HolidaysEmpty() {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center h-full">
      <div className="relative w-20 h-20 mb-4">
        <div className="absolute inset-0 rounded-2xl bg-green-50 ring-1 ring-green-100">
          <div className="absolute top-2 left-2 right-2 h-2 rounded-t-md bg-green-200/60" />
          <div className="absolute top-5 left-3 right-3 bottom-3 grid grid-cols-3 gap-1 p-1">
            {[...Array(9)].map((_, i) => (
              <div key={i} className="rounded-sm bg-white/70" />
            ))}
          </div>
        </div>
        <div className="absolute -right-1 -bottom-1 w-8 h-8 rounded-full bg-white shadow ring-1 ring-green-100 flex items-center justify-center">
          <PartyPopper size={14} className="text-green-500" />
        </div>
      </div>
      <p className="text-[13px] font-semibold text-gray-900">No upcoming holidays</p>
      <p className="text-xs text-gray-500 mt-1">You&apos;re all clear! Enjoy your day.</p>
    </div>
  );
}

function MiniCalendar({
  cursor, setCursor, monthLabel, holidaySet,
}: {
  cursor: Date;
  setCursor: (d: Date) => void;
  monthLabel: string;
  holidaySet: Set<number>;
}) {
  // "Today" is computed only after mount: new Date() resolves to the server's
  // timezone during SSR but the user's local timezone on the client, so a
  // today-highlight rendered during SSR can mismatch on hydration. Until
  // mounted, no day is highlighted (the static month grid is deterministic).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const today = mounted ? new Date() : null;

  // Month/year picker popover (the "July 2026 ▾" label opens it).
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(cursor.getFullYear());
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const openPicker = () => { setPickerYear(cursor.getFullYear()); setPickerOpen(true); };
  const isCurrentMonth = !!today && today.getMonth() === cursor.getMonth() && today.getFullYear() === cursor.getFullYear();
  const firstDay = new Date(cursor.getFullYear(), cursor.getMonth(), 1).getDay();
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div className="rounded-2xl ring-1 ring-gray-100 bg-white p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="relative">
          <button
            type="button"
            onClick={openPicker}
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-gray-900 hover:text-green-600 transition"
          >
            {monthLabel} <ChevronDown size={16} className={clsx("text-gray-500 transition-transform", pickerOpen && "rotate-180")} />
          </button>
          {pickerOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setPickerOpen(false)} />
              <div className="absolute z-40 top-full left-0 mt-2 w-60 rounded-xl bg-white ring-1 ring-gray-200 shadow-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <button
                    type="button" aria-label="Previous year" onClick={() => setPickerYear((y) => y - 1)}
                    className="w-7 h-7 rounded-lg ring-1 ring-gray-200 hover:bg-gray-50 flex items-center justify-center text-gray-600"
                  >
                    <ChevronLeft size={12} />
                  </button>
                  <span className="text-[13px] font-semibold text-gray-900">{pickerYear}</span>
                  <button
                    type="button" aria-label="Next year" onClick={() => setPickerYear((y) => y + 1)}
                    className="w-7 h-7 rounded-lg ring-1 ring-gray-200 hover:bg-gray-50 flex items-center justify-center text-gray-600"
                  >
                    <ChevronRight size={12} />
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {MONTHS.map((m, i) => {
                    const active = i === cursor.getMonth() && pickerYear === cursor.getFullYear();
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => { setCursor(new Date(pickerYear, i, 1)); setPickerOpen(false); }}
                        className={clsx(
                          "px-2 py-1.5 rounded-lg text-xs font-medium transition",
                          active ? "bg-green-600 text-white" : "text-gray-700 hover:bg-gray-100",
                        )}
                      >
                        {m}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
            className="w-8 h-8 rounded-lg ring-1 ring-gray-200 hover:bg-gray-50 flex items-center justify-center text-gray-600 transition"
            aria-label="Previous month"
          >
            <ChevronLeft size={12} />
          </button>
          <button
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
            className="w-8 h-8 rounded-lg ring-1 ring-gray-200 hover:bg-gray-50 flex items-center justify-center text-gray-600 transition"
            aria-label="Next month"
          >
            <ChevronRight size={12} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 text-center text-xs font-semibold mb-2">
        {FULL_WEEK.map((d, i) => (
          <div
            key={i}
            className={clsx(
              i === 0 && "text-rose-500",
              i === 6 && "text-green-500",
              i !== 0 && i !== 6 && "text-gray-500",
            )}
          >
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-2 text-center">
        {cells.map((d, i) => {
          if (d === null) return <div key={i} />;
          const isToday = isCurrentMonth && d === today?.getDate();
          const isHoliday = holidaySet.has(d);
          const dow = (firstDay + d - 1) % 7;
          const isSunday = dow === 0;
          const isSaturday = dow === 6;
          return (
            <div key={i} className="flex items-center justify-center">
              <div className="relative">
                <span
                  className={clsx(
                    "inline-flex items-center justify-center w-9 h-9 rounded-full text-sm transition cursor-default",
                    isToday && "bg-green-600 text-white font-bold shadow-sm",
                    !isToday && isHoliday && "text-rose-600 font-bold bg-rose-50",
                    !isToday && !isHoliday && isSunday && "text-rose-500 font-medium",
                    !isToday && !isHoliday && isSaturday && "text-green-500 font-medium",
                    !isToday && !isHoliday && !isSunday && !isSaturday && "text-gray-700 hover:bg-gray-50",
                  )}
                >
                  {d}
                </span>
                {isHoliday && !isToday && (
                  <span className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-rose-500" />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Type-driven palette. Each Form 12BB / company-holiday type gets its own
// hue so the eye can scan the list at a glance — Religious is violet,
// National saffron-amber, Regional green, etc. Falls back to slate.
interface HolidayPalette {
  cardBg: string;
  dateBg: string;
  dateRing: string;
  dateText: string;
  dot: string;
  accentText: string;
  iconBg: string;
  iconColor: string;
  hover: string;
}

function paletteForType(rawType: string, isFloater: boolean): { palette: HolidayPalette; label: string } {
  const t = (rawType || "").toLowerCase();
  if (isFloater)
    return {
      label: "Floater",
      palette: {
        cardBg: "bg-sky-50/60", dateBg: "bg-white", dateRing: "ring-sky-200",
        dateText: "text-sky-900", dot: "bg-sky-500", accentText: "text-sky-700",
        iconBg: "bg-sky-100", iconColor: "text-sky-700", hover: "hover:bg-sky-50",
      },
    };
  if (t === "religious" || t === "restricted")
    return {
      label: t === "restricted" ? "Restricted" : "Religious",
      palette: {
        cardBg: "bg-violet-50/60", dateBg: "bg-white", dateRing: "ring-violet-200",
        dateText: "text-violet-900", dot: "bg-violet-500", accentText: "text-violet-700",
        iconBg: "bg-violet-100", iconColor: "text-violet-700", hover: "hover:bg-violet-50",
      },
    };
  if (t === "national")
    return {
      label: "National Holiday",
      palette: {
        cardBg: "bg-amber-50/60", dateBg: "bg-white", dateRing: "ring-amber-200",
        dateText: "text-amber-900", dot: "bg-amber-500", accentText: "text-amber-700",
        iconBg: "bg-amber-100", iconColor: "text-amber-700", hover: "hover:bg-amber-50",
      },
    };
  if (t === "regional")
    return {
      label: "Regional",
      palette: {
        cardBg: "bg-emerald-50/60", dateBg: "bg-white", dateRing: "ring-emerald-200",
        dateText: "text-emerald-900", dot: "bg-emerald-500", accentText: "text-emerald-700",
        iconBg: "bg-emerald-100", iconColor: "text-emerald-700", hover: "hover:bg-emerald-50",
      },
    };
  if (t === "company")
    return {
      label: "Company",
      palette: {
        cardBg: "bg-green-50/60", dateBg: "bg-white", dateRing: "ring-green-200",
        dateText: "text-green-900", dot: "bg-green-500", accentText: "text-green-700",
        iconBg: "bg-green-100", iconColor: "text-green-700", hover: "hover:bg-green-50",
      },
    };
  if (t === "mandatory")
    return {
      label: "Mandatory",
      palette: {
        cardBg: "bg-rose-50/60", dateBg: "bg-white", dateRing: "ring-rose-200",
        dateText: "text-rose-900", dot: "bg-rose-500", accentText: "text-rose-700",
        iconBg: "bg-rose-100", iconColor: "text-rose-700", hover: "hover:bg-rose-50",
      },
    };
  if (t === "optional")
    return {
      label: "Optional",
      palette: {
        cardBg: "bg-slate-50/60", dateBg: "bg-white", dateRing: "ring-slate-200",
        dateText: "text-slate-900", dot: "bg-slate-500", accentText: "text-slate-700",
        iconBg: "bg-slate-100", iconColor: "text-slate-700", hover: "hover:bg-slate-50",
      },
    };
  // Unknown / empty type — neutral fallback.
  return {
    label: rawType || "Holiday",
    palette: {
      cardBg: "bg-gray-50/60", dateBg: "bg-white", dateRing: "ring-gray-200",
      dateText: "text-gray-900", dot: "bg-gray-500", accentText: "text-gray-700",
      iconBg: "bg-gray-100", iconColor: "text-gray-700", hover: "hover:bg-gray-50",
    },
  };
}

function getHolidayCountdown(target: Date): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const t = new Date(target);
  t.setHours(0, 0, 0, 0);
  const diff = Math.round((t.getTime() - today.getTime()) / 86_400_000);
  if (diff < 0) return "Past";
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff < 30) return `${diff} days left`;
  const months = Math.round(diff / 30);
  return `${months} mo left`;
}

function HolidayCard({ h, idx }: { h: UpcomingHoliday; idx: number }) {
  const date = new Date(h.date);
  const weekday = date.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase();
  const day = date.getDate();
  const monthAbbr = date.toLocaleDateString("en-US", { month: "short" }).toUpperCase();

  const { palette, label } = paletteForType(h.type, h.isFloater);
  const countdown = getHolidayCountdown(date);
  const isToday = countdown === "Today";

  return (
    <div
      className={clsx(
        "row-stagger flex items-center gap-3 rounded-2xl p-3 transition-colors",
        palette.cardBg, palette.hover,
      )}
      style={{ ["--i" as never]: Math.min(idx, 10) }}
    >
      {/* Calendar-tear date block — WEEKDAY / DAY / MONTH stacked, ringed */}
      <div
        aria-hidden
        className={clsx(
          "shrink-0 w-14 rounded-xl ring-1 px-2 py-1.5 text-center",
          palette.dateBg, palette.dateRing, palette.dateText,
        )}
      >
        <div className={clsx("text-[10px] font-semibold uppercase tracking-[0.12em] leading-none", palette.accentText)}>
          {weekday}
        </div>
        <div className="my-1 text-[22px] font-bold leading-none tabular-nums">{day}</div>
        <div className={clsx("text-[10px] font-semibold uppercase tracking-[0.12em] leading-none", palette.accentText)}>
          {monthAbbr}
        </div>
      </div>

      {/* Body — holiday name + dotted type meta */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold text-gray-900" title={h.name}>
          {h.name}
        </p>
        <div className="mt-1 flex items-center gap-1.5">
          <span className={clsx("h-1.5 w-1.5 rounded-full", palette.dot)} aria-hidden />
          <span className={clsx("text-[12px] font-medium", palette.accentText)}>{label}</span>
        </div>
      </div>

      {/* Right column — icon tile + countdown */}
      <div className="shrink-0 text-center">
        <div
          className={clsx(
            "w-9 h-9 rounded-lg flex items-center justify-center mx-auto",
            palette.iconBg, palette.iconColor,
          )}
        >
          {isToday ? <Calendar size={16} /> : <PartyPopper size={16} />}
        </div>
        <p className={clsx("mt-1 text-[11px] font-semibold whitespace-nowrap", palette.accentText)}>
          {countdown}
        </p>
      </div>
    </div>
  );
}

/* ─────────────────── BIRTHDAYS WIDGET ─────────────────── */

export function BirthdaysWidget() {
  const { data, isLoading } = useDashboardBatch();
  const all = data?.data?.birthdays ?? [];
  const todays = all.filter((b) => b.daysUntil === 0);
  const next = all.find((b) => b.daysUntil > 0) ?? null;

  return (
    <div className="surface-card p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-pink-50 flex items-center justify-center">
            <Cake size={15} className="text-pink-500" />
          </div>
          <h3 className="text-[13px] font-semibold text-gray-900">Upcoming Birthdays</h3>
        </div>
        <Link href="/celebrations?tab=birthdays" className="text-xs font-medium text-green-600 hover:underline">
          View All
        </Link>
      </div>
      {(isLoading || !data) ? (
        <div className="h-10 rounded-lg bg-gray-100 animate-pulse" />
      ) : todays.length > 0 ? (
        <PersonRow people={todays} suffix="Today" />
      ) : next ? (
        <PersonRow
          people={[next]}
          suffix={next.daysUntil === 1 ? "Tomorrow" : `in ${next.daysUntil}d`}
        />
      ) : (
        <EmptyMini icon={<Cake size={14} className="text-gray-400" />} text="No birthdays soon" />
      )}
    </div>
  );
}

/* ─────────────────── ANNIVERSARIES WIDGET ─────────────────── */

export function AnniversariesWidget() {
  const { data, isLoading } = useDashboardBatch();
  const items = data?.data?.anniversaries ?? [];
  const next = items[0] ?? null;

  return (
    <div className="surface-card p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center">
            <Gift size={15} className="text-violet-500" />
          </div>
          <h3 className="text-[13px] font-semibold text-gray-900">Upcoming Work Anniversaries</h3>
        </div>
        <Link href="/celebrations?tab=anniversaries" className="text-xs font-medium text-green-600 hover:underline">
          View All
        </Link>
      </div>
      {(isLoading || !data) ? (
        <div className="h-10 rounded-lg bg-gray-100 animate-pulse" />
      ) : next ? (
        <PersonRow
          people={[next]}
          suffix={next.daysUntil === 0 ? `Today · ${next.years}y` : next.daysUntil === 1 ? `Tomorrow · ${next.years}y` : `in ${next.daysUntil}d · ${next.years}y`}
        />
      ) : (
        <EmptyMini icon={<Gift size={14} className="text-gray-400" />} text="No anniversaries soon" />
      )}
    </div>
  );
}

function PersonRow({
  people, suffix,
}: {
  people: { id: string; firstName: string; lastName: string; profilePhoto: string | null }[];
  suffix: string;
}) {
  const head = people[0];
  const more = people.length - 1;
  return (
    <div className="flex items-center gap-3">
      <Avatar p={head} />
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-gray-900 truncate">
          {head.firstName} {head.lastName}
          {more > 0 && <span className="text-gray-500 font-medium"> +{more}</span>}
        </p>
        <p className="text-xs text-gray-500">{suffix}</p>
      </div>
    </div>
  );
}

function EmptyMini({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-2.5 text-gray-500">
      <div className="w-9 h-9 rounded-full bg-gray-50 flex items-center justify-center">{icon}</div>
      <p className="text-xs">{text}</p>
    </div>
  );
}

function Avatar({ p }: { p: { firstName: string; lastName: string; profilePhoto: string | null } }) {
  const initials = `${(p.firstName?.[0] ?? "").toUpperCase()}${(p.lastName?.[0] ?? "").toUpperCase()}`;
  return (
    <div className="w-10 h-10 rounded-full overflow-hidden bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center text-xs font-bold text-white ring-2 ring-white shadow-sm shrink-0">
      {p.profilePhoto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.profilePhoto} alt="" className="w-full h-full object-cover" />
      ) : (
        initials
      )}
    </div>
  );
}

/* ─────────────────── STAT CARDS (Leave / WFH / Events / Birthdays) ─────────────────── */

export function HomeStatRow() {
  const { data } = useDashboardBatch();

  const rows = data?.data?.availability ?? [];
  const onLeave = rows.filter((r) => r.category !== "WFH").reduce((s, r) => s + r.count, 0);
  const wfh = rows.find((r) => r.category === "WFH")?.count ?? 0;

  const eventsToday = data?.data?.eventsToday ?? 0;

  const todaysBirthdays = data?.data?.birthdayCounts.today ?? 0;
  const upcomingBirthdays = data?.data?.birthdayCounts.month ?? 0;
  const birthdayValue = todaysBirthdays > 0 ? todaysBirthdays : upcomingBirthdays;
  const birthdayCaption = todaysBirthdays > 0 ? "Birthdays today" : upcomingBirthdays > 0 ? "Upcoming this month" : "No birthdays soon";

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        iconBg="bg-sky-50" iconColor="text-sky-500" Icon={Plane}
        label="Leave" value={onLeave} caption={onLeave === 0 ? "People on leave" : onLeave === 1 ? "Person on leave" : "People on leave"}
        href="/leaves/team-leaves"
      />
      <StatCard
        iconBg="bg-emerald-50" iconColor="text-emerald-500" Icon={Home}
        label="Work From Home" value={wfh} caption="Working from home today"
        href="/wfh/team"
      />
      <StatCard
        iconBg="bg-amber-50" iconColor="text-amber-600" Icon={Briefcase}
        label="Today's Events" value={eventsToday} caption={eventsToday === 0 ? "No events today" : "Events scheduled"}
        href="/holidays" linkLabel="View Calendar"
      />
      <StatCard
        iconBg="bg-pink-50" iconColor="text-pink-500" Icon={Cake}
        label="Birthdays" value={birthdayValue} caption={birthdayCaption}
        href="/celebrations?tab=birthdays"
      />
    </div>
  );
}

function StatCard({
  iconBg, iconColor, Icon, label, value, caption, href, linkLabel = "View All",
}: {
  iconBg: string;
  iconColor: string;
  Icon: LucideIcon;
  label: string;
  value: number;
  caption: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="surface-card p-4 flex flex-col">
      <div className="flex items-start gap-3">
        <div className={clsx("w-12 h-12 rounded-xl flex items-center justify-center shrink-0", iconBg)}>
          <Icon size={20} className={iconColor} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-gray-900 truncate">{label}</p>
          <p className="font-serif-display text-xl font-bold text-gray-900 leading-tight mt-0.5">{value}</p>
          <p className="text-[11px] text-gray-500 truncate">{caption}</p>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────── JOB OPENINGS ─────────────────── */

const JOB_TITLE_COLORS = [
  "text-emerald-700",
  "text-green-700",
  "text-rose-700",
  "text-amber-700",
  "text-sky-700",
  "text-violet-700",
];

const EMPLOYMENT_LABELS: Record<string, { label: string; cls: string }> = {
  FullTime: { label: "Full Time", cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  PartTime: { label: "Part Time", cls: "bg-sky-50 text-sky-700 ring-sky-200" },
  Contract: { label: "Contract", cls: "bg-amber-50 text-amber-700 ring-amber-200" },
  Internship: { label: "Internship", cls: "bg-violet-50 text-violet-700 ring-violet-200" },
  Temporary: { label: "Temporary", cls: "bg-rose-50 text-rose-700 ring-rose-200" },
};

const WORK_LOCATION_LABELS: Record<string, string> = {
  Office: "On-site",
  Remote: "Remote",
  Hybrid: "Hybrid",
};

export function JobOpeningsWidget() {
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 3;

  const { data, isLoading } = useDashboardBatch();
  const openings = data?.data?.jobOpenings.items ?? [];
  const totalOpen = data?.data?.jobOpenings.totalOpen ?? 0;
  const pageStart = page * PAGE_SIZE;
  const visible = openings.slice(pageStart, pageStart + PAGE_SIZE);
  const hasNext = pageStart + PAGE_SIZE < openings.length;
  const hasPrev = page > 0;

  return (
    <div className="surface-card p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
            <Briefcase size={15} className="text-amber-600" />
          </div>
          <h3 className="text-[13px] font-semibold text-gray-900">Job Openings</h3>
          {totalOpen > 0 && (
            <span className="px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[11px] font-medium ring-1 ring-amber-200">
              {totalOpen} open
            </span>
          )}
        </div>
        <Link
          href="/recruit/requisitions"
          className="inline-flex items-center gap-1 text-xs font-medium text-green-600 hover:text-green-700"
        >
          View All <ChevronRightIcon size={12} />
        </Link>
      </div>

      {(isLoading || !data) ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-gray-100 animate-pulse" />
          ))}
        </div>
      ) : openings.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mb-2">
            <Briefcase size={18} className="text-gray-400" />
          </div>
          <p className="text-[13px] font-semibold text-gray-700">No open requisitions</p>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          {hasPrev && (
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="w-9 h-9 rounded-full ring-1 ring-gray-200 hover:bg-gray-50 flex items-center justify-center text-gray-600 shrink-0"
              aria-label="Previous"
            >
              <ChevronLeft size={12} />
            </button>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 flex-1">
            {visible.map((o, i) => (
              <JobCard key={o.id} job={o} colorIdx={pageStart + i} />
            ))}
          </div>
          {hasNext && (
            <button
              onClick={() => setPage((p) => p + 1)}
              className="w-9 h-9 rounded-full ring-1 ring-gray-200 hover:bg-gray-50 flex items-center justify-center text-gray-600 shrink-0"
              aria-label="Next"
            >
              <ChevronRight size={12} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function JobCard({ job, colorIdx }: { job: JobOpening; colorIdx: number }) {
  const titleColor = JOB_TITLE_COLORS[colorIdx % JOB_TITLE_COLORS.length];
  const empType = EMPLOYMENT_LABELS[job.employmentType] ?? { label: job.employmentType, cls: "bg-gray-100 text-gray-700 ring-gray-200" };
  const locLabel = WORK_LOCATION_LABELS[job.workLocation] ?? job.workLocation;
  const locText = job.department?.name ? `${locLabel} · ${job.department.name}` : locLabel;

  return (
    <Link
      href="/recruit/requisitions"
      className="rounded-xl ring-1 ring-gray-200 p-3.5 hover:shadow-sm hover:border-gray-300 transition flex items-start justify-between gap-3 bg-white"
    >
      <div className="min-w-0">
        <p className={clsx("text-[13px] font-semibold truncate", titleColor)}>{job.title}</p>
        <p className="text-[11px] text-gray-500 mt-1 inline-flex items-center gap-1 truncate">
          <MapPin size={11} className="shrink-0" /> {locText}
        </p>
      </div>
      <span className={clsx("px-2.5 py-1 rounded-md text-[10px] font-medium ring-1 shrink-0", empType.cls)}>
        {empType.label}
      </span>
    </Link>
  );
}
