"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient, ApiError } from "@/lib/hooks/use-api";
import { useDashboardConfig } from "@/lib/hooks/use-dashboard-config";
import { Modal } from "@/components/hrms/modal";
import { clsx } from "clsx";
import { Plus, AlertTriangle, Eye, Trash2, FileText, X } from "lucide-react";
import { EmptyState } from "@/components/hrms/empty-state";
import { Select } from "@/components/hrms/ui/select";
import { FilterBar, FilterDivider, FilterSearch } from "@/components/hrms/ui/filter-bar";
import { NumberInput } from "@/components/hrms/ui/number-input";
import { SkeletonTable } from "@/components/hrms/skeleton";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  AreaChart, Area, PieChart, Pie, Cell,
} from "recharts";

interface LeaveBalance {
  id: string;
  leaveType: { id: string; name: string; code: string; color: string | null };
  opening: string;
  accrued: string;
  taken: string;
  available: number;
}

interface LeaveRequest {
  id: string;
  startDate: string;
  endDate: string;
  duration: string;
  reason: string;
  status: string;
  appliedOn: string;
  cancelReason: string | null;
  leaveType: { id: string; name: string; code: string; color: string | null };
  employee?: { firstName: string; lastName: string };
  approvals: Array<{
    id: string;
    status: string;
    comment: string | null;
    approver: { id: string; firstName: string; lastName: string };
  }>;
}

interface LeaveType {
  id: string;
  name: string;
  code: string;
  color: string | null;
  isHalfDayAllowed: boolean;
  maxBalance?: number;
}

const STATUS_CHIP: Record<string, string> = {
  Pending: "text-amber-600",
  Approved: "text-green-600",
  Rejected: "text-red-600",
  Cancelled: "text-gray-500",
  Expired: "text-gray-400",
  Draft: "text-[#16a34a]",
};

/**
 * A still-Pending request whose leave dates have already passed can never be
 * actioned in time — surface it as "Expired" (display-only; the stored status
 * stays "Pending"). Compares the end date against the start of today.
 */
function isExpiredPending(status: string, endDate: string): boolean {
  if (status !== "Pending") return false;
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return end.getTime() < today.getTime();
}

const PALETTE = ["#bbf7d0", "#bbf7d0", "#fde68a", "#fecaca", "#ddd6fe", "#fbcfe8", "#a5f3fc", "#fed7aa", "#bbf7d0", "#d9f99d", "#fbb6ce", "#bae6fd"];

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function dayDiff(s: string, e: string) {
  const a = new Date(s); a.setHours(0, 0, 0, 0);
  const b = new Date(e); b.setHours(0, 0, 0, 0);
  return Math.max(1, Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1);
}

/**
 * True only after the first client render. Recharts' ResponsiveContainer
 * measures the DOM, so its server markup never matches the client and triggers
 * a hydration mismatch. Gating charts on this renders nothing on the server +
 * first paint, then mounts the chart client-side — keeping the two in sync.
 */
function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

