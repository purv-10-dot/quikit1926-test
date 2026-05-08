"use client";

import { unwrap } from "@/lib/utils/api-fetch";
import { useState, useEffect } from "react";
import { X, ChevronLeft, ChevronRight, AlertCircle, ArrowLeft, Zap } from "lucide-react";

const PLATFORM_LIST = [
  { id: "instagram", label: "Instagram", color: "#E1306C" },
  { id: "facebook", label: "Facebook", color: "#1877F2" },
  { id: "linkedin", label: "LinkedIn", color: "#0A66C2" },
  { id: "twitter", label: "X (Twitter)", color: "#1DA1F2" },
  { id: "youtube", label: "YouTube", color: "#FF0000" },
  { id: "google_business", label: "Google Business", color: "#4285F4" },
];

function buildTimeSlots(): string[] {
  const slots: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (const m of [0, 15, 30, 45]) {
      const hh = h % 12 === 0 ? 12 : h % 12;
      const mm = m.toString().padStart(2, "0");
      const ampm = h < 12 ? "AM" : "PM";
      slots.push(`${hh}:${mm} ${ampm}`);
    }
  }
  return slots;
}

const TIME_SLOTS = buildTimeSlots();

function parseSlotToDate(dateStr: string, slot: string): Date {
  const [time, ampm] = slot.split(" ");
  const [hStr, mStr] = time.split(":");
  let hours = parseInt(hStr, 10);
  const minutes = parseInt(mStr, 10);
  if (ampm === "PM" && hours !== 12) hours += 12;
  if (ampm === "AM" && hours === 12) hours = 0;
  const d = new Date(dateStr + "T00:00:00");
  d.setHours(hours, minutes, 0, 0);
  return d;
}

interface ScheduleModalProps {
  brandId: string;
  imageUrl: string;
  caption: string;
  platform?: string;
  // Optional pre-fill for Reschedule / Approve-and-Schedule flows from
  // the Content Hub. When supplied, the calendar opens on this date's
  // month with the day + nearest 15-min slot pre-selected. The default
  // of undefined keeps the create-flow caller behaviour unchanged
  // (modal opens blank).
  initialScheduledFor?: Date | null;
  onClose: () => void;
  // Returns null on success (the parent will navigate away), or an error
  // string on failure so the modal can render it without unmounting.
  onSave: (scheduledFor: Date | null, platform: string) => Promise<string | null>;
  saving: boolean;
  // Admin-only "Post Now" override. When provided, a Zap-icon button
  // appears beside Save/Schedule and invokes this directly. Returns null
  // on success, error string on failure.
  onPublishNow?: () => Promise<string | null>;
  publishingNow?: boolean;
  isAdmin?: boolean;
  // Mode toggle:
  //   "schedule" (default) — admin-style flow with Save & Schedule + optional
  //                          Post Now. Callers create or update a post and
  //                          set its scheduledFor.
  //   "suggest"            — member flow. Hides Save & Schedule and Post Now;
  //                          shows "Suggest & Send for Review" instead. The
  //                          callback receives the chosen date/time so the
  //                          parent can persist it as requestedPublishTime
  //                          and submit the post for review.
  mode?: "schedule" | "suggest";
  onSuggestTime?: (when: Date, platform: string) => Promise<string | null>;
  suggesting?: boolean;
}

// Convert a Date to the modal's internal (YYYY-MM-DD, "h:mm AM/PM")
// representation so callers can pre-fill via initialScheduledFor without
// knowing the modal's slot vocabulary. Minute is rounded to the nearest
// 15-minute slot so it matches one of TIME_SLOTS exactly.
function _splitDate(d: Date): { dateStr: string; slot: string } {
  const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const minutes = d.getMinutes();
  const roundedMin = [0, 15, 30, 45].reduce(
    (a, b) => (Math.abs(b - minutes) < Math.abs(a - minutes) ? b : a)
  );
  let h = d.getHours();
  const ampm = h < 12 ? "AM" : "PM";
  const hh = h % 12 === 0 ? 12 : h % 12;
  const mm = String(roundedMin).padStart(2, "0");
  return { dateStr, slot: `${hh}:${mm} ${ampm}` };
}

