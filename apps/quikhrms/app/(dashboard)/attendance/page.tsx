"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { Modal } from "@/components/hrms/modal";
import {
  Calendar, ChevronLeft, ChevronRight, Play, Pause, List, LayoutGrid,
  Filter, MoreHorizontal, CalendarDays, Upload, Download, Printer, FileDown,
  Clock4, LogIn, LogOut, Eye, X,
} from "lucide-react";
import { clsx } from "clsx";
import { Tooltip } from "@/components/hrms/tooltip";
import { Select } from "@/components/hrms/ui/select";
import { REGULARIZATION_REASONS, OTHER_REASON } from "@/lib/constants/attendance-reasons";

type DayStatus = "Present" | "Absent" | "HalfDay" | "Weekend" | "Holiday" | "OnLeave" | "OnDuty" | "CompOff" | "WFH" | "NotMarked";

interface DayCell {
  recordId: string | null;
  date: string; dayOfWeek: number; status: DayStatus;
  checkIn: string | null; checkOut: string | null;
  punches: { in: string; out: string | null }[];
  grossHours: number; effectiveHours: number;
  isLate: boolean; lateByMinutes: number;
  shift: { name: string; start: string; end: string } | null;
  holidayName: string | null; leaveTypeName: string | null; remarks: string | null;
  regularizationStatus: "None" | "Pending" | "Approved" | "Rejected" | "Cancelled";
  regularizationReason: string | null;
}

interface WeekSummary {
  days: DayCell[];
  totals: {
    payableDays: number; presentDays: number; onDutyDays: number; paidLeaveDays: number; holidayDays: number; weekendDays: number; absentDays: number; totalHours: number;
    payableHours: number; presentHours: number; onDutyHours: number; paidLeaveHours: number; holidayHours: number; weekendHours: number;
  };
  shift: { name: string; start: string; end: string } | null;
}

interface TodayStatus {
  record: { id: string; checkIn: string | null; checkOut: string | null; remarks: string | null } | null;
  shift: { name: string; start: string; end: string };
  checkedIn: boolean;
  elapsedSeconds: number;
  punches: { in: string; out: string | null }[];
}

const STATUS_COLORS: Record<DayStatus, string> = {
  Present: "bg-green-500", WFH: "bg-cyan-500", OnDuty: "bg-emerald-500",
  OnLeave: "bg-sky-500", Holiday: "bg-purple-500",
  Weekend: "bg-yellow-400", Absent: "bg-red-500",
  HalfDay: "bg-orange-500", CompOff: "bg-green-500", NotMarked: "bg-gray-300",
};

const STATUS_CHIP: Record<DayStatus, string> = {
  Present: "bg-green-50 text-green-700 ring-green-200",
  WFH: "bg-cyan-50 text-cyan-700 ring-cyan-200",
  OnDuty: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  OnLeave: "bg-sky-50 text-sky-700 ring-sky-200",
  Holiday: "bg-purple-50 text-purple-700 ring-purple-200",
  Weekend: "bg-amber-50 text-amber-700 ring-amber-200",
  Absent: "bg-red-50 text-red-700 ring-red-200",
  HalfDay: "bg-orange-50 text-orange-700 ring-orange-200",
  CompOff: "bg-green-50 text-green-700 ring-green-200",
  NotMarked: "bg-gray-50 text-gray-500 ring-gray-200",
};

const STATUS_LABELS: Record<DayStatus, string> = {
  Present: "Present", WFH: "WFH", OnDuty: "On Duty",
  OnLeave: "On Leave", Holiday: "Holiday", Weekend: "Weekend",
  Absent: "Absent", HalfDay: "Half Day", CompOff: "Comp Off", NotMarked: "Not marked",
};

export default function AttendancePage() {
  return (
    <div className="w-full px-5 py-4">
      <h1 className="text-base font-semibold text-gray-900 mb-5">Attendance</h1>
      <AttendanceSummary />
    </div>
  );
}

