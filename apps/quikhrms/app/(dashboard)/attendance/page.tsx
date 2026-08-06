"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { Modal } from "@/components/hrms/modal";
import { ExcelExportButton } from "@/components/hrms/excel-export-button";
import {
  Calendar, ChevronLeft, ChevronRight, Play, Pause, List, LayoutGrid,
  CalendarDays, CalendarCheck, Coffee, Scale,
  Clock4, LogIn, LogOut, Eye, X,
} from "lucide-react";
import { clsx } from "clsx";
import { Tooltip } from "@/components/hrms/tooltip";
import { PageBackground } from "@/components/hrms/page-background";
import { Select } from "@/components/hrms/ui/select";
import { REGULARIZATION_REASONS, OTHER_REASON } from "@/lib/constants/attendance-reasons";

type DayStatus = "Present" | "Absent" | "HalfDay" | "Weekend" | "Holiday" | "OnLeave" | "OnDuty" | "CompOff" | "WFH" | "NotMarked" | "Missing";

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
  Missing: "bg-rose-500",
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
  Missing: "bg-rose-50 text-rose-700 ring-rose-200",
};

const STATUS_LABELS: Record<DayStatus, string> = {
  Present: "Present", WFH: "WFH", OnDuty: "On Duty",
  OnLeave: "On Leave", Holiday: "Holiday", Weekend: "Weekend",
  Absent: "Absent", HalfDay: "Half Day", CompOff: "Comp Off", NotMarked: "Not marked",
  Missing: "Missing",
};

const REG_EXPORT_LABEL: Record<DayCell["regularizationStatus"], string> = {
  None: "No Regularization",
  Pending: "Pending",
  Approved: "Approved",
  Rejected: "Rejected",
  Cancelled: "Cancelled",
};

const ATTENDANCE_EXPORT_COLUMNS = [
  { header: "Date", key: "date", width: 16 },
  { header: "Clock-In", key: "clockIn", width: 14 },
  { header: "Clock-Out", key: "clockOut", width: 14 },
  { header: "Working Time In Office", key: "workingTime", width: 22 },
  { header: "Break Time", key: "breakTime", width: 14 },
  { header: "Status", key: "status", width: 14 },
  { header: "Regularization Status", key: "regularization", width: 20 },
];