export default function ScheduleModal({
  brandId,
  imageUrl,
  caption,
  platform: defaultPlatform,
  initialScheduledFor,
  onClose,
  onSave,
  saving,
  onPublishNow,
  publishingNow = false,
  isAdmin = false,
  mode = "schedule",
  onSuggestTime,
  suggesting = false,
}: ScheduleModalProps) {
  const isSuggestMode = mode === "suggest";
  const today = new Date();
  // Pre-fill from initialScheduledFor if provided; falls back to "today"
  // and an empty selection for the create-flow caller.
  const _initial = initialScheduledFor ? _splitDate(new Date(initialScheduledFor)) : null;
  const _initialDateObj = initialScheduledFor ? new Date(initialScheduledFor) : null;
  const [viewYear, setViewYear] = useState(_initialDateObj ? _initialDateObj.getFullYear() : today.getFullYear());
  const [viewMonth, setViewMonth] = useState(_initialDateObj ? _initialDateObj.getMonth() : today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(_initial?.dateStr ?? null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(_initial?.slot ?? null);
  const [selectedPlatform, setSelectedPlatform] = useState<string>(defaultPlatform ?? "instagram");
  const [connectedPlatforms, setConnectedPlatforms] = useState<string[]>([]);
  const [loadingPlatforms, setLoadingPlatforms] = useState(true);
  const [error, setError] = useState("");

  // Fetch connected platforms
  useEffect(() => {
    fetch(`/api/integrations/accounts?brandId=${brandId}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null)).then(unwrap)
      .then((data) => {
        if (data) {
          const accounts = Array.isArray(data) ? data : data.accounts ?? [];
          const active = accounts
            .filter((a: any) => a.isActive)
            .map((a: any) => a.platform as string);
          setConnectedPlatforms(active);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingPlatforms(false));
  }, [brandId]);

  const noConnected = !loadingPlatforms && connectedPlatforms.length === 0;

  // Calendar helpers
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay();
  // Local-date YYYY-MM-DD. Using toISOString() shifts to UTC, which makes
  // "today" disabled in any timezone west of UTC during the late-evening
  // hours. The grid builds dateStr from local components (viewYear, viewMonth,
  // day), so todayStr must match that.
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const monthName = new Date(viewYear, viewMonth).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  });

  // Earliest acceptable scheduling time — 5 minutes from now. Used to
  // filter out past time slots when "today" is the selected date.
  const minScheduleTime = new Date(Date.now() + 5 * 60 * 1000);
  const slotIsPast = (slot: string): boolean => {
    if (!selectedDate || selectedDate !== todayStr) return false;
    return parseSlotToDate(selectedDate, slot) < minScheduleTime;
  };

  const handlePrevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  };
  const handleNextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  };

  const handleDayClick = (day: number) => {
    const str = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    // String compare on YYYY-MM-DD avoids the local-midnight vs UTC-midnight
    // mismatch that previously rejected "today" for users in non-UTC zones.
    if (str < todayStr) return;
    setSelectedDate(str);
    // If the user already selected a slot that's now in the past (because
    // they switched from a future date back to today), clear it. Compute
    // against the new date directly — selectedDate state isn't updated yet.
    if (
      str === todayStr &&
      selectedSlot &&
      parseSlotToDate(str, selectedSlot) < minScheduleTime
    ) {
      setSelectedSlot(null);
    }
  };

  const handleSaveToLibrary = async () => {
    setError("");
    // Library saves don't require a platform, but the API still wants one to
    // exist on the row. selectedPlatform defaults to "instagram" — that's a
    // reasonable default for an unscheduled draft and the user can edit it
    // later in Content Hub.
    const errMsg = await onSave(null, selectedPlatform);
    if (errMsg) setError(errMsg);
  };

  const handleSchedule = async () => {
    setError("");
    if (!selectedDate || !selectedSlot) {
      setError("Please select a date and time.");
      return;
    }
    // Platform is now optional. If nothing is connected we still let the
    // post save (the cron will mark it failed at publish time, which is
    // recoverable, vs. blocking the user here on a UAT box without OAuth).
    const scheduledFor = parseSlotToDate(selectedDate, selectedSlot);
    const errMsg = await onSave(scheduledFor, selectedPlatform);
    if (errMsg) setError(errMsg);
  };

  const handlePostNow = async () => {
    if (!onPublishNow) return;
    setError("");
    const errMsg = await onPublishNow();
    if (errMsg) setError(errMsg);
  };

  const handleSuggest = async () => {
    if (!onSuggestTime) return;
    setError("");
    if (!selectedDate || !selectedSlot) {
      setError("Please select a date and time.");
      return;
    }
    const when = parseSlotToDate(selectedDate, selectedSlot);
    const errMsg = await onSuggestTime(when, selectedPlatform);
    if (errMsg) setError(errMsg);
  };

  return (
    <>
      <style>{`
        .qs-timeslots::-webkit-scrollbar { width: 4px; }
        .qs-timeslots::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 9999px; }
      `}</style>

      <div
        style={{
          position: "fixed", inset: 0, zIndex: 180,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "rgba(0,0,0,0.60)",
          backdropFilter: "blur(6px)",
          WebkitBackdropFilter: "blur(6px)",
        }}
        onClick={onClose}
      >
        <div
          // Tokens — see apps/web/src/lib/constants/design-tokens.md (primary glass).
          style={{
            width: "min(680px, 96vw)",
            background: "rgba(33, 33, 33, 0.14)",
            border: "1px solid rgba(255, 255, 255, 0.10)",
            borderRadius: 16,
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.25)",
            overflow: "hidden",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div
            style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "18px 22px 0",
              gap: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
              {/* Back — closes the modal and returns the user to Step 3. */}
              <button
                type="button"
                onClick={onClose}
                aria-label="Back to post"
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  background: "none", border: "none",
                  color: "rgba(255,255,255,0.65)", fontSize: 13,
                  cursor: "pointer", padding: 0,
                }}
              >
                <ArrowLeft size={15} />
                <span>Back</span>
              </button>
              <h3 style={{ color: "#ffffff", fontSize: 16, fontWeight: 600, margin: 0 }}>
                {isSuggestMode ? "Suggest Publish Time" : "Select Date & Time"}
              </h3>
            </div>
            <button
              type="button" onClick={onClose} aria-label="Close"
              style={{ background: "none", border: "none", color: "rgba(255,255,255,0.55)", cursor: "pointer" }}
            >
              <X size={18} />
            </button>
          </div>

          <div style={{ padding: "16px 22px 22px" }}>
            {/* Platform selector */}
            <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
              {PLATFORM_LIST.map((p) => {
                const isConnected = connectedPlatforms.includes(p.id) || noConnected;
                const active = selectedPlatform === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedPlatform(p.id)}
                    disabled={!isConnected && !noConnected}
                    style={{
                      padding: "6px 14px",
                      borderRadius: 9999,
                      fontSize: 12,
                      fontWeight: active ? 600 : 400,
                      border: active
                        ? `1.5px solid ${p.color}`
                        : "1px solid rgba(255,255,255,0.15)",
                      background: active
                        ? `${p.color}22`
                        : "rgba(255,255,255,0.06)",
                      color: active ? p.color : "rgba(255,255,255,0.55)",
                      cursor: isConnected || noConnected ? "pointer" : "not-allowed",
                      opacity: !isConnected && !noConnected ? 0.35 : 1,
                      transition: "all 0.12s",
                    }}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>

            {noConnected && (
              <div
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "9px 12px", borderRadius: 10,
                  background: "rgba(245,158,11,0.12)",
                  border: "1px solid rgba(245,158,11,0.25)",
                  marginBottom: 14,
                }}
              >
                <AlertCircle size={14} style={{ color: "#F59E0B", flexShrink: 0 }} />
                <p style={{ color: "rgba(255,255,255,0.70)", fontSize: 12, margin: 0 }}>
                  No platforms connected. You can still save to Library.{" "}
                  <a href="/dashboard/integrations" style={{ color: "#F59E0B", textDecoration: "underline" }}>
                    Connect in Integrations →
                  </a>
                </p>
              </div>
            )}

            {/* Calendar + time slots row */}
            <div style={{ display: "flex", gap: 16 }}>
              {/* Calendar */}
              <div style={{ flex: 1 }}>
                {/* Month nav */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <button type="button" onClick={handlePrevMonth} style={navBtnStyle}>
                    <ChevronLeft size={14} />
                  </button>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#ffffff" }}>
                    {monthName}
                  </span>
                  <button type="button" onClick={handleNextMonth} style={navBtnStyle}>
                    <ChevronRight size={14} />
                  </button>
                </div>

                {/* Day labels */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 4 }}>
                  {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
                    <div
                      key={d}
                      style={{
                        textAlign: "center", fontSize: 10, fontWeight: 500,
                        color: "rgba(255,255,255,0.30)", paddingBottom: 4,
                      }}
                    >
                      {d}
                    </div>
                  ))}
                </div>

                {/* Days grid */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
                  {Array.from({ length: firstDayOfWeek }, (_, i) => (
                    <div key={`empty-${i}`} />
                  ))}
                  {Array.from({ length: daysInMonth }, (_, i) => {
                    const day = i + 1;
                    const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                    const isPast = dateStr < todayStr;
                    const isToday = dateStr === todayStr;
                    const isSelected = dateStr === selectedDate;
                    return (
                      <button
                        key={day}
                        type="button"
                        disabled={isPast}
                        onClick={() => handleDayClick(day)}
                        style={{
                          height: 32,
                          borderRadius: 8,
                          border: "none",
                          background: isSelected
                            ? "#ffffff"
                            : isToday
                            ? "rgba(255,255,255,0.14)"
                            : "transparent",
                          color: isSelected
                            ? "#0a0a0a"
                            : isPast
                            ? "rgba(255,255,255,0.18)"
                            : "#ffffff",
                          fontSize: 12,
                          fontWeight: isSelected || isToday ? 600 : 400,
                          cursor: isPast ? "not-allowed" : "pointer",
                          transition: "background 0.12s",
                        }}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Time slots */}
              <div
                className="qs-timeslots"
                style={{
                  width: 130,
                  maxHeight: 240,
                  overflowY: "auto",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  flexShrink: 0,
                }}
              >
                {TIME_SLOTS.filter((slot) => !slotIsPast(slot)).map((slot) => {
                  const active = selectedSlot === slot;
                  return (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => setSelectedSlot(slot)}
                      style={{
                        height: 30,
                        borderRadius: 8,
                        border: active ? "1.5px solid rgba(255,255,255,0.60)" : "1px solid rgba(255,255,255,0.10)",
                        background: active ? "#ffffff" : "rgba(255,255,255,0.05)",
                        color: active ? "#0a0a0a" : "rgba(255,255,255,0.65)",
                        fontSize: 12,
                        fontWeight: active ? 600 : 400,
                        cursor: "pointer",
                        flexShrink: 0,
                        transition: "all 0.10s",
                      }}
                    >
                      {slot}
                    </button>
                  );
                })}
              </div>
            </div>

            {error && (
              <p style={{ color: "#EF4444", fontSize: 12, marginTop: 12 }}>{error}</p>
            )}

            {/* Action buttons. Suggest mode (member create + member-draft
                "Suggest Time & Send" flow) replaces the admin Save&Schedule
                + Post Now pair with a single primary "Suggest & Send for
                Review" button; Save to Library remains so members can still
                save without sending. */}
            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button
                type="button"
                onClick={handleSaveToLibrary}
                disabled={saving || publishingNow || suggesting}
                style={{
                  flex: 1, height: 42, borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.20)",
                  background: "rgba(255,255,255,0.08)",
                  color: "rgba(255,255,255,0.80)",
                  fontSize: 13, fontWeight: 500,
                  cursor: saving || publishingNow || suggesting ? "not-allowed" : "pointer",
                  opacity: saving || publishingNow || suggesting ? 0.6 : 1,
                }}
              >
                Save to Library
              </button>
              {!isSuggestMode && isAdmin && onPublishNow && (
                <button
                  type="button"
                  onClick={handlePostNow}
                  disabled={saving || publishingNow}
                  title={
                    noConnected
                      ? "No platforms connected — Post Now will fail until you connect an account in Integrations."
                      : "Publish immediately, bypassing the schedule"
                  }
                  style={{
                    flex: 1, height: 42, borderRadius: 10, border: "none",
                    background: "#ffffff",
                    color: "#0a0a0a",
                    fontSize: 13, fontWeight: 600,
                    cursor: saving || publishingNow ? "not-allowed" : "pointer",
                    opacity: saving || publishingNow ? 0.6 : 1,
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  }}
                >
                  <Zap size={14} />
                  {publishingNow ? "Posting…" : "Post Now"}
                </button>
              )}
              {isSuggestMode ? (
                <button
                  type="button"
                  onClick={handleSuggest}
                  disabled={saving || suggesting || !onSuggestTime}
                  style={{
                    flex: 1, height: 42, borderRadius: 10, border: "none",
                    background: "#ffffff",
                    color: "#0a0a0a",
                    fontSize: 13, fontWeight: 600,
                    cursor: saving || suggesting ? "not-allowed" : "pointer",
                    opacity: saving || suggesting ? 0.6 : 1,
                  }}
                >
                  {suggesting ? "Sending…" : "Suggest & Send for Review →"}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSchedule}
                  disabled={saving || publishingNow}
                  style={{
                    flex: 1, height: 42, borderRadius: 10, border: "none",
                    background: "#ffffff",
                    color: "#0a0a0a",
                    fontSize: 13, fontWeight: 600,
                    cursor: saving || publishingNow ? "not-allowed" : "pointer",
                    opacity: saving || publishingNow ? 0.6 : 1,
                  }}
                >
                  {saving ? "Saving…" : "Save & Schedule Post →"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

const navBtnStyle: React.CSSProperties = {
  width: 28, height: 28, borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "rgba(255,255,255,0.06)",
  color: "rgba(255,255,255,0.70)",
  cursor: "pointer",
  display: "flex", alignItems: "center", justifyContent: "center",
};