function AttendanceSummary() {
  const api = useApiClient();
  const qc = useQueryClient();
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - d.getDay());
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [notes, setNotes] = useState("");
  const [liveSeconds, setLiveSeconds] = useState(0);
  const [view, setView] = useState<"list" | "grid" | "calendar">("list");

  const weekEnd = new Date(cursor);
  weekEnd.setDate(cursor.getDate() + 6);

  const { data: weekData } = useQuery({
    queryKey: ["attendance-week", cursor.toISOString()],
    queryFn: () => api.get<WeekSummary>(`/api/v1/hrms/attendance/week?weekStart=${cursor.toISOString()}`),
  });

  const { data: todayData } = useQuery({
    queryKey: ["attendance-today"],
    queryFn: () => api.get<TodayStatus>("/api/v1/hrms/attendance/today"),
    // Poll only while clocked in. Once checked-out, no need to refetch.
    refetchInterval: (q) => (q.state.data?.data?.checkedIn ? 60_000 : false),
  });

  const today = todayData?.data;
  const summary = weekData?.data;

  useEffect(() => {
    setLiveSeconds(today?.elapsedSeconds ?? 0);
    if (!today?.checkedIn) return;
    const timer = setInterval(() => setLiveSeconds((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [today?.checkedIn, today?.elapsedSeconds]);

  const [liveBreakSec, setLiveBreakSec] = useState(0);
  useEffect(() => {
    const punches = today?.punches ?? [];
    const computeBreak = () => {
      let sec = 0;
      for (let i = 1; i < punches.length; i++) {
        const prev = punches[i - 1];
        const cur = punches[i];
        if (prev.out && cur.in) {
          sec += Math.max(0, Math.floor((new Date(cur.in).getTime() - new Date(prev.out).getTime()) / 1000));
        }
      }
      const last = punches[punches.length - 1];
      if (last && last.out && !today?.checkedIn) {
        sec += Math.max(0, Math.floor((Date.now() - new Date(last.out).getTime()) / 1000));
      }
      return sec;
    };
    setLiveBreakSec(computeBreak());
    const onBreak = punches.length > 0 && !today?.checkedIn && !!punches[punches.length - 1]?.out;
    if (!onBreak) return;
    const t = setInterval(() => setLiveBreakSec(computeBreak()), 1000);
    return () => clearInterval(t);
  }, [today?.punches, today?.checkedIn]);

  const checkInMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post("/api/v1/hrms/attendance/check-in", body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["attendance-today"] }); qc.invalidateQueries({ queryKey: ["attendance-week"] }); },
  });

  const checkOutMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post("/api/v1/hrms/attendance/check-out", body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["attendance-today"] }); qc.invalidateQueries({ queryKey: ["attendance-week"] }); },
  });

  const shiftLabel = today?.shift ? `${today.shift.name} [ ${formatTime(today.shift.start)} - ${formatTime(today.shift.end)} ]` : "General [ 9:00 AM - 6:00 PM ]";

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div />
        <div className="flex items-center gap-2 surface-card px-2 py-1">
          <button onClick={() => shiftWeek(cursor, setCursor, -7)} className="p-1 hover:bg-gray-100 rounded-full"><ChevronLeft size={12} /></button>
          <Calendar size={14} className="text-gray-500" />
          <span className="text-xs font-medium">{fmtDate(cursor)} — {fmtDate(weekEnd)}</span>
          <button onClick={() => shiftWeek(cursor, setCursor, 7)} className="p-1 hover:bg-gray-100 rounded-full"><ChevronRight size={12} /></button>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center surface-card overflow-hidden">
            <Tooltip content="List view">
              <button onClick={() => setView("list")}
                className={clsx("p-2 border-r border-[var(--border)]", view === "list" ? "bg-[#dcfce7]" : "bg-white hover:bg-gray-50")}>
                <List size={12} className={view === "list" ? "text-[#166534]" : "text-gray-500"} />
              </button>
            </Tooltip>
            <Tooltip content="Grid view">
              <button onClick={() => setView("grid")}
                className={clsx("p-2 border-r border-[var(--border)]", view === "grid" ? "bg-[#dcfce7]" : "bg-white hover:bg-gray-50")}>
                <LayoutGrid size={12} className={view === "grid" ? "text-[#166534]" : "text-gray-500"} />
              </button>
            </Tooltip>
            <Tooltip content="Calendar view">
              <button onClick={() => setView("calendar")}
                className={clsx("p-2", view === "calendar" ? "bg-[#dcfce7]" : "bg-white hover:bg-gray-50")}>
                <CalendarDays size={12} className={view === "calendar" ? "text-[#166534]" : "text-gray-500"} />
              </button>
            </Tooltip>
          </div>
          <button className="p-2 surface-card hover:bg-gray-50"><Filter size={12} className="text-gray-600" /></button>
          <MoreMenu days={summary?.days ?? []} weekStart={cursor} weekEnd={weekEnd} />
        </div>
      </div>

      <div className="surface-card p-4 mb-4 flex items-center gap-4 bg-gradient-to-br from-white to-slate-50/50">
        <div className="flex items-center gap-2.5">
          <div className={clsx("w-9 h-9 rounded-full flex items-center justify-center",
            today?.checkedIn ? "bg-green-100 text-green-600" : "bg-slate-100 text-slate-500")}>
            <Clock4 size={16} />
          </div>
          <div className="leading-tight">
            <div className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">Shift</div>
            <div className="text-[13px] font-semibold text-gray-900">{shiftLabel}</div>
          </div>
        </div>
        <input value={notes} onChange={(e) => setNotes(e.target.value)}
          placeholder="Add notes for check-in"
          className="flex-1 border border-[var(--border)] rounded-full px-4 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#166534]/20 focus:border-[#166534]/40" />
        <button
          onClick={() => {
            if (today?.checkedIn) checkOutMut.mutate({ remarks: notes || undefined });
            else checkInMut.mutate({ source: "Web", remarks: notes || undefined });
          }}
          disabled={checkInMut.isPending || checkOutMut.isPending}
          title={`Worked today: ${fmtTimer(liveSeconds)}`}
          className={clsx("px-3 py-1.5 rounded-full text-white font-medium flex items-center gap-3 min-w-[200px] shadow-md hover:shadow-lg transition-all",
            today?.checkedIn ? "bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700" : "bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700")}>
          <span className="flex items-center gap-1.5 text-xs">
            {today?.checkedIn ? <><Pause size={13} fill="currentColor" /> Check-out</> : <><Play size={13} fill="currentColor" /> Check-in</>}
          </span>
          <span className="ml-auto flex flex-col items-end leading-tight">
            <span className="text-[9px] uppercase tracking-wider opacity-80">Worked today</span>
            <span className="font-mono text-xs bg-white/20 px-2 py-0.5 rounded-md tabular-nums">{fmtTimer(liveSeconds)}</span>
          </span>
        </button>
      </div>

      <div className="surface-card p-0 mb-4 overflow-hidden">
        {view === "list" && summary && <AttendanceTable days={summary.days} liveSeconds={liveSeconds} liveBreakSec={liveBreakSec} isCheckedIn={!!today?.checkedIn} hasTodayPunches={(today?.punches?.length ?? 0) > 0} />}
        {view === "grid" && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3 p-4">
            {summary?.days.map((d) => <DayCard key={d.date} day={d} />)}
          </div>
        )}
        {view === "calendar" && summary && (
          <div className="p-4"><WeekCalendar days={summary.days} /></div>
        )}
      </div>

    </div>
  );
}

