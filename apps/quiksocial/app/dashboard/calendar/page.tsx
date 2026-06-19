"use client";

export const dynamic = "force-dynamic";

import { unwrap } from "@/lib/utils/api-fetch";
import { useState, useEffect, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import { toZonedTime } from "date-fns-tz";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ChevronDown, Sparkles, Plus } from "lucide-react";
import {
  HOLIDAYS,
  getHolidaysForDate,
  HOLIDAY_DOT_COLOR,
  COUNTRY_OPTIONS,
  type Holiday,
} from "@/lib/constants/holidays";
import CalendarDayPanel, {
  type CalendarPost,
} from "@/components/calendar/CalendarDayPanel";
import PlanMonthModal, { type PlanCard } from "@/components/calendar/PlanMonthModal";

// ─── Constants ────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const DAY_HEADERS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const VIEW_OPTIONS = ["Month","Week","Day"] as const;
type ViewMode = (typeof VIEW_OPTIONS)[number];

const STATUS_DOT: Record<string, string> = {
  published: "#22C55E",
  scheduled: "#3B82F6",
  approved:  "#8B5CF6",
  review:    "#F59E0B",
  overdue:   "#F97316",
  draft:     "#6B7280",
  failed:    "#EF4444",
};

const LS_COUNTRY_KEY = "qs-calendar-country";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function toMMDD(d: Date): string {
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Returns 42 cells (6 rows × 7 cols), Mon-first; null = padding. */
function buildMonthCells(year: number, month: number): Array<Date | null> {
  const first = new Date(year, month, 1);
  const last  = new Date(year, month + 1, 0);
  // Mon = 0 offset
  const offset = (first.getDay() + 6) % 7;
  const cells: Array<Date | null> = Array(offset).fill(null);
  for (let d = 1; d <= last.getDate(); d++) {
    cells.push(new Date(year, month, d));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/** Returns Mon–Sun of the week containing `date`. */
function buildWeekDays(date: Date): Date[] {
  const d   = new Date(date);
  const dow = (d.getDay() + 6) % 7; // Mon = 0
  d.setDate(d.getDate() - dow);
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(d);
    day.setDate(d.getDate() + i);
    return day;
  });
}

function formatTimeShort(dateStr: string | null, tz: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  // F2 display: render the stored UTC instant in the user's profile tz.
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", timeZone: tz });
}

// ─── Tooltip types ────────────────────────────────────────────────────────────

interface TooltipState {
  post: CalendarPost;
  x: number;
  y: number;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CalendarPage() {
  const today = new Date();
  // F2 display: the user's profile tz drives both the day a post buckets
  // into and the time chip shown on it (default UTC).
  const { data: session } = useSession();
  const tz = (session?.user as { timezone?: string } | undefined)?.timezone || "UTC";

  // View state
  const [viewMode,    setViewMode]    = useState<ViewMode>("Month");
  // currentDate anchors all three views — Month reads only its month/year,
  // while Week/Day derive their range from the full date. It MUST start as
  // today (not the 1st of the month), or Week/Day open on the week containing
  // the 1st (e.g. May 1 → "Apr 27 – May 3") regardless of today.
  const [currentDate, setCurrentDate] = useState(new Date());

  // Country / holiday
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null);
  const [countryDropOpen, setCountryDropOpen] = useState(false);
  const countryRef = useRef<HTMLDivElement>(null);

  // Data
  const [activeBrandId, setActiveBrandId] = useState<string | null>(null);
  const [posts,         setPosts]         = useState<CalendarPost[]>([]);
  const [loading,       setLoading]       = useState(false);

  // Day panel
  const [selectedDay,  setSelectedDay]  = useState<Date | null>(null);

  // Monthly AI planning modal
  const [planModalOpen, setPlanModalOpen] = useState(false);

  // Post dot tooltip
  const [tooltip,      setTooltip]      = useState<TooltipState | null>(null);
  const tooltipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Init: load country from localStorage, fetch active brand ─────────────
  useEffect(() => {
    const saved = localStorage.getItem(LS_COUNTRY_KEY);
    if (saved) setSelectedCountry(saved === "null" ? null : saved);

    fetch("/api/user/active-brand", { credentials: "include" })
      .then((r) => r.json()).then(unwrap)
      .then((d) => setActiveBrandId(d.activeBrandId ?? d.brandId ?? null))
      .catch(() => {});
  }, []);

  // ── Persist country selection ──────────────────────────────────────────────
  useEffect(() => {
    localStorage.setItem(LS_COUNTRY_KEY, selectedCountry ?? "null");
  }, [selectedCountry]);

  // ── Fetch posts for visible range ──────────────────────────────────────────
  const fetchPosts = useCallback(async () => {
    if (!activeBrandId) return;
    setLoading(true);
    try {
      let startDate: Date, endDate: Date;

      if (viewMode === "Month") {
        startDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        endDate   = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59);
      } else if (viewMode === "Week") {
        const week  = buildWeekDays(currentDate);
        startDate   = week[0];
        endDate     = new Date(week[6]);
        endDate.setHours(23, 59, 59);
      } else {
        startDate = new Date(currentDate);
        startDate.setHours(0, 0, 0);
        endDate   = new Date(currentDate);
        endDate.setHours(23, 59, 59);
      }

      const params = new URLSearchParams({
        brandId:   activeBrandId,
        startDate: startDate.toISOString(),
        endDate:   endDate.toISOString(),
      });

      const res  = await fetch(`/api/posts?${params}`, { credentials: "include" });
      const data = unwrap(await res.json());
      setPosts(data.posts ?? []);
    } catch {
      setPosts([]);
    } finally {
      setLoading(false);
    }
  }, [activeBrandId, currentDate, viewMode]);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  // ── Close country dropdown on outside click ────────────────────────────────
  useEffect(() => {
    if (!countryDropOpen) return;
    const h = (e: MouseEvent) => {
      if (countryRef.current && !countryRef.current.contains(e.target as Node)) {
        setCountryDropOpen(false);
      }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [countryDropOpen]);

  // ── Navigation ────────────────────────────────────────────────────────────
  const navigate = (dir: -1 | 1) => {
    setCurrentDate((prev) => {
      const next = new Date(prev);
      if (viewMode === "Month") {
        next.setMonth(next.getMonth() + dir);
        next.setDate(1);
      } else if (viewMode === "Week") {
        next.setDate(next.getDate() + dir * 7);
      } else {
        next.setDate(next.getDate() + dir);
      }
      return next;
    });
  };

  const goToday = () => {
    // Jump to *today* — Month shows the current month, Week the current week,
    // Day today. (Was pinned to the 1st, so Week/Day never reached this week.)
    setCurrentDate(new Date());
  };

  // ── Tooltip handlers ──────────────────────────────────────────────────────
  const showDotTooltip = (post: CalendarPost, e: React.MouseEvent) => {
    if (tooltipTimer.current) clearTimeout(tooltipTimer.current);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    tooltipTimer.current = setTimeout(() => {
      setTooltip({ post, x: rect.left + rect.width / 2, y: rect.top });
    }, 300);
  };

  const hideDotTooltip = () => {
    if (tooltipTimer.current) clearTimeout(tooltipTimer.current);
    setTooltip(null);
  };

  // A post lands on the calendar by its most relevant date:
  //   scheduledFor → scheduled / overdue
  //   publishedAt  → published (carry NO scheduledFor — previously dropped)
  //   createdAt    → drafts / approved with no date yet
  // Mirrors the /api/posts date filter so what's fetched is what's shown.
  function relevantDate(post: CalendarPost): string | null {
    return post.scheduledFor ?? post.publishedAt ?? post.createdAt ?? null;
  }

  // ── Derived: posts mapped by YYYY-MM-DD key ───────────────────────────────
  const postsByDay = posts.reduce<Record<string, CalendarPost[]>>((acc, post) => {
    const rel = relevantDate(post);
    if (!rel) return acc;
    // F2: bucket by the post's civil date IN THE USER'S tz, not the
    // browser's. toZonedTime maps the UTC instant so getFullYear/Month/Date
    // read the zoned wall-clock — a late-night post lands on the day the
    // user actually scheduled it. The grid cells (getDayPosts) use plain
    // civil-date Dates, which are tz-agnostic, so the two keys align.
    const d    = toZonedTime(new Date(rel), tz);
    const key  = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(post);
    return acc;
  }, {});

  function getDayPosts(date: Date): CalendarPost[] {
    const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    return postsByDay[key] ?? [];
  }

  function getDayHoliday(date: Date): Holiday | null {
    const holidays = getHolidaysForDate(date, selectedCountry);
    return holidays[0] ?? null;
  }

  function getCellBorderColor(dayPosts: CalendarPost[]): string | null {
    if (dayPosts.some((p) => p.status === "overdue")) return "#EF4444";
    if (dayPosts.some((p) => p.status === "review"))  return "#F59E0B";
    return null;
  }

  // ── Header label ─────────────────────────────────────────────────────────
  function getHeaderLabel(): string {
    if (viewMode === "Month") {
      return `${MONTH_NAMES[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
    }
    if (viewMode === "Week") {
      const week = buildWeekDays(currentDate);
      const s    = week[0];
      const e    = week[6];
      if (s.getMonth() === e.getMonth()) {
        return `${MONTH_NAMES[s.getMonth()]} ${s.getDate()}–${e.getDate()}, ${s.getFullYear()}`;
      }
      return `${MONTH_NAMES[s.getMonth()]} ${s.getDate()} – ${MONTH_NAMES[e.getMonth()]} ${e.getDate()}, ${s.getFullYear()}`;
    }
    return `${DAY_HEADERS[(currentDate.getDay() + 6) % 7]}, ${MONTH_NAMES[currentDate.getMonth()]} ${currentDate.getDate()}, ${currentDate.getFullYear()}`;
  }

  const selectedDayPosts   = selectedDay ? getDayPosts(selectedDay) : [];
  const selectedDayHoliday = selectedDay ? getDayHoliday(selectedDay) : null;

  // ── Shared styles ─────────────────────────────────────────────────────────

  // Tokens — see apps/web/src/lib/constants/design-tokens.md (Primary glass card).
  const glassCard: React.CSSProperties = {
    background: "rgba(33, 33, 33, 0.14)",
    border: "1px solid rgba(255, 255, 255, 0.10)",
    backdropFilter: "blur(24px)",
    WebkitBackdropFilter: "blur(24px)",
    borderRadius: 16,
    boxShadow: "0 8px 32px rgba(0, 0, 0, 0.25)",
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Sub-renders
  // ─────────────────────────────────────────────────────────────────────────

  // ── Status dots row ───────────────────────────────────────────────────────
  function StatusDots({ dayPosts }: { dayPosts: CalendarPost[] }) {
    const visible = dayPosts.slice(0, 4);
    const extra   = dayPosts.length - 4;
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 3, flexWrap: "wrap" }}>
        {visible.map((post) => (
          <span
            key={post._id}
            title={post.content?.slice(0, 60)}
            onMouseEnter={(e) => showDotTooltip(post, e)}
            onMouseLeave={hideDotTooltip}
            style={{
              width: 7,
              height: 7,
              borderRadius: "50%",
              background: STATUS_DOT[post.status] ?? "#6B7280",
              flexShrink: 0,
              cursor: "pointer",
              display: "inline-block",
            }}
          />
        ))}
        {extra > 0 && (
          <span style={{ fontSize: 9, color: "rgba(255,255,255,0.45)", lineHeight: 1 }}>
            +{extra}
          </span>
        )}
      </div>
    );
  }

  // ── Month view ────────────────────────────────────────────────────────────
  function MonthView() {
    const cells = buildMonthCells(currentDate.getFullYear(), currentDate.getMonth());

    return (
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
        {/* Day-of-week headers */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            gap: 1,
            marginBottom: 1,
          }}
        >
          {DAY_HEADERS.map((h) => (
            <div
              key={h}
              style={{
                textAlign: "center",
                padding: "8px 0",
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.05em",
                color: "rgba(255,255,255,0.40)",
              }}
            >
              {h}
            </div>
          ))}
        </div>

        {/* Grid */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            gap: 3,
            flex: 1,
          }}
        >
          {cells.map((day, idx) => {
            if (!day) {
              return (
                <div
                  key={`pad-${idx}`}
                  style={{
                    borderRadius: 16,
                    background: "rgba(255, 255, 255, 0.02)",
                    minHeight: 100,
                    opacity: 0.25,
                  }}
                />
              );
            }

            const dayPosts   = getDayPosts(day);
            const holiday    = getDayHoliday(day);
            const isToday    = isSameDay(day, today);
            const isSelected = selectedDay ? isSameDay(day, selectedDay) : false;
            const border     = getCellBorderColor(dayPosts);
            const isCurrentMonth = day.getMonth() === currentDate.getMonth();

            // v1 day-cell tokens
            // (reference/.../app/dashboard/calendar/page.tsx:666-679).
            // Today gets a blue tint + soft glow so it's unmistakable
            // against the otherwise neutral white-on-glass cells.
            return (
              <button
                key={day.toISOString()}
                type="button"
                onClick={() => setSelectedDay(isSelected ? null : day)}
                style={{
                  position: "relative",
                  borderRadius: 16,
                  background: isSelected
                    ? "rgba(255, 255, 255, 0.12)"
                    : isToday
                    ? "rgba(59, 130, 246, 0.14)"
                    : "rgba(255, 255, 255, 0.03)",
                  border: isSelected
                    ? "1px solid rgba(255, 255, 255, 0.30)"
                    : isToday
                    ? "1px solid rgba(96, 165, 250, 0.70)"
                    : "1px solid rgba(255, 255, 255, 0.10)",
                  borderLeft: border ? `3px solid ${border}` : undefined,
                  boxShadow: isToday
                    ? "0 0 0 1px rgba(96, 165, 250, 0.35), 0 0 24px rgba(59, 130, 246, 0.25)"
                    : undefined,
                  backdropFilter: "blur(24px)",
                  WebkitBackdropFilter: "blur(24px)",
                  minHeight: 100,
                  padding: 12,
                  cursor: "pointer",
                  textAlign: "left",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  opacity: !isCurrentMonth ? 0.40 : 1,
                  transition: "background 0.12s, border-color 0.12s",
                }}
                onMouseEnter={(e) => {
                  if (!isSelected && !isToday) {
                    const el = e.currentTarget as HTMLElement;
                    el.style.background = "rgba(255, 255, 255, 0.08)";
                    el.style.borderColor = "rgba(255, 255, 255, 0.20)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected && !isToday) {
                    const el = e.currentTarget as HTMLElement;
                    el.style.background = "rgba(255, 255, 255, 0.03)";
                    el.style.borderColor = "rgba(255, 255, 255, 0.10)";
                  }
                }}
              >
                {/* Day number */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <span
                    // v1 today treatment: bold white text — the cell's
                    // blue glow does the highlighting, not a swap-coloured
                    // chip on the day number.
                    style={{
                      fontSize: 14,
                      fontWeight: isToday ? 700 : 500,
                      color: isToday
                        ? "#ffffff"
                        : isCurrentMonth
                        ? "rgba(255, 255, 255, 0.80)"
                        : "rgba(255, 255, 255, 0.30)",
                      lineHeight: 1,
                    }}
                  >
                    {day.getDate()}
                  </span>

                  {/* Holiday dot (top-right) */}
                  {holiday && (
                    <span
                      title={holiday.name}
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: HOLIDAY_DOT_COLOR[holiday.type],
                        display: "inline-block",
                        flexShrink: 0,
                      }}
                    />
                  )}
                </div>

                {/* Post status dots */}
                {dayPosts.length > 0 && <StatusDots dayPosts={dayPosts} />}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Week view ─────────────────────────────────────────────────────────────
  function WeekView() {
    const days = buildWeekDays(currentDate);

    return (
      <div
        style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: 4,
          minHeight: 0,
          overflowY: "auto",
        }}
      >
        {days.map((day) => {
          const dayPosts = getDayPosts(day);
          const holiday  = getDayHoliday(day);
          const isToday  = isSameDay(day, today);
          const border   = getCellBorderColor(dayPosts);

          return (
            <div
              key={day.toISOString()}
              // Clicking anywhere in the column opens the day panel for that
              // day (matches Month-view cell click). The post cards below also
              // setSelectedDay(day) — bubbling to here is the same action.
              onClick={() => setSelectedDay(day)}
              style={{
                borderRadius: 12,
                background: isToday ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.04)",
                border: isToday ? "1px solid rgba(255,255,255,0.18)" : "1px solid rgba(255,255,255,0.07)",
                borderLeft: border ? `3px solid ${border}` : undefined,
                padding: "10px 8px",
                display: "flex",
                flexDirection: "column",
                gap: 6,
                overflowY: "auto",
                cursor: "pointer",
              }}
            >
              {/* Column header */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 4,
                }}
              >
                <div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.40)", fontWeight: 600 }}>
                    {DAY_HEADERS[(day.getDay() + 6) % 7]}
                  </div>
                  <div
                    style={{
                      fontSize: 18,
                      fontWeight: isToday ? 700 : 400,
                      color: isToday ? "#ffffff" : "rgba(255,255,255,0.80)",
                    }}
                  >
                    {day.getDate()}
                  </div>
                </div>
                {holiday && (
                  <span
                    title={holiday.name}
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: "50%",
                      background: HOLIDAY_DOT_COLOR[holiday.type],
                      display: "inline-block",
                    }}
                  />
                )}
              </div>

              {/* Post cards */}
              {dayPosts.map((post) => (
                <button
                  key={post._id}
                  type="button"
                  onClick={() => setSelectedDay(day)}
                  style={{
                    width: "100%",
                    borderRadius: 8,
                    background: "rgba(255,255,255,0.07)",
                    border: `1px solid ${STATUS_DOT[post.status] ?? "#6B7280"}44`,
                    padding: "6px 8px",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  {(post.aiImageUrl || post.imageUrls?.[0]) && (
                    <img
                      src={post.aiImageUrl || post.imageUrls[0]}
                      alt=""
                      style={{
                        width: "100%",
                        height: 48,
                        objectFit: "cover",
                        borderRadius: 5,
                        marginBottom: 4,
                        display: "block",
                      }}
                    />
                  )}
                  <p
                    style={{
                      fontSize: 11,
                      color: "rgba(255,255,255,0.80)",
                      margin: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {post.content || "No caption"}
                  </p>
                  <div
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: STATUS_DOT[post.status] ?? "#6B7280",
                      marginTop: 4,
                    }}
                  />
                </button>
              ))}

              {dayPosts.length === 0 && (
                <p style={{ fontSize: 11, color: "rgba(255,255,255,0.20)", margin: "auto 0" }}>
                  —
                </p>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  // ── Day view ──────────────────────────────────────────────────────────────
  function DayView() {
    const dayPosts = getDayPosts(currentDate);
    const holiday  = getDayHoliday(currentDate);
    const iso = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}-${String(currentDate.getDate()).padStart(2, "0")}`;

    return (
      <div style={{ flex: 1, overflowY: "auto" }}>
        {/* Day view has no date grid to click — this button is the create
            entry point. Carries the day through as a locked scheduledDate. */}
        <Link
          href={`/dashboard/posts/create?scheduledDate=${iso}`}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            marginBottom: 12,
            padding: "9px 0",
            borderRadius: 10,
            background: "rgba(255,255,255,0.07)",
            border: "1px solid rgba(255,255,255,0.14)",
            color: "rgba(255,255,255,0.80)",
            fontSize: 13,
            fontWeight: 500,
            textDecoration: "none",
          }}
        >
          <Plus size={14} />
          Create post for this day
        </Link>
        {holiday && (
          <div
            style={{
              padding: "10px 14px",
              marginBottom: 12,
              borderRadius: 10,
              background: "rgba(255,255,255,0.07)",
              border: "1px solid rgba(255,255,255,0.12)",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: HOLIDAY_DOT_COLOR[holiday.type],
                flexShrink: 0,
              }}
            />
            <span style={{ color: "#ffffff", fontSize: 14 }}>🎉 {holiday.name}</span>
          </div>
        )}

        {dayPosts.length === 0 ? (
          <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 14, textAlign: "center", marginTop: 40 }}>
            No posts scheduled for this day.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {dayPosts.map((post) => {
              const thumb = post.aiImageUrl || post.imageUrls?.[0];
              return (
                <div
                  key={post._id}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 12,
                    padding: "12px 14px",
                    borderRadius: 12,
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.10)",
                  }}
                >
                  {thumb && (
                    <img
                      src={thumb}
                      alt=""
                      style={{ width: 56, height: 56, borderRadius: 8, objectFit: "cover", flexShrink: 0 }}
                    />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ color: "#ffffff", fontSize: 14, margin: "0 0 6px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {post.content || "No caption"}
                    </p>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 500,
                          color: STATUS_DOT[post.status],
                          background: `${STATUS_DOT[post.status]}22`,
                          padding: "2px 8px",
                          borderRadius: 4,
                        }}
                      >
                        {post.status}
                      </span>
                      {(post.scheduledFor || post.publishedAt) && (
                        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.40)" }}>
                          {formatTimeShort(post.scheduledFor ?? post.publishedAt, tz)}
                        </span>
                      )}
                    </div>
                  </div>
                  {/* Inline actions */}
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    {post.status === "review" && (
                      <button
                        type="button"
                        onClick={async () => {
                          await fetch(`/api/posts/${post._id}/approve`, { method: "POST" });
                          fetchPosts();
                        }}
                        style={{
                          fontSize: 12,
                          padding: "4px 10px",
                          borderRadius: 6,
                          background: "rgba(245,158,11,0.20)",
                          color: "#F59E0B",
                          border: "none",
                          cursor: "pointer",
                        }}
                      >
                        Approve
                      </button>
                    )}
                    {post.status === "overdue" && (
                      <Link
                        href={`/dashboard/content-hub?post=${post._id}&reschedule=true`}
                        style={{
                          fontSize: 12,
                          padding: "4px 10px",
                          borderRadius: 6,
                          background: "rgba(239,68,68,0.18)",
                          color: "#EF4444",
                          textDecoration: "none",
                        }}
                      >
                        Reschedule
                      </Link>
                    )}
                    <Link
                      href={`/dashboard/content-hub?post=${post._id}`}
                      style={{
                        fontSize: 12,
                        padding: "4px 10px",
                        borderRadius: 6,
                        background: "rgba(255,255,255,0.08)",
                        color: "rgba(255,255,255,0.70)",
                        textDecoration: "none",
                      }}
                    >
                      View
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────
  return (
    <>
      {/* Post dot tooltip */}
      {tooltip && (
        <div
          style={{
            position: "fixed",
            left: tooltip.x,
            top: tooltip.y - 8,
            transform: "translate(-50%, -100%)",
            zIndex: 200,
            background: "rgba(33, 33, 33, 0.14)",
            border: "1px solid rgba(255, 255, 255, 0.10)",
            borderRadius: 10,
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.25)",
            padding: "8px 10px",
            width: 200,
            pointerEvents: "none",
          }}
        >
          {(tooltip.post.aiImageUrl || tooltip.post.imageUrls?.[0]) && (
            <img
              src={tooltip.post.aiImageUrl || tooltip.post.imageUrls[0]}
              alt=""
              style={{ width: "100%", height: 80, objectFit: "cover", borderRadius: 6, marginBottom: 6, display: "block" }}
            />
          )}
          <p style={{ color: "#ffffff", fontSize: 12, margin: "0 0 4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {tooltip.post.content || "No caption"}
          </p>
          {(tooltip.post.scheduledFor || tooltip.post.publishedAt) && (
            <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 11, margin: 0 }}>
              {formatTimeShort(tooltip.post.scheduledFor ?? tooltip.post.publishedAt, tz)}
            </p>
          )}
        </div>
      )}

      <div
        // Calendar glass container — mirrors v1
        // (reference/.../app/dashboard/calendar/page.tsx:553).
        // The whole month grid sits inside a single dark-glass card so
        // the cells and header read against a unified surface instead of
        // floating directly over the wallpaper.
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          padding: "20px 24px 18px",
          gap: 14,
          // Primary glass card tokens — design-tokens.md §1.
          background: "rgba(33, 33, 33, 0.14)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          border: "1px solid rgba(255, 255, 255, 0.10)",
          borderRadius: 16,
          boxShadow: "0 8px 32px rgba(0, 0, 0, 0.25)",
        }}
      >
        {/* ── Calendar header ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0, flexWrap: "wrap" }}>
          {/* Title */}
          <h1 style={{ color: "#ffffff", fontSize: 22, fontWeight: 600, margin: 0, flex: 1, minWidth: 160 }}>
            {getHeaderLabel()}
          </h1>

          {/* Today button */}
          <button
            type="button"
            onClick={goToday}
            style={{
              padding: "6px 16px",
              borderRadius: 20,
              background: "rgba(255,255,255,0.10)",
              border: "1px solid rgba(255,255,255,0.18)",
              color: "rgba(255,255,255,0.80)",
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Today
          </button>

          {/* Prev / Next */}
          <div style={{ display: "flex", gap: 4 }}>
            <button
              type="button"
              onClick={() => navigate(-1)}
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.14)",
                color: "#ffffff",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              aria-label="Previous"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              onClick={() => navigate(1)}
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: "rgba(255,255,255,0.08)",
                border: "1px solid rgba(255,255,255,0.14)",
                color: "#ffffff",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              aria-label="Next"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* View toggle */}
          <div
            style={{
              display: "inline-flex",
              background: "rgba(255,255,255,0.08)",
              border: "1px solid rgba(255,255,255,0.14)",
              borderRadius: 8,
              overflow: "hidden",
            }}
          >
            {VIEW_OPTIONS.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setViewMode(v)}
                style={{
                  padding: "5px 14px",
                  fontSize: 13,
                  fontWeight: 500,
                  background: viewMode === v ? "rgba(255,255,255,0.18)" : "transparent",
                  color: viewMode === v ? "#ffffff" : "rgba(255,255,255,0.55)",
                  border: "none",
                  cursor: "pointer",
                  transition: "background 0.15s",
                }}
              >
                {v}
              </button>
            ))}
          </div>

          {/* Plan this Month — a calendar-level action, shown in all three
              views (Month / Week / Day), not just Month. Styled as a uniform
              glass header button to match Today / nav arrows / view toggle. */}
          <button
              type="button"
              onClick={() => setPlanModalOpen(true)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "5px 14px",
                borderRadius: 8,
                background: "rgba(255, 255, 255, 0.10)",
                border: "1px solid rgba(255, 255, 255, 0.18)",
                color: "rgba(255, 255, 255, 0.80)",
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              <Sparkles size={13} />
              Plan this Month
            </button>

          {/* Holiday country dropdown — same uniform glass treatment.
              When a country is selected we keep the button glass but
              brighten the text/border slightly to signal active state,
              instead of swapping in a blue tint. */}
          <div ref={countryRef} style={{ position: "relative" }}>
            <button
              type="button"
              onClick={() => setCountryDropOpen((v) => !v)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "5px 12px",
                borderRadius: 8,
                background: selectedCountry
                  ? "rgba(255, 255, 255, 0.16)"
                  : "rgba(255, 255, 255, 0.10)",
                border: "1px solid rgba(255, 255, 255, 0.18)",
                color: selectedCountry ? "#FFFFFF" : "rgba(255, 255, 255, 0.80)",
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              🎌 Holidays
              {selectedCountry && (
                <span style={{ fontSize: 11, opacity: 0.75 }}>
                  · {COUNTRY_OPTIONS.find((c) => c.code === selectedCountry)?.label}
                </span>
              )}
              <ChevronDown size={13} />
            </button>

            {countryDropOpen && (
              <div
                style={{
                  position: "absolute",
                  top: "calc(100% + 6px)",
                  right: 0,
                  width: 180,
                  borderRadius: 12,
                  background: "rgba(33, 33, 33, 0.14)",
                  border: "1px solid rgba(255, 255, 255, 0.10)",
                  backdropFilter: "blur(24px)",
                  WebkitBackdropFilter: "blur(24px)",
                  padding: "6px 0",
                  zIndex: 100,
                  boxShadow: "0 8px 32px rgba(0, 0, 0, 0.25)",
                }}
              >
                {COUNTRY_OPTIONS.map((opt) => {
                  const isActive = opt.code === selectedCountry;
                  return (
                    <button
                      key={String(opt.code)}
                      type="button"
                      onClick={() => {
                        setSelectedCountry(opt.code);
                        setCountryDropOpen(false);
                      }}
                      style={{
                        width: "100%",
                        padding: "7px 14px",
                        background: isActive ? "rgba(255,255,255,0.10)" : "transparent",
                        border: "none",
                        color: isActive ? "#ffffff" : "rgba(255,255,255,0.75)",
                        fontSize: 13,
                        textAlign: "left",
                        cursor: "pointer",
                        fontWeight: isActive ? 500 : 400,
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Loading bar */}
        {loading && (
          <div
            style={{
              height: 2,
              borderRadius: 1,
              background: "rgba(255,255,255,0.08)",
              overflow: "hidden",
              flexShrink: 0,
            }}
          >
            <div
              style={{
                height: "100%",
                width: "40%",
                background: "rgba(255,255,255,0.40)",
                borderRadius: 1,
                animation: "pulse 1.2s infinite",
              }}
            />
          </div>
        )}

        {/* Legend */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
          {[
            { color: "#22C55E", label: "Published" },
            { color: "#3B82F6", label: "Scheduled" },
            { color: "#F59E0B", label: "In Review" },
            { color: "#F97316", label: "Overdue"   },
            { color: "#6B7280", label: "Draft"     },
          ].map(({ color, label }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, display: "inline-block" }} />
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)" }}>{label}</span>
            </div>
          ))}
          {selectedCountry && (
            <>
              <span style={{ color: "rgba(255,255,255,0.20)", fontSize: 11 }}>|</span>
              {(["national","religious","cultural"] as const).map((t) => (
                <div key={t} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: HOLIDAY_DOT_COLOR[t], display: "inline-block" }} />
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", textTransform: "capitalize" }}>{t}</span>
                </div>
              ))}
            </>
          )}
        </div>

        {/* ── Calendar body ── */}
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          {viewMode === "Month" && <MonthView />}
          {viewMode === "Week"  && <WeekView  />}
          {viewMode === "Day"   && <DayView   />}
        </div>
      </div>

      {/* ── Day Detail Panel ── */}
      <CalendarDayPanel
        day={selectedDay}
        posts={selectedDayPosts}
        holiday={selectedDayHoliday}
        userTimezone={tz}
        onClose={() => setSelectedDay(null)}
        onRefresh={fetchPosts}
      />

      {/* ── Monthly AI Planning Modal ── */}
      {planModalOpen && activeBrandId && (
        <PlanMonthModal
          monthStart={new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)}
          brandId={activeBrandId}
          country={selectedCountry}
          onClose={() => setPlanModalOpen(false)}
          onGenerateAll={(plan: PlanCard[]) => {
            // Redirect to campaign generator pre-filled with the AI plan.
            // Store the plan in sessionStorage so the campaigns page can pick it up.
            sessionStorage.setItem("qs-monthly-plan", JSON.stringify({
              plan,
              month: currentDate.getMonth() + 1,
              year: currentDate.getFullYear(),
            }));
            setPlanModalOpen(false);
            window.location.href = "/dashboard/campaigns?fromPlan=1";
          }}
        />
      )}
    </>
  );
}
