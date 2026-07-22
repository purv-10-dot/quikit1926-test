"use client";

import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import Link from "next/link";
import { clsx } from "clsx";
import { CalendarClock, LogIn, Palmtree, Gift } from "lucide-react";

interface Shift { name: string; start: string; end: string }
interface Punch { in: string; out: string | null }
interface AttToday { shift: Shift | null; checkedIn: boolean; punches: Punch[] }
interface Balance { leaveType: { code: string | null; name: string }; available: number }
interface Holiday { id: string; name: string; date: string }
interface HolidayResp { upcoming: Holiday[] }

/** "09:00" -> "09:00 AM" */
function fmtClock(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (Number.isNaN(h)) return hhmm;
  const ap = h >= 12 ? "PM" : "AM";
  const h12 = ((h + 11) % 12) + 1;
  return `${String(h12).padStart(2, "0")}:${String(m || 0).padStart(2, "0")} ${ap}`;
}
function fmtTs(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}

export function TodaySnapshot() {
  const api = useApiClient();
  const { data: att } = useQuery({
    queryKey: ["attendance-today"],
    queryFn: () => api.get<AttToday>("/api/v1/hrms/attendance/today"),
    staleTime: 60_000,
  });
  const { data: bal } = useQuery({
    queryKey: ["snapshot", "balances"],
    queryFn: () => api.get<Balance[]>("/api/v1/hrms/leaves/balances"),
    staleTime: 5 * 60_000,
  });
  const { data: hol } = useQuery({
    queryKey: ["snapshot", "next-holiday"],
    queryFn: () => api.get<HolidayResp>("/api/v1/hrms/holidays/upcoming?limit=1"),
    staleTime: 30 * 60_000,
  });

  const shift = att?.data?.shift ?? null;
  const firstIn = att?.data?.punches?.[0]?.in ?? null;
  const balances = bal?.data ?? [];
  const nextHol = hol?.data?.upcoming?.[0] ?? null;

  let checkedStatus = "";
  if (firstIn && shift) {
    const inD = new Date(firstIn);
    const [sh, sm] = shift.start.split(":").map(Number);
    const shiftStart = new Date(inD);
    shiftStart.setHours(sh || 0, sm || 0, 0, 0);
    checkedStatus = inD.getTime() <= shiftStart.getTime() + 5 * 60_000 ? "On time" : "Late";
  }

  const daysLeft = nextHol
    ? Math.max(0, Math.ceil((new Date(nextHol.date).getTime() - Date.now()) / 86_400_000))
    : null;

  const leaveSummary = balances
    .filter((b) => b.available > 0)
    .slice(0, 3)
    .map((b) => `${Math.round(b.available)} ${b.leaveType.code || b.leaveType.name}`);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm p-4 h-full">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[13px] font-semibold text-gray-900">Today&apos;s snapshot</h3>
        <Link href="/holidays" className="text-[11px] font-semibold text-green-700 hover:underline">View calendar</Link>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <SnapItem icon={<CalendarClock size={15} className="text-green-600" />} bg="bg-green-50" label="Today's shift"
          value={shift ? `${fmtClock(shift.start)} – ${fmtClock(shift.end)}` : "—"} sub={shift ? `${shift.name} Shift` : ""} />
        <SnapItem icon={<LogIn size={15} className="text-sky-600" />} bg="bg-sky-50" label="Checked in"
          value={firstIn ? fmtTs(firstIn) : "Not yet"} sub={checkedStatus}
          subCls={checkedStatus === "Late" ? "text-amber-600" : "text-emerald-600"} />
        <SnapItem icon={<Palmtree size={15} className="text-emerald-600" />} bg="bg-emerald-50" label="Leave balance"
          value={leaveSummary[0] ?? "—"} sub={leaveSummary.slice(1).join(" · ")} />
        <SnapItem icon={<Gift size={15} className="text-amber-600" />} bg="bg-amber-50" label="Next holiday"
          value={nextHol ? nextHol.name : "—"} sub={daysLeft != null ? `${daysLeft} day${daysLeft === 1 ? "" : "s"} left` : ""} />
      </div>
    </div>
  );
}

function SnapItem({ icon, bg, label, value, sub, subCls }: {
  icon: React.ReactNode; bg: string; label: string; value: string; sub?: string; subCls?: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <div className={clsx("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", bg)}>{icon}</div>
      <div className="min-w-0">
        <p className="text-[11px] text-gray-500">{label}</p>
        <p className="text-[13px] font-semibold text-gray-900 truncate">{value}</p>
        {sub && <p className={clsx("text-[11px] truncate", subCls ?? "text-gray-400")}>{sub}</p>}
      </div>
    </div>
  );
}