function AttendanceTable({ days, liveSeconds, liveBreakSec, isCheckedIn, hasTodayPunches }: { days: DayCell[]; liveSeconds: number; liveBreakSec: number; isCheckedIn: boolean; hasTodayPunches: boolean }) {
  const [logDay, setLogDay] = useState<DayCell | null>(null);
  const [regDay, setRegDay] = useState<DayCell | null>(null);
  const todayStr = new Date().toDateString();

  const REG_STATUS: Record<DayCell["regularizationStatus"], string> = {
    None: "text-gray-400",
    Pending: "text-amber-600",
    Approved: "text-green-600",
    Rejected: "text-red-600",
    Cancelled: "text-gray-500",
  };
  const REG_LABEL: Record<DayCell["regularizationStatus"], string> = {
    None: "No Regularization",
    Pending: "Pending",
    Approved: "Approved",
    Rejected: "Rejected",
    Cancelled: "Cancelled",
  };

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-separate border-spacing-0">
          <thead>
            <tr className="bg-gray-50 text-left text-[11px] uppercase tracking-wider text-gray-500 font-semibold">
              <th className="px-4 py-3 w-14 border-b border-gray-200">S. No.</th>
              <th className="px-4 py-2.5 border-b border-gray-200">Date</th>
              <th className="px-4 py-2.5 border-b border-gray-200">Clock-In</th>
              <th className="px-4 py-2.5 border-b border-gray-200">Clock-Out</th>
              <th className="px-4 py-2.5 border-b border-gray-200">Working Time In Office</th>
              <th className="px-4 py-2.5 border-b border-gray-200">Break Time</th>
              <th className="px-4 py-2.5 border-b border-gray-200 text-center">Log Time</th>
              <th className="px-4 py-2.5 border-b border-gray-200">Regularization Status</th>
              <th className="px-4 py-2.5 border-b border-gray-200 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {days.map((day, idx) => {
              const d = new Date(day.date);
              const isToday = d.toDateString() === todayStr;
              const isOff = day.status === "Weekend";
              const isLeave = day.status === "OnLeave";
              const isHoliday = day.status === "Holiday";
              const offLabel = isOff ? "Week-Off" : isHoliday ? (day.holidayName ?? "Holiday") : isLeave ? (day.leaveTypeName ?? "On Leave") : null;
              const isLiveToday = isToday && hasTodayPunches;
              const breakSec = isLiveToday ? liveBreakSec : Math.max(0, (day.grossHours - day.effectiveHours)) * 3600;
              const workSec = isLiveToday ? liveSeconds : day.effectiveHours * 3600;
              return (
                <tr key={day.date} className={clsx(
                  "transition-colors hover:bg-slate-50/60 align-middle [&>td]:py-2.5 [&>td]:border-b [&>td]:border-gray-100",
                  isToday && "bg-green-50/40"
                )}>
                  <td className="px-4 text-gray-500 tabular-nums">{idx + 1}</td>
                  <td className="px-4">
                    <div className="text-[13px] font-medium text-gray-900">
                      {d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}, {isToday ? "Today" : d.toLocaleDateString("en-IN", { weekday: "short" })}
                    </div>
                  </td>
                  <td className="px-4">
                    {offLabel ? (
                      <span className={clsx("inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium ring-1", STATUS_CHIP[day.status])}>{offLabel}</span>
                    ) : day.checkIn ? (
                      <span className="inline-flex items-center gap-1 text-gray-800 font-medium tabular-nums">
                        <LogIn size={11} className="text-green-600" />
                        {new Date(day.checkIn).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true })}
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4">
                    {offLabel ? (
                      <span className={clsx("inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium ring-1", STATUS_CHIP[day.status])}>{offLabel}</span>
                    ) : isLiveToday && isCheckedIn ? (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-green-50 text-green-700 text-[11px] font-medium ring-1 ring-green-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /> Active
                      </span>
                    ) : isLiveToday && !isCheckedIn ? (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 text-[11px] font-medium ring-1 ring-amber-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" /> On break
                      </span>
                    ) : day.checkOut ? (
                      <span className="inline-flex items-center gap-1 text-gray-800 font-medium tabular-nums">
                        <LogOut size={11} className="text-red-600" />
                        {new Date(day.checkOut).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true })}
                      </span>
                    ) : day.checkIn ? (
                      <span className="text-red-600 font-semibold">Missing.!</span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 font-mono tabular-nums text-gray-900">{fmtTimer(workSec)}</td>
                  <td className="px-4 font-mono tabular-nums text-gray-700">{fmtTimer(breakSec)}</td>
                  <td className="px-4 text-center">
                    <button onClick={() => setLogDay(day)} className="inline-flex items-center justify-center w-8 h-8 rounded-full hover:bg-gray-100 text-gray-600">
                      <Eye size={12} />
                    </button>
                  </td>
                  <td className="px-4">
                    <span className={clsx("text-xs font-medium", REG_STATUS[day.regularizationStatus])}>{REG_LABEL[day.regularizationStatus]}</span>
                  </td>
                  <td className="px-4 text-right">
                    {!offLabel && (
                      <button
                        onClick={() => setRegDay(day)}
                        className="inline-flex items-center px-2.5 py-1 rounded-md bg-[#16a34a] hover:bg-[#15803d] text-white text-xs font-normal shadow-sm transition">
                        Regularization
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {logDay && <LogTimeModal day={logDay} onClose={() => setLogDay(null)} />}
      {regDay && <RegularizationModal day={regDay} onClose={() => setRegDay(null)} />}
    </>
  );
}

function RegularizationModal({ day, onClose }: { day: DayCell; onClose: () => void }) {
  const api = useApiClient();
  const qc = useQueryClient();
  const d = new Date(day.date);
  const dateLabel = d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const isoDate = day.date.slice(0, 10);

  const toTimeInput = (iso: string | null) => {
    if (!iso) return "";
    const t = new Date(iso);
    return `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;
  };

  const [checkInTime, setCheckInTime] = useState(toTimeInput(day.checkIn));
  const [checkOutTime, setCheckOutTime] = useState(toTimeInput(day.checkOut));
  const [reasonChoice, setReasonChoice] = useState("");
  const [customReason, setCustomReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isOther = reasonChoice === OTHER_REASON;
  const finalReason = (isOther ? customReason : reasonChoice).trim();
  const isPending = day.regularizationStatus === "Pending";

  const mut = useMutation({
    mutationFn: () => {
      if (!day.recordId) throw new Error("No attendance record exists for this date");
      if (!finalReason) throw new Error("Reason is required");
      if (!checkInTime && !checkOutTime) throw new Error("Enter a corrected check-in and/or check-out time");
      // "HH:MM" strings on the same day compare correctly lexicographically.
      if (checkInTime && checkOutTime && checkInTime >= checkOutTime) throw new Error("Check-out time must be after check-in time");
      const checkInISO = checkInTime ? new Date(`${isoDate}T${checkInTime}:00`).toISOString() : undefined;
      const checkOutISO = checkOutTime ? new Date(`${isoDate}T${checkOutTime}:00`).toISOString() : undefined;
      return api.patch(`/api/v1/hrms/attendance/records/${day.recordId}`, {
        date: isoDate,
        regularizationReason: finalReason,
        reason: finalReason,
        checkIn: checkInISO,
        checkOut: checkOutISO,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attendance-week"] });
      onClose();
    },
    meta: { suppressGlobalError: true },
    onError: (e: Error) => setError(e.message),
  });

  const cancelMut = useMutation({
    mutationFn: () => {
      if (!day.recordId) throw new Error("No attendance record exists for this date");
      return api.patch(`/api/v1/hrms/attendance/records/${day.recordId}`, { action: "cancel" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["attendance-week"] });
      onClose();
    },
    meta: { suppressGlobalError: true },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 bg-gray-50 border-b border-gray-200">
          <h3 className="text-[13px] font-semibold text-gray-900">
            {isPending ? "Regularization for" : "Apply Regularization for"} {dateLabel}
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-gray-200 text-gray-500"><X size={12} /></button>
        </div>

        {isPending ? (
          <div className="px-5 py-5 space-y-4">
            <div className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded-md px-3 py-2.5">
              A regularization request for this date is <span className="font-semibold">pending approval</span>.
            </div>
            {day.regularizationReason && (
              <div>
                <div className="text-[11px] font-semibold text-gray-500 uppercase mb-1">Submitted reason</div>
                <div className="text-xs text-gray-800 border border-gray-200 rounded-md px-3 py-2.5">{day.regularizationReason}</div>
              </div>
            )}
            {error && <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded px-3 py-2">{error}</div>}
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={onClose}
                className="px-3 py-1.5 rounded-md border border-gray-200 text-gray-600 text-xs font-medium hover:bg-gray-50"
              >
                Close
              </button>
              <button
                onClick={() => { setError(null); cancelMut.mutate(); }}
                disabled={cancelMut.isPending}
                className="px-3 py-1.5 rounded-md bg-red-600 hover:bg-red-700 text-white text-xs font-medium shadow-sm disabled:opacity-60"
              >
                {cancelMut.isPending ? "Cancelling…" : "Cancel Request"}
              </button>
            </div>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setError(null);
              if (!finalReason) { setError("Reason required"); return; }
              mut.mutate();
            }}
            className="px-5 py-5 space-y-4"
          >
            <div>
              <label className="block text-xs font-medium text-gray-900 mb-1.5">Clock-In Time <span className="text-red-500">*</span></label>
              <input
                type="time"
                required
                value={checkInTime}
                onChange={(e) => setCheckInTime(e.target.value)}
                className="w-full border border-gray-200 rounded-md px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#16a34a]/30 focus:border-[#16a34a]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-900 mb-1.5">Clock-Out Time <span className="text-red-500">*</span></label>
              <input
                type="time"
                required
                value={checkOutTime}
                onChange={(e) => setCheckOutTime(e.target.value)}
                className="w-full border border-gray-200 rounded-md px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#16a34a]/30 focus:border-[#16a34a]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-900 mb-1.5">Reason <span className="text-red-500">*</span></label>
              <Select
                value={reasonChoice}
                onChange={(v) => setReasonChoice(v)}
                placeholder="Select a reason"
                options={REGULARIZATION_REASONS.map((r) => ({ value: r, label: r }))}
              />
              {isOther && (
                <div className="mt-2">
                  <textarea
                    value={customReason}
                    maxLength={250}
                    onChange={(e) => setCustomReason(e.target.value)}
                    placeholder="Enter your reason"
                    rows={3}
                    className="w-full border border-gray-200 rounded-md px-3 py-1.5 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-[#16a34a]/30 focus:border-[#16a34a]"
                  />
                  <div className="text-right text-[11px] text-gray-400 mt-1 tabular-nums">{customReason.length} / 250</div>
                </div>
              )}
            </div>
            {error && <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded px-3 py-2">{error}</div>}
            <div className="flex justify-center pt-1">
              <button
                type="submit"
                disabled={mut.isPending}
                className="px-3 py-1.5 rounded-md bg-[#22c55e] hover:bg-green-700 text-white text-xs font-medium shadow-sm disabled:opacity-60"
              >
                {mut.isPending ? "Submitting…" : "Submit"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

/** Format an ISO timestamp as a local `hh:mm:ss am/pm` clock time. */
function fmtPunchTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function LogTimeModal({ day, onClose }: { day: DayCell; onClose: () => void }) {
  const d = new Date(day.date);
  const workSec = day.effectiveHours * 3600;
  const breakSec = Math.max(0, day.grossHours - day.effectiveHours) * 3600;
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h3 className="text-[13px] font-semibold text-gray-900">Log Time</h3>
            <p className="text-xs text-gray-500 mt-0.5">{d.toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric", weekday: "long" })}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500"><X size={12} /></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <Row label="Status" value={STATUS_LABELS[day.status]} />
          <Row label="Shift" value={day.shift ? `${day.shift.name} (${formatTime(day.shift.start)} – ${formatTime(day.shift.end)})` : "—"} />
          {day.punches.length > 0 ? (
            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="text-gray-500">Clock-In / Clock-Out</span>
                <span className="text-xs text-gray-400">{day.punches.length} session{day.punches.length === 1 ? "" : "s"}</span>
              </div>
              <div className="space-y-1.5">
                {day.punches.map((p, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-xs bg-gray-50 rounded-md px-3 py-2">
                    <span className="w-5 h-5 shrink-0 rounded-full bg-gray-200 text-[11px] font-semibold text-gray-600 inline-flex items-center justify-center">{idx + 1}</span>
                    <span className="font-semibold tabular-nums text-gray-900">{fmtPunchTime(p.in)}</span>
                    <span className="text-gray-300">→</span>
                    <span className={clsx("font-semibold tabular-nums", p.out ? "text-gray-900" : "text-orange-600")}>
                      {p.out ? fmtPunchTime(p.out) : "Missing"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <>
              <Row label="Clock-In" value={day.checkIn ? fmtPunchTime(day.checkIn) : "—"} />
              <Row label="Clock-Out" value={day.checkOut ? fmtPunchTime(day.checkOut) : day.checkIn ? "Missing" : "—"} />
            </>
          )}
          <Row label="Working time" value={fmtTimer(workSec)} />
          <Row label="Break time" value={fmtTimer(breakSec)} />
          {day.isLate && <Row label="Late by" value={formatLateMins(day.lateByMinutes)} highlight="text-orange-600" />}
          {day.remarks && <Row label="Remarks" value={day.remarks} />}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-gray-500">{label}</span>
      <span className={clsx("font-semibold tabular-nums", highlight ?? "text-gray-900")}>{value}</span>
    </div>
  );
}

function DayCard({ day }: { day: DayCell }) {
  const d = new Date(day.date);
  const isToday = d.toDateString() === new Date().toDateString();

  return (
    <div className={clsx(
      "border rounded-lg p-3 flex flex-col gap-1",
      isToday ? "border-[#86efac] ring-1 ring-[#dcfce7]" : "border-gray-200"
    )}>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-gray-500">{d.toLocaleDateString("en-IN", { weekday: "short" })}</div>
          <div className="text-lg font-semibold text-gray-900">{d.getDate()}</div>
        </div>
        <span className={clsx("w-2.5 h-2.5 rounded-full", STATUS_COLORS[day.status])} />
      </div>
      <div className="text-xs text-gray-600 mt-1">
        {day.status === "OnLeave" && day.leaveTypeName ? day.leaveTypeName :
         day.status === "Holiday" && day.holidayName ? day.holidayName :
         STATUS_LABELS[day.status]}
      </div>
      {day.checkIn && (
        <div className="text-[11px] text-gray-500">
          In: {new Date(day.checkIn).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
          {day.checkOut && <> · Out: {new Date(day.checkOut).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</>}
        </div>
      )}
      <div className="text-xs font-semibold text-gray-900">{formatHours(day.effectiveHours)} Hrs</div>
    </div>
  );
}

function WeekCalendar({ days }: { days: DayCell[] }) {
  const today = new Date();

  return (
    <div>
      <div className="grid grid-cols-7 text-xs text-gray-500 border-b border-gray-200 pb-1 mb-2">
        {days.map((d) => (
          <div key={d.date} className="px-2 text-center">
            {new Date(d.date).toLocaleDateString("en-IN", { weekday: "short" })}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-2">
        {days.map((d) => {
          const dt = new Date(d.date);
          const isToday = dt.toDateString() === today.toDateString();
          return (
            <div key={d.date} className={clsx(
              "min-h-[110px] border rounded-lg p-2 flex flex-col gap-1",
              isToday ? "bg-[#dcfce7] border-[#bbf7d0]" : "border-gray-200 bg-white",
            )}>
              <div className={clsx("text-sm font-semibold", isToday ? "text-[#16a34a]" : "text-gray-900")}>
                {dt.getDate()}
              </div>
              <div className="flex items-center gap-1">
                <span className={clsx("w-2 h-2 rounded-full", STATUS_COLORS[d.status])} />
                <span className="text-[11px] text-gray-600 truncate">
                  {d.status === "OnLeave" && d.leaveTypeName ? d.leaveTypeName :
                   d.status === "Holiday" && d.holidayName ? d.holidayName :
                   STATUS_LABELS[d.status]}
                </span>
              </div>
              {d.checkIn && (
                <div className="text-[10px] text-gray-500 leading-tight">
                  {new Date(d.checkIn).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                  {d.checkOut && <> — {new Date(d.checkOut).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</>}
                </div>
              )}
              <div className="mt-auto text-[11px] font-semibold text-gray-800">
                {formatHours(d.effectiveHours)} Hrs
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MoreMenu({ days, weekStart, weekEnd }: { days: DayCell[]; weekStart: Date; weekEnd: Date }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const rangeLabel = `${fmtDate(weekStart)}_to_${fmtDate(weekEnd)}`;

  const exportCSV = () => {
    if (!days.length) { alert("No data to export"); return; }
    const headers = ["Date", "Day", "Status", "Clock-In", "Clock-Out", "Working Hours", "Break Hours", "Late (mins)", "Shift", "Regularization", "Remarks"];
    const rows = days.map((d) => {
      const dt = new Date(d.date);
      const breakH = Math.max(0, d.grossHours - d.effectiveHours);
      return [
        dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
        dt.toLocaleDateString("en-IN", { weekday: "short" }),
        STATUS_LABELS[d.status],
        d.checkIn ? new Date(d.checkIn).toLocaleTimeString("en-IN", { hour12: false }) : "",
        d.checkOut ? new Date(d.checkOut).toLocaleTimeString("en-IN", { hour12: false }) : "",
        d.effectiveHours.toFixed(2),
        breakH.toFixed(2),
        d.lateByMinutes || 0,
        d.shift?.name ?? "",
        d.regularizationStatus,
        (d.remarks ?? "").replace(/"/g, '""'),
      ];
    });
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c)}"`).join(",")).join("\r\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `attendance_${rangeLabel}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
      alert(`Parsed ${Math.max(0, lines.length - 1)} row(s) from "${f.name}". Backend bulk-import endpoint pending.`);
    };
    reader.readAsText(f);
    e.target.value = "";
  };

  const closeAnd = (fn: () => void) => () => { setOpen(false); fn(); };

  return (
    <div className="relative" ref={ref}>
      <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleImport} />
      <Tooltip content="More actions">
        <button onClick={() => setOpen(!open)}
          className={clsx("p-2 border rounded-lg", open ? "bg-green-600 text-white border-[#166534]" : "border-[var(--border)] bg-white text-gray-600 hover:bg-gray-50")}>
          <MoreHorizontal size={12} />
        </button>
      </Tooltip>
      {open && (
        <div className="absolute right-0 top-full mt-1 surface-card py-1 w-52 z-50">
          <MenuItem icon={<Upload size={14} />} label="Import" onClick={closeAnd(() => fileRef.current?.click())} />
          <MenuItem icon={<Download size={14} />} label="Export" onClick={closeAnd(exportCSV)} />
          <MenuItem icon={<FileDown size={14} />} label="Download as PDF" onClick={closeAnd(() => window.print())} />
          <MenuItem icon={<Printer size={14} />} label="Print" onClick={closeAnd(() => window.print())} />
        </div>
      )}
    </div>
  );
}

function MenuItem({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} className="w-full flex items-center gap-3 px-4 py-2 text-xs text-gray-700 hover:bg-gray-50">
      <span className="text-gray-500">{icon}</span>
      {label}
    </button>
  );
}

function fmtDate(d: Date) {
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }).replace(/ /g, "-");
}

function fmtTimer(s: number) {
  const total = Math.max(0, Math.floor(s));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  return [h, m, sec].map((n) => String(n).padStart(2, "0")).join(":");
}

function formatHours(h: number): string {
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

function formatLateMins(min: number): string {
  const h = Math.floor(min / 60), m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function formatTime(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const ampm = h < 12 ? "AM" : "PM";
  return `${hour12}:${String(m ?? 0).padStart(2, "0")} ${ampm}`;
}

function shiftWeek(cursor: Date, setCursor: (d: Date) => void, days: number) {
  const d = new Date(cursor);
  d.setDate(cursor.getDate() + days);
  setCursor(d);
}