export default function MyLeavesPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const mounted = useMounted();
  // The Leave Policy Documents page requires hrms.leave_policy.read (which the
  // employee role lacks) — hide the link from users who can't actually open it.
  const { hasPermission } = useDashboardConfig();
  const canViewPolicyDocs = hasPermission("hrms.leave_policy.read");
  const [showApply, setShowApply] = useState(false);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const [viewLeave, setViewLeave] = useState<LeaveRequest | null>(null);
  const [year, setYear] = useState(new Date().getFullYear());
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({
    leaveTypeId: "",
    startDate: "",
    endDate: "",
    duration: 1,
    reason: "",
    isPlanned: true,
  });

  // ── Live policy preview (rules card + violations) ───────────────────
  interface DryRunResult {
    leaveType: { id: string; code: string; name: string };
    rules: {
      maxConsecutiveDays?: number | null;
      minConsecutiveDays?: number | null;
      maxPerMonth?: number | null;
      maxPerYear?: number | null;
      advanceNoticeDays?: number | null;
      applicableAfterDays?: number | null;
      probationBlocked?: boolean | null;
      applicableGender?: string | null;
      sandwichRule?: boolean | null;
      requiresDocumentation?: boolean | null;
    } | null;
    violations: { code: string; message: string; severity: "block" | "warn" }[];
    ok: boolean;
  }
  // Stable key — only the values that actually affect the rules/violations.
  // (Empty dates → "rules only" mode; same input within staleTime hits cache.)
  const dryRunKey = [
    "leave-dry-run",
    form.leaveTypeId,
    form.startDate || null,
    form.endDate || null,
    form.startDate && form.endDate ? form.duration : null,
    form.isPlanned,
  ];

  const { data: dryRunResp } = useQuery({
    queryKey: dryRunKey,
    queryFn: () =>
      api.post<DryRunResult>("/api/v1/hrms/leaves/requests/dry-run", {
        leaveTypeId: form.leaveTypeId,
        startDate: form.startDate || undefined,
        endDate: form.endDate || undefined,
        duration: form.startDate && form.endDate ? form.duration : undefined,
        isPlanned: form.isPlanned,
      }),
    enabled: !!form.leaveTypeId,
    // Don't refetch the same (leaveType, dates) tuple within 30s — bidirectional
    // sync re-renders this component a few times when picking a start date.
    staleTime: 30_000,
    // Avoid spurious refetches; the request is cheap but the user isn't editing
    // anything meaningful when they tab away.
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    // Silent failure — submit re-runs the same checks server-side.
    retry: false,
  });
  const dryRun = dryRunResp?.data ?? null;

  /** Format the rule card as plain-English bullet points. */
  function rulesBullets(r: DryRunResult["rules"]): string[] {
    if (!r) return [];
    const out: string[] = [];
    if (r.maxConsecutiveDays != null) out.push(`Max ${r.maxConsecutiveDays} day${r.maxConsecutiveDays === 1 ? "" : "s"} at a time`);
    if (r.minConsecutiveDays != null) out.push(`Must be taken in blocks of ${r.minConsecutiveDays}+ days`);
    if (r.maxPerMonth != null) out.push(`Up to ${r.maxPerMonth} day${r.maxPerMonth === 1 ? "" : "s"} per month`);
    if (r.maxPerYear != null) out.push(`Up to ${r.maxPerYear} day${r.maxPerYear === 1 ? "" : "s"} per year`);
    if (r.advanceNoticeDays != null) out.push(`Apply ${r.advanceNoticeDays} day${r.advanceNoticeDays === 1 ? "" : "s"} in advance`);
    if (r.applicableAfterDays != null) out.push(`Available ${r.applicableAfterDays} days after joining`);
    if (r.probationBlocked) out.push("Not available during probation");
    if (r.applicableGender) out.push(`Available for ${r.applicableGender} employees only`);
    if (r.sandwichRule) out.push("Weekends/holidays between leave days count as leave");
    if (r.requiresDocumentation) out.push("Supporting document may be required");
    return out;
  }

  const liveBlockingViolations = useMemo(
    () => (dryRun?.violations ?? []).filter((v) => v.severity === "block"),
    [dryRun],
  );

  const { data: balancesData } = useQuery({
    queryKey: ["my-leave-balances", year],
    queryFn: () => api.get<LeaveBalance[]>(`/api/v1/hrms/leaves/balances?employeeId=me&year=${year}`),
  });

  const { data: requestsData, isLoading } = useQuery({
    queryKey: ["my-leave-requests"],
    queryFn: () => api.get<LeaveRequest[]>("/api/v1/hrms/leaves/requests?employeeId=me&limit=200"),
  });

  const { data: typesData, isLoading: typesLoading, isError: typesError } = useQuery({
    queryKey: ["leave-types"],
    queryFn: () => api.get<LeaveType[]>("/api/v1/hrms/leaves/types?limit=50"),
  });

  // ── Apply Leave form helpers ─────────────────────────────────────
  const [applyError, setApplyError] = useState<string | null>(null);
  // True when the apply was blocked because no Leave approval chain is set up —
  // surfaces a "Notify admin" action in the modal.
  const [chainMissing, setChainMissing] = useState(false);

  /** "YYYY-MM-DD" for today in the user's local timezone — used as min on date inputs. */
  const todayISO = useMemo(() => {
    const d = new Date();
    const tz = d.getTimezoneOffset() * 60_000;
    return new Date(d.getTime() - tz).toISOString().slice(0, 10);
  }, []);

  /** Inclusive whole-day count between two YYYY-MM-DD strings (start..end = 1+). */
  function daysBetween(startISO: string, endISO: string): number {
    const s = new Date(startISO + "T00:00:00");
    const e = new Date(endISO + "T00:00:00");
    return Math.max(1, Math.round((e.getTime() - s.getTime()) / 86_400_000) + 1);
  }

  /** Add N "leave-days" to a start date and return the resulting end YYYY-MM-DD.
   *  Half days share the same calendar day, so the additional calendar offset
   *  is ceil(duration) - 1 (0.5 → 0, 1 → 0, 1.5 → 1, 2 → 1, 2.5 → 2). */
  function endFromDuration(startISO: string, duration: number): string {
    const offset = Math.max(0, Math.ceil(duration) - 1);
    const d = new Date(startISO + "T00:00:00");
    d.setDate(d.getDate() + offset);
    const tz = d.getTimezoneOffset() * 60_000;
    return new Date(d.getTime() - tz).toISOString().slice(0, 10);
  }

  /** Update start: bump end forward if it now sits before start, then recompute duration. */
  function onStartDateChange(startDate: string) {
    setApplyError(null);
    setForm((f) => {
      const endDate = f.endDate && f.endDate >= startDate ? f.endDate : startDate;
      const duration = startDate && endDate ? daysBetween(startDate, endDate) : f.duration;
      return { ...f, startDate, endDate, duration };
    });
  }

  /** Update end: reject if before start; recompute duration. */
  function onEndDateChange(endDate: string) {
    setApplyError(null);
    setForm((f) => {
      if (f.startDate && endDate && endDate < f.startDate) {
        setApplyError("End date can't be before start date.");
        return f;
      }
      const duration = f.startDate && endDate ? daysBetween(f.startDate, endDate) : f.duration;
      return { ...f, endDate, duration };
    });
  }

  /** Update duration: needs a start date; recomputes end. */
  function onDurationChange(value: number | null) {
    setApplyError(null);
    const duration = value ?? 0;
    setForm((f) => {
      if (!f.startDate) {
        setApplyError("Pick a start date first, then set the duration.");
        return { ...f, duration };
      }
      return { ...f, duration, endDate: endFromDuration(f.startDate, duration) };
    });
  }

  function validateForApply(): string | null {
    if (!form.leaveTypeId) return "Leave type is required.";
    if (!form.startDate) return "Start date is required.";
    if (form.startDate < todayISO) return "You can't apply for a date in the past.";
    if (!form.endDate) return "End date is required.";
    if (form.endDate < form.startDate) return "End date can't be before start date.";
    if (!form.duration || form.duration <= 0) return "Duration must be at least 0.5 day.";
    if (!form.reason.trim()) return "Reason is required.";
    if (form.reason.trim().length < 3) return "Reason must be at least 3 characters.";
    return null;
  }

  const invalidateLeaves = () => {
    qc.invalidateQueries({ queryKey: ["my-leave-balances", year] });
    qc.invalidateQueries({ queryKey: ["my-leave-requests"] });
  };

  const applyMut = useMutation({
    mutationFn: (body: typeof form) => api.post("/api/v1/hrms/leaves/requests", body),
    onSuccess: () => { invalidateLeaves(); setShowApply(false); setApplyError(null); setChainMissing(false); },
    onError: (e) => {
      const notConfigured = e instanceof ApiError && e.code === "APPROVAL_CHAIN_NOT_CONFIGURED";
      setChainMissing(notConfigured);
      setApplyError(e instanceof Error ? e.message : "Could not submit the leave request.");
    },
  });

  // "Notify admin" from the missing-chain error — pings admins to configure it.
  const notifyChainMut = useMutation({
    mutationFn: () => api.post<{ notified: number; emailed: number }>("/api/v1/hrms/leaves/notify-approval-chain", {}),
    onSuccess: (res) => {
      setChainMissing(false);
      const n = res.data?.notified ?? 0;
      const emailed = res.data?.emailed ?? 0;
      setApplyError(
        n > 0
          ? `✓ Notified ${n} admin${n === 1 ? "" : "s"}${emailed > 0 ? " (in-app + email)" : ""} to set up the leave approval chain.`
          : "No admins found to notify — contact HR directly.",
      );
    },
  });

  const cancelMut = useMutation({
    mutationFn: (id: string) => api.patch(`/api/v1/hrms/leaves/requests/${id}`, { status: "Cancelled", cancelReason: "Cancelled by employee" }),
    onSuccess: () => { invalidateLeaves(); setConfirmCancelId(null); },
  });

  const requests = requestsData?.data ?? [];
  const leaveTypes = typesData?.data ?? [];

  const balances = useMemo<LeaveBalance[]>(() => {
    const balRows = balancesData?.data ?? [];
    const byType = new Map(balRows.map((b) => [b.leaveType.id, b]));
    return leaveTypes.map((t) => {
      const existing = byType.get(t.id);
      if (existing) return existing;
      const opening = t.maxBalance ?? 0;
      return {
        id: `placeholder-${t.id}`,
        leaveType: { id: t.id, name: t.name, code: t.code, color: t.color },
        opening: String(opening),
        accrued: "0",
        taken: "0",
        available: opening,
      } satisfies LeaveBalance;
    });
  }, [balancesData, leaveTypes]);

  const yearRequests = useMemo(
    () => requests.filter((r) => new Date(r.startDate).getFullYear() === year && (r.status === "Approved" || r.status === "Pending")),
    [requests, year],
  );

  const weekly = useMemo(() => {
    const counts = [0, 0, 0, 0, 0, 0, 0];
    yearRequests.forEach((r) => {
      // Spread each leave across every day it covers, not just its start day —
      // a Mon–Thu leave should add to Mon, Tue, Wed AND Thu. Walk the date range
      // and consume the duration day-by-day (so a trailing half-day lands as 0.5
      // on the final day). Falls back to the start day if dates are invalid.
      const start = new Date(r.startDate);
      const end = r.endDate ? new Date(r.endDate) : start;
      if (isNaN(start.getTime())) return;
      let remaining = Number(r.duration) || 0;
      const cursor = new Date(start);
      if (isNaN(end.getTime()) || end < start || remaining <= 0) {
        counts[start.getDay()] += remaining || Number(r.duration);
        return;
      }
      while (cursor <= end && remaining > 0) {
        const w = Math.min(1, remaining);
        counts[cursor.getDay()] += w;
        remaining -= w;
        cursor.setDate(cursor.getDate() + 1);
      }
    });
    const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return labels.map((l, i) => ({ day: l, value: counts[i] }));
  }, [yearRequests]);

  const monthly = useMemo(() => {
    const counts = Array(12).fill(0);
    yearRequests.forEach((r) => {
      const m = new Date(r.startDate).getMonth();
      counts[m] += Number(r.duration);
    });
    const labels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return labels.map((l, i) => ({ month: l, value: counts[i] }));
  }, [yearRequests]);

  const filteredRequests = useMemo(() => {
    return requests.filter((r) => {
      if (statusFilter !== "all") {
        const list = statusFilter.split(",");
        if (!list.includes(r.status)) return false;
      }
      if (typeFilter !== "all" && r.leaveType.id !== typeFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (!r.reason?.toLowerCase().includes(q) && !r.leaveType.name.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [requests, statusFilter, typeFilter, search]);

  const yearOptions = useMemo(() => {
    const cur = new Date().getFullYear();
    return [cur - 1, cur, cur + 1].map((y) => ({ value: String(y), label: `Jan ${y}–Dec ${y}` }));
  }, []);

  return (
    <div className="w-full">
      {/* Header */}
      <div className="surface-card p-4 mb-4 flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-base font-semibold text-gray-900">Leave</h1>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="min-w-[180px]">
            <Select value={String(year)} onChange={(v) => setYear(Number(v))} options={yearOptions} />
          </div>
          <button onClick={() => { setForm({ leaveTypeId: "", startDate: "", endDate: "", duration: 1, reason: "", isPlanned: true }); setShowApply(true); }}
            className="btn btn-primary"><Plus size={13} /> Apply Leave</button>
          {canViewPolicyDocs && (
            <a href="/leaves/policy-documents" className="text-sm text-[#16a34a] hover:underline inline-flex items-center gap-1">
              <FileText size={14} /> Leave Policy Document
            </a>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="mb-4">
        <h2 className="text-[13px] font-semibold text-gray-900 mb-2 px-1">Leave Stats</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="surface-card p-4">
            <p className="text-xs text-gray-500 mb-2">Weekly Leave Pattern</p>
            <div className="h-56">
              {mounted && (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weekly} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: "#f1f5f9" }} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Bar dataKey="value" fill="#22c55e" radius={[6, 6, 0, 0]} maxBarSize={50} />
                </BarChart>
              </ResponsiveContainer>
              )}
            </div>
          </div>
          <div className="surface-card p-4">
            <p className="text-xs text-gray-500 mb-2">Monthly Leave Pattern</p>
            <div className="h-56">
              {mounted && (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthly} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="leaveArea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#fb923c" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="#fb923c" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  <Area type="monotone" dataKey="value" stroke="#16a34a" strokeWidth={2} fill="url(#leaveArea)" />
                </AreaChart>
              </ResponsiveContainer>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Balance */}
      <div className="mb-4">
        <h2 className="text-[13px] font-semibold text-gray-900 mb-2 px-1">Leave Balance</h2>
        {balances.length === 0 ? (
          <EmptyState
            variant="calendar"
            title={`No leave balances for ${year}`}
            description="Leave types + balances appear here once HR configures policies."
            action={<a href="/leaves/policies" className="text-sm text-[#22c55e] hover:underline">Configure Leave Policies →</a>}
          />
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {balances.map((b, i) => {
              const opening = Number(b.opening) + Number(b.accrued);
              const consumed = Number(b.taken);
              const available = b.available;
              const color = b.leaveType.color ?? PALETTE[i % PALETTE.length];
              return <BalanceCard key={b.id} name={b.leaveType.name} color={color} consumed={consumed} available={available} quota={opening} />;
            })}
          </div>
        )}
      </div>

      {/* History */}
      <div className="surface-card p-0 overflow-hidden">
        <div className="p-4 border-b border-gray-100 space-y-3">
          <h2 className="text-[13px] font-semibold text-gray-900">Leave History</h2>
          <FilterBar>
            <Select
              value={statusFilter}
              onChange={(v) => setStatusFilter(v)}
              options={[
                { value: "all", label: "All status" },
                { value: "Pending,Approved", label: "Pending, Approved" },
                { value: "Pending", label: "Pending" },
                { value: "Approved", label: "Approved" },
                { value: "Rejected", label: "Rejected" },
                { value: "Cancelled", label: "Cancelled" },
              ]}
            />
            <Select
              value={typeFilter}
              onChange={(v) => setTypeFilter(v)}
              options={[{ value: "all", label: "All Leave Types" }, ...leaveTypes.map((t) => ({ value: t.id, label: t.name }))]}
            />
            <FilterDivider />
            <FilterSearch value={search} onChange={setSearch} placeholder="Search reason..." />
            <button
              onClick={() => { setStatusFilter("all"); setTypeFilter("all"); setSearch(""); }}
              className="text-xs font-medium text-gray-500 hover:text-gray-900 px-3 py-1.5 border border-gray-200 rounded-md"
            >Reset</button>
          </FilterBar>
        </div>

        {isLoading ? (
          <div className="p-4"><SkeletonTable rows={5} cols={6} /></div>
        ) : filteredRequests.length === 0 ? (
          <div className="p-4"><EmptyState variant="bot" title="No leave records" description="Try changing filters or apply a leave." className="border-0 shadow-none" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-separate border-spacing-0">
              <thead>
                <tr className="bg-gray-50 text-left text-[11px] uppercase tracking-[0.04em] text-gray-500 font-semibold">
                  <th className="px-4 py-2.5 border-b border-gray-200 w-12">S. No.</th>
                  <th className="px-4 py-2.5 border-b border-gray-200">Leave Dates</th>
                  <th className="px-4 py-2.5 border-b border-gray-200">Leave Type</th>
                  <th className="px-4 py-2.5 border-b border-gray-200">Status</th>
                  <th className="px-4 py-2.5 border-b border-gray-200">Reason</th>
                  <th className="px-4 py-2.5 border-b border-gray-200">Requested On</th>
                  <th className="px-4 py-2.5 border-b border-gray-200">Action By</th>
                  <th className="px-4 py-2.5 border-b border-gray-200">Reject Reason</th>
                  <th className="px-4 py-2.5 border-b border-gray-200">Pending Approver</th>
                  <th className="px-4 py-2.5 border-b border-gray-200 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredRequests.map((r, idx) => {
                  const days = dayDiff(r.startDate, r.endDate);
                  const dur = Number(r.duration);
                  const dayLabel = `${dur === 0.5 ? "0.5" : days} day${days === 1 && dur >= 1 ? "" : "s"} leave`;
                  const lastAction = r.approvals?.find((a) => a.status === "Approved" || a.status === "Rejected");
                  const pendingApprover = r.approvals?.find((a) => a.status === "Pending");
                  const actionByName = lastAction ? `${lastAction.approver.firstName} ${lastAction.approver.lastName}` : null;
                  const pendingName = pendingApprover ? `${pendingApprover.approver.firstName} ${pendingApprover.approver.lastName}` : null;
                  const rejectReason = r.approvals?.find((a) => a.status === "Rejected")?.comment;
                  const expired = isExpiredPending(r.status, r.endDate);
                  const displayStatus = expired ? "Expired" : r.status;
                  return (
                    <tr key={r.id} className="row-stagger hover:bg-slate-50/60 align-middle [&>td]:border-b [&>td]:border-gray-100" style={{ ["--i" as never]: Math.min(idx, 10) }}>
                      <td className="px-4 py-2.5 text-gray-500 tabular-nums">{idx + 1}</td>
                      <td className="px-4 py-2.5">
                        <div className="text-[13px] text-gray-800 font-medium">{formatDate(r.startDate)} - {formatDate(r.endDate)}</div>
                        <div className="text-[11px] text-[#16a34a]">({dayLabel})</div>
                      </td>
                      <td className="px-4 py-2.5 text-gray-700">{r.leaveType.name}</td>
                      <td className="px-4 py-2.5">
                        <span className={clsx("text-[11px] font-medium", STATUS_CHIP[displayStatus] ?? "text-gray-700")} title={expired ? "Leave dates have passed without approval" : undefined}>{displayStatus}</span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-600 max-w-[180px] truncate" title={r.reason}>{r.reason || "—"}</td>
                      <td className="px-4 py-2.5 text-gray-700 tabular-nums">{formatDate(r.appliedOn)}</td>
                      <td className="px-4 py-2.5 text-gray-700">{actionByName ?? "NA"}</td>
                      <td className="px-4 py-2.5 text-gray-600 max-w-[180px] truncate">{rejectReason ?? "NA"}</td>
                      <td className="px-4 py-2.5 text-gray-700">{pendingName ?? "NA"}</td>
                      <td className="px-4 py-2.5 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button onClick={() => setViewLeave(r)} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500" title="View">
                            <Eye size={12} />
                          </button>
                          {r.status === "Pending" && !expired && (
                            <button onClick={() => setConfirmCancelId(r.id)} className="p-1.5 rounded-md bg-red-50 hover:bg-red-100 text-red-600" title="Cancel">
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Apply Leave Modal */}
      <Modal open={showApply} onClose={() => { setShowApply(false); setApplyError(null); setChainMissing(false); }} title="Apply Leave">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setChainMissing(false);
            const err = validateForApply();
            if (err) { setApplyError(err); return; }
            applyMut.mutate(form);
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Leave Type <span className="text-red-500">*</span>
            </label>
            <Select value={form.leaveTypeId} onChange={(v) => setForm({ ...form, leaveTypeId: v })} required
              placeholder={typesLoading ? "Loading leave types…" : "Select type"} searchable
              options={leaveTypes.map((t) => ({ value: t.id, label: `${t.name} (${t.code})` }))} />
            {/* Explain an empty dropdown instead of showing a silent blank —
                distinguishes a load failure from an org with no types configured. */}
            {!typesLoading && typesError && (
              <p className="mt-1 text-xs text-red-600">Couldn&apos;t load leave types. Refresh the page and try again.</p>
            )}
            {!typesLoading && !typesError && leaveTypes.length === 0 && (
              <p className="mt-1 text-xs text-amber-600">No leave types are configured yet. Ask your HR/admin to set up leave policies before applying.</p>
            )}
          </div>

          {/* Live policy rules — populated by the dry-run as soon as a type is picked. */}
          {form.leaveTypeId && dryRun && (
            (() => {
              const bullets = rulesBullets(dryRun.rules);
              return (
                <div className="rounded-lg border border-green-100 bg-green-50/60 px-3 py-2.5">
                  <div className="text-xs font-semibold uppercase tracking-wide text-green-700">
                    Policy rules · {dryRun.leaveType.name}
                  </div>
                  {bullets.length === 0 ? (
                    <p className="mt-1 text-xs text-gray-500">No specific limits — only your balance applies.</p>
                  ) : (
                    <ul className="mt-1.5 space-y-0.5 text-xs text-gray-700">
                      {bullets.map((b) => (
                        <li key={b} className="flex items-start gap-1.5">
                          <span className="mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full bg-green-500" />
                          <span>{b}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })()
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Start Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={form.startDate}
                min={todayISO}                       /* blocks past dates */
                onChange={(e) => onStartDateChange(e.target.value)}
                required
                className="w-full border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#166534]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                End Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={form.endDate}
                min={form.startDate || todayISO}      /* end ≥ start */
                disabled={!form.startDate}
                onChange={(e) => onEndDateChange(e.target.value)}
                required
                className="w-full border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#166534] disabled:bg-gray-50 disabled:text-gray-400"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Duration (days) <span className="text-red-500">*</span>
              <span className="ml-1 text-xs font-normal text-gray-400">— auto-calculated; editing it shifts the end date</span>
            </label>
            <NumberInput
              min={0.5}
              step={0.5}
              value={form.duration}
              onChange={onDurationChange}
              disabled={!form.startDate}
              required
              className="w-full border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#166534] disabled:bg-gray-50 disabled:text-gray-400"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Reason <span className="text-red-500">*</span>
            </label>
            <textarea
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              required
              minLength={3}
              rows={3}
              placeholder="Brief reason for leave (min 3 characters)"
              className="w-full border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#166534]"
            />
          </div>
          {/* Live policy violations as the user edits the form. */}
          {liveBlockingViolations.length > 0 && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
              <div className="text-xs font-semibold uppercase tracking-wide text-red-700">
                Won&apos;t pass policy
              </div>
              <ul className="mt-1.5 space-y-0.5 text-xs text-red-700">
                {liveBlockingViolations.map((v, i) => (
                  <li key={i} className="flex items-start gap-1.5">
                    <span className="mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full bg-red-500" />
                    <span>{v.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {applyError && (
            <div className={clsx("rounded-lg px-3 py-2 text-xs", chainMissing ? "bg-amber-50 text-amber-800" : "bg-red-50 text-red-600")}>
              <p>{applyError}</p>
              {chainMissing && (
                <button
                  type="button"
                  onClick={() => notifyChainMut.mutate()}
                  disabled={notifyChainMut.isPending}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  {notifyChainMut.isPending ? "Notifying…" : "Notify admin to set it up"}
                </button>
              )}
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => { setShowApply(false); setApplyError(null); setChainMissing(false); }} className="px-3 py-1.5 border border-[var(--border)] rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
            <button
              type="submit"
              disabled={applyMut.isPending || !!validateForApply() || liveBlockingViolations.length > 0}
              className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 disabled:opacity-50"
            >
              Submit
            </button>
          </div>
        </form>
      </Modal>

      {/* View Leave Modal */}
      {viewLeave && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setViewLeave(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3.5 bg-gray-50 border-b border-gray-200">
              <h3 className="text-[13px] font-semibold text-gray-900">Leave Details</h3>
              <button onClick={() => setViewLeave(null)} className="p-1.5 rounded-md hover:bg-gray-200 text-gray-500"><X size={16} /></button>
            </div>
            <div className="px-5 py-4 space-y-2 text-xs">
              <Row label="Leave Type" value={viewLeave.leaveType.name} />
              <Row label="Period" value={`${formatDate(viewLeave.startDate)} – ${formatDate(viewLeave.endDate)}`} />
              <Row label="Duration" value={`${Number(viewLeave.duration)} day(s)`} />
              {(() => {
                const s = isExpiredPending(viewLeave.status, viewLeave.endDate) ? "Expired" : viewLeave.status;
                return <Row label="Status" value={s} highlight={STATUS_CHIP[s]} />;
              })()}
              <Row label="Requested On" value={formatDate(viewLeave.appliedOn)} />
              <Row label="Reason" value={viewLeave.reason || "—"} />
              {viewLeave.cancelReason && <Row label="Cancel Reason" value={viewLeave.cancelReason} />}
              {viewLeave.approvals?.length > 0 && (
                <div className="pt-2 border-t border-gray-100">
                  <div className="text-xs uppercase tracking-wider font-semibold text-gray-400 mb-2">Approvals</div>
                  <div className="space-y-1.5">
                    {viewLeave.approvals.map((a) => (
                      <div key={a.id} className="flex justify-between text-xs">
                        <span className="text-gray-700">{a.approver.firstName} {a.approver.lastName}</span>
                        <span className={clsx("font-semibold", STATUS_CHIP[a.status])}>{a.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Cancel Confirmation Modal */}
      {confirmCancelId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !cancelMut.isPending && setConfirmCancelId(null)} />
          <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
            <div className="p-4">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 flex items-center justify-center w-12 h-12 rounded-full bg-red-100">
                  <AlertTriangle className="w-6 h-6 text-red-600" />
                </div>
                <div className="flex-1">
                  <h3 className="text-[13px] font-semibold text-gray-900">Cancel Leave Request?</h3>
                  <p className="mt-1 text-xs text-gray-500">This withdraws your leave request. Cannot be undone.</p>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 bg-gray-50 border-t border-gray-100">
              <button type="button" onClick={() => setConfirmCancelId(null)} disabled={cancelMut.isPending}
                className="px-3 py-1.5 bg-white border border-[var(--border)] rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">Keep It</button>
              <button type="button" onClick={() => cancelMut.mutate(confirmCancelId)} disabled={cancelMut.isPending}
                className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-medium hover:bg-red-700 disabled:opacity-50">
                {cancelMut.isPending ? "Cancelling..." : "Yes, Cancel"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-gray-500">{label}</span>
      <span className={clsx("font-semibold text-right max-w-[60%] break-words", highlight ?? "text-gray-900")}>{value}</span>
    </div>
  );
}

function BalanceCard({ name, color, consumed, available, quota }: { name: string; color: string; consumed: number; available: number; quota: number }) {
  const data = consumed > 0
    ? [{ k: "Consumed", v: consumed }, { k: "Available", v: Math.max(available, 0) }]
    : [{ k: "Available", v: Math.max(available, 1) }];
  const ringEmpty = consumed === 0 && available === 0;
  const mounted = useMounted();
  return (
    <div className="surface-card p-4 flex flex-col">
      <p className="text-center text-[13px] font-semibold text-gray-700 mb-2">{name}</p>
      <div className="h-36 relative">
        {mounted && (
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="v"
              innerRadius={45}
              outerRadius={62}
              paddingAngle={1}
              startAngle={90}
              endAngle={-270}
              stroke="none"
            >
              {data.map((_, i) => (
                <Cell key={i} fill={i === 0 && consumed > 0 ? color : ringEmpty ? "#e5e7eb" : `${color}55`} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        )}
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-[10px] uppercase tracking-wider text-gray-400 font-semibold">Available</span>
          <span className="text-lg font-bold text-gray-900 tabular-nums">{available}</span>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 pt-3 border-t border-gray-100 mt-2 text-center">
        <Stat label="Available" value={available} accent="text-[#16a34a]" />
        <Stat label="Consumed" value={consumed} accent="text-amber-600" />
        <Stat label="Annual Quota" value={quota} accent="text-gray-700" />
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div>
      <div className={clsx("text-[10px] uppercase tracking-wider font-semibold", accent)}>{label}</div>
      <div className="text-sm font-bold text-gray-900 tabular-nums">{value}</div>
    </div>
  );
}