export default function AttendancePage() {
  return (
    <div className="w-full px-5 py-4">
      {/* Subtle HR-themed page background (scoped to this page only). */}
      <PageBackground src="/images/pre-onboarding-bg.png" />
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

  // Week stat-strip figures, derived from the loaded week.
  const totalWorkHours = (summary?.days ?? []).reduce((s, d) => s + d.effectiveHours, 0);
  const totalBreakHours = (summary?.days ?? []).reduce((s, d) => s + Math.max(0, d.grossHours - d.effectiveHours), 0);
  const daysPresent = summary?.totals?.presentDays ?? (summary?.days ?? []).filter((d) => d.status === "Present").length;
  const weekOffs = summary?.totals?.weekendDays ?? (summary?.days ?? []).filter((d) => d.status === "Weekend").length;
  const regCount = (summary?.days ?? []).filter((d) => d.regularizationStatus !== "None").length;

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

  const exportRows = useMemo(
    () =>
      (summary?.days ?? []).map((day) => {
        const d = new Date(day.date);
        const breakSec = Math.max(0, day.grossHours - day.effectiveHours) * 3600;
        return {
          date: d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
          clockIn: day.checkIn
            ? new Date(day.checkIn).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true })
            : "",
          clockOut: day.checkOut
            ? new Date(day.checkOut).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true })
            : "",
          workingTime: fmtTimer(day.effectiveHours * 3600),
          breakTime: fmtTimer(breakSec),
          status: STATUS_LABELS[day.status],
          regularization: REG_EXPORT_LABEL[day.regularizationStatus],
        };
      }),
    [summary],
  );

  return (
    <div>
      <div className="relative flex items-center justify-between gap-3 mb-4 flex-wrap">
        <div className="flex items-start gap-2.5">
          <span className="w-9 h-9 rounded-lg bg-green-100 text-green-600 grid place-items-center shrink-0"><Calendar size={18} /></span>
          <div>
            <h1 className="text-base font-bold text-gray-900 leading-tight">My Attendance</h1>
            <p className="text-[11px] text-gray-500">Track your daily attendance and work hours</p>
          </div>
        </div>
        <div className="flex items-center gap-2 surface-card px-2 py-1 lg:absolute lg:left-1/2 lg:-translate-x-1/2">
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
          <ExcelExportButton filename="attendance" sheetName="Attendance" columns={ATTENDANCE_EXPORT_COLUMNS} rows={exportRows} label="Excel" />
        </div>
      </div>

      <div className="surface-card p-3 mb-4 flex items-center gap-4 flex-wrap">
        {/* Shift */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="w-9 h-9 rounded-lg bg-indigo-50 text-indigo-500 flex items-center justify-center">
            <Clock4 size={16} />
          </div>
          <div className="leading-tight">
            <div className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Shift</div>
            <div className="text-[13px] font-bold text-gray-900">{today?.shift?.name ?? "General"}</div>
            <div className="text-[11px] text-gray-500 tabular-nums">
              {today?.shift ? `${formatTime(today.shift.start)} - ${formatTime(today.shift.end)}` : "9:00 AM - 6:00 PM"}
            </div>
          </div>
        </div>
        {/* Notes */}
        <div className="flex-1 min-w-[220px] flex items-center gap-2 border border-gray-200 rounded-xl px-3 py-2.5">
          <Eye size={14} className="text-gray-300" />
          <input value={notes} onChange={(e) => setNotes(e.target.value)}
            placeholder="Add notes for check-in..."
            className="flex-1 text-sm bg-transparent focus:outline-none placeholder:text-gray-400" />
        </div>
        {/* Check-in / out box */}
        <button
          onClick={() => {
            if (today?.checkedIn) checkOutMut.mutate({ remarks: notes || undefined });
            else checkInMut.mutate({ source: "Web", remarks: notes || undefined });
          }}
          disabled={checkInMut.isPending || checkOutMut.isPending}
          className={clsx("shrink-0 flex items-center gap-3 rounded-xl border px-4 py-2.5 transition disabled:opacity-60",
            today?.checkedIn ? "border-red-200 bg-red-50/50 hover:bg-red-50" : "border-green-200 bg-green-50/50 hover:bg-green-50")}>
          <span className={clsx("w-9 h-9 rounded-full grid place-items-center text-white shrink-0",
            today?.checkedIn ? "bg-red-500" : "bg-green-600")}>
            {today?.checkedIn ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
          </span>
          <div className="text-left leading-tight">
            <div className="text-[13px] font-bold text-gray-900">{today?.checkedIn ? "Check-out" : "Check-in"}</div>
            <div className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Worked Today</div>
          </div>
          <span className="font-mono text-base font-bold text-gray-900 tabular-nums ml-1">{fmtTimer(liveSeconds)}</span>
        </button>
      </div>

      {/* Stat strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
        <StatCard icon={Clock4}        tile="bg-indigo-50 text-indigo-500"  value={formatHours(totalWorkHours)}  label="Total Work Hours" />
        <StatCard icon={Coffee}        tile="bg-orange-50 text-orange-500"  value={formatHours(totalBreakHours)} label="Total Break Hours" />
        <StatCard icon={CalendarCheck} tile="bg-blue-50 text-blue-500"       value={String(daysPresent)}          label="Days Present" />
        <StatCard icon={Calendar}      tile="bg-green-50 text-green-600"     value={String(weekOffs)}             label="Week-Offs" />
        <StatCard icon={Scale}         tile="bg-purple-50 text-purple-500"   value={String(regCount)}             label="Regularizations" />
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

      {/* Legend */}
      <div className="flex items-center gap-4 flex-wrap text-[11px] text-gray-500 px-1 pb-2">
        <LegendDot color="bg-yellow-400" label="Week-Off" />
        <LegendDot color="bg-green-500" label="Present" />
        <LegendDot color="bg-red-500" label="Absent" />
        <LegendDot color="bg-blue-500" label="Holiday" />
        <span className="inline-flex items-center gap-1.5"><Eye size={13} /> View daily log details</span>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, tile, value, label }: { icon: React.ElementType; tile: string; value: string; label: string }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-3 flex items-center gap-3">
      <span className={clsx("w-11 h-11 rounded-full grid place-items-center shrink-0", tile)}><Icon size={19} /></span>
      <div className="min-w-0">
        <div className="text-lg font-bold text-gray-900 leading-tight tabular-nums">{value}</div>
        <div className="text-[11px] text-gray-500 truncate">{label}</div>
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={clsx("w-2 h-2 rounded-full", color)} /> {label}
    </span>
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
              <th className="px-4 py-3 w-14 border-b border-gray-200">S.No.</th>
              <th className="px-4 py-2.5 border-b border-gray-200">Date</th>
              <th className="px-4 py-2.5 border-b border-gray-200">Day</th>
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
              // Future / today guard for regularization (can't regularize a day
              // that hasn't happened, or today which isn't over yet).
              const dMid = new Date(day.date); dMid.setHours(0, 0, 0, 0);
              const todayMid = new Date(); todayMid.setHours(0, 0, 0, 0);
              const isFuture = dMid > todayMid;
              const isOff = day.status === "Weekend";
              const isLeave = day.status === "OnLeave";
              const isHoliday = day.status === "Holiday";
              // Regularization allowed only for a past working day: not a
              // week-off / holiday / approved-leave / not-marked day, not today
              // (day not over), and not a future date.
              const blockedForReg =
                day.status === "Weekend" || day.status === "Holiday" ||
                day.status === "OnLeave" || day.status === "NotMarked";
              const canRegularize = !blockedForReg && !isToday && !isFuture;
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
                      {d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                    </div>
                  </td>
                  <td className="px-4">
                    <span className={clsx("text-[13px] font-medium", (d.getDay() === 0 || d.getDay() === 6) ? "text-red-500" : "text-gray-700")}>
                      {d.toLocaleDateString("en-IN", { weekday: "short" })}
                    </span>
                    {isToday && <span className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded bg-green-100 text-green-700 text-[10px] font-semibold align-middle">Today</span>}
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
                    {day.regularizationStatus === "None" ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-gray-100 text-gray-500 text-[11px] font-medium">No Regularization</span>
                    ) : (
                      <span className={clsx("text-xs font-medium", REG_STATUS[day.regularizationStatus])}>{REG_LABEL[day.regularizationStatus]}</span>
                    )}
                  </td>
                  <td className="px-4 text-right">
                    {canRegularize && (
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
      if (!finalReason) throw new Error("Reason is required");
      if (!checkInTime && !checkOutTime) throw new Error("Enter a corrected check-in and/or check-out time");
      // "HH:MM" strings on the same day compare correctly lexicographically.
      if (checkInTime && checkOutTime && checkInTime >= checkOutTime) throw new Error("Check-out time must be after check-in time");
      const checkInISO = checkInTime ? new Date(`${isoDate}T${checkInTime}:00`).toISOString() : undefined;
      const checkOutISO = checkOutTime ? new Date(`${isoDate}T${checkOutTime}:00`).toISOString() : undefined;
      // With an existing record → regularize it (PATCH). A fully-absent day has
      // no record → create-and-regularize (POST).
      if (day.recordId) {
        return api.patch(`/api/v1/hrms/attendance/records/${day.recordId}`, {
          date: isoDate,
          regularizationReason: finalReason,
          reason: finalReason,
          checkIn: checkInISO,
          checkOut: checkOutISO,
        });
      }
      return api.post(`/api/v1/hrms/attendance/regularizations`, {
        date: isoDate,
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
