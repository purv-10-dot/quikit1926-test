"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { Modal } from "@/components/hrms/modal";
import { Play, Plus, Calendar } from "lucide-react";
import { clsx } from "clsx";
import { SkeletonTable } from "@/components/hrms/skeleton";

interface PayRun {
  id: string;
  periodStart: string;
  periodEnd: string;
  payDate: string;
  status: "Draft" | "Processing" | "Approved" | "Paid" | "Cancelled";
  employeeCount: number;
  totalGross: string | number;
  totalNet: string | number;
  totalDeductions: string | number;
}

const INR = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const inputCls = "w-full px-3 py-2 text-sm border border-[var(--border)] rounded-md focus:outline-none focus:ring-1 focus:ring-[#166534] focus:border-transparent";

function statusClass(s: string) {
  switch (s) {
    case "Draft": return "bg-gray-100 text-gray-700";
    case "Processing": return "bg-[#dcfce7] text-[#16a34a]";
    case "Approved": return "bg-amber-100 text-amber-700";
    case "Paid": return "bg-emerald-100 text-emerald-700";
    case "Cancelled": return "bg-red-100 text-red-700";
    default: return "bg-gray-100 text-gray-600";
  }
}

export default function PayRunsPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [month, setMonth] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["payroll", "runs"],
    queryFn: () => api.get<PayRun[]>("/api/v1/hrms/payroll/runs"),
  });
  const rows = data?.data ?? [];

  // Filter by the run's period (month picker and/or a date range), client-side.
  const filtered = rows.filter((r) => {
    const ps = r.periodStart.slice(0, 10);
    if (month && r.periodStart.slice(0, 7) !== month) return false;
    if (dateFrom && ps < dateFrom) return false;
    if (dateTo && ps > dateTo) return false;
    return true;
  });
  const hasFilter = !!(month || dateFrom || dateTo);

  return (
    <div className="w-full px-5 py-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-start gap-3">
          <Play size={28} className="text-[#22c55e] mt-1.5" />
          <div>
            <h1 className="text-page-title text-gray-900 leading-tight">Pay runs</h1>
            <p className="text-xs text-gray-500 mt-1">Process monthly payroll, review payslips, approve and release.</p>
          </div>
        </div>
        <button onClick={() => setCreateOpen(true)} className="btn btn-primary">
          <Plus size={13} /> New pay run
        </button>
      </div>

      {rows.length > 0 && (
        <div className="flex items-end gap-3 flex-wrap bg-white border border-gray-200 rounded-lg p-3 shadow-sm">
          <div>
            <label className="block text-[11px] font-semibold text-gray-600 mb-1">Month</label>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="border border-[var(--border)] rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-gray-600 mb-1">From</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="border border-[var(--border)] rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-gray-600 mb-1">To</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="border border-[var(--border)] rounded-lg px-3 py-2 text-sm" />
          </div>
          {hasFilter && (
            <button onClick={() => { setMonth(""); setDateFrom(""); setDateTo(""); }} className="px-3 py-1.5 border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50">
              Reset
            </button>
          )}
          <span className="text-xs text-gray-500 self-center ml-auto">{filtered.length} of {rows.length} runs</span>
        </div>
      )}

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-4"><SkeletonTable rows={5} cols={5} /></div>
        ) : rows.length === 0 ? (
          <div className="py-12 text-center">
            <div className="mx-auto w-16 h-16 rounded-full bg-gradient-to-br from-[#dcfce7] to-[#dcfce7] flex items-center justify-center mb-3">
              <Calendar size={28} className="text-[#bbf7d0]" />
            </div>
            <p className="text-xs text-gray-600">No pay runs yet.</p>
            <p className="text-xs text-gray-500 mt-1">Assign salaries to employees first, then create a pay run.</p>
            <button onClick={() => setCreateOpen(true)} className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-md text-xs font-medium">
              <Plus size={13} /> Create Pay Run
            </button>
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-table-head font-bold text-gray-500 uppercase tracking-wider border-b border-gray-200">
                <th className="text-left py-2 px-3">Period</th>
                <th className="text-left py-2 px-3">Pay Date</th>
                <th className="text-right py-2 px-3">Employees</th>
                <th className="text-right py-2 px-3">Gross</th>
                <th className="text-right py-2 px-3">Deductions</th>
                <th className="text-right py-2 px-3">Net</th>
                <th className="text-left py-2 px-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-xs text-gray-500">No pay runs match the selected period.</td>
                </tr>
              )}
              {filtered.map((r, i) => (
                <tr key={r.id} className="row-stagger border-b border-gray-50 hover:bg-gray-50" style={{ ["--i" as never]: Math.min(i, 10) }}>
                  <td className="py-3 px-3">
                    <Link href={`/payroll/runs/${r.id}`} className="text-[13px] text-[#22c55e] font-medium hover:underline">
                      {new Date(r.periodStart).toLocaleString("en-IN", { month: "short", year: "numeric" }).toUpperCase()}
                    </Link>
                    <p className="text-xs text-gray-500">
                      {new Date(r.periodStart).toLocaleDateString("en-IN")} — {new Date(r.periodEnd).toLocaleDateString("en-IN")}
                    </p>
                  </td>
                  <td className="py-3 px-3 text-gray-700">{new Date(r.payDate).toLocaleDateString("en-IN")}</td>
                  <td className="py-3 px-3 text-right text-gray-900">{r.employeeCount}</td>
                  <td className="py-3 px-3 text-right text-gray-900">₹{INR.format(Number(r.totalGross))}</td>
                  <td className="py-3 px-3 text-right text-gray-700">₹{INR.format(Number(r.totalDeductions))}</td>
                  <td className="py-3 px-3 text-right text-gray-900 font-semibold">₹{INR.format(Number(r.totalNet))}</td>
                  <td className="py-3 px-3">
                    <span className={clsx("text-xs font-semibold px-2 py-0.5 rounded", statusClass(r.status))}>{r.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="New Pay Run" size="md">
        <CreatePayRunForm onCancel={() => setCreateOpen(false)} onCreated={(id) => { setCreateOpen(false); qc.invalidateQueries({ queryKey: ["payroll", "runs"] }); window.location.href = `/payroll/runs/${id}`; }} />
      </Modal>
    </div>
  );
}

function computeSpanDays(start: string, end: string): number | null {
  if (!start || !end) return null;
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  if (Number.isNaN(s) || Number.isNaN(e) || e < s) return null;
  return Math.floor((e - s) / (24 * 60 * 60 * 1000)) + 1;
}

// Two date strings ("YYYY-MM-DD") lie in the same calendar month if their
// first 7 characters match. String comparison avoids timezone-shift bugs.
function sameCalendarMonth(start: string, end: string): boolean {
  if (!start || !end) return true;
  return start.slice(0, 7) === end.slice(0, 7);
}

function CreatePayRunForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: (id: string) => void }) {
  const api = useApiClient();
  const now = new Date();
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const [form, setForm] = useState({
    periodStart: firstOfMonth.toISOString().slice(0, 10),
    periodEnd: lastOfMonth.toISOString().slice(0, 10),
    payDate: lastOfMonth.toISOString().slice(0, 10),
    notes: "",
  });
  const [err, setErr] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post<{ id: string }>("/api/v1/hrms/payroll/runs", body),
    onSuccess: (res) => onCreated(res.data.id),
    meta: { suppressGlobalError: true },
    onError: (e: Error) => setErr(e.message),
  });

  const spanDays = computeSpanDays(form.periodStart, form.periodEnd);
  const crossesMonth = !sameCalendarMonth(form.periodStart, form.periodEnd);
  const endBeforeStart = !!form.periodStart && !!form.periodEnd && new Date(form.periodEnd) < new Date(form.periodStart);
  const payDateBeforeEnd = !!form.payDate && !!form.periodEnd && form.payDate < form.periodEnd;
  const periodInvalid = crossesMonth || endBeforeStart || payDateBeforeEnd;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (periodInvalid) return;
        mut.mutate(form);
      }}
      className="p-4 space-y-3"
    >
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Period Start</label>
          <input type="date" value={form.periodStart} onChange={(e) => setForm({ ...form, periodStart: e.target.value })} required className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Period End</label>
          <input type="date" value={form.periodEnd} onChange={(e) => setForm({ ...form, periodEnd: e.target.value })} required className={inputCls} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Pay Date</label>
          <input
            type="date"
            value={form.payDate}
            min={form.periodEnd || undefined}
            onChange={(e) => setForm({ ...form, payDate: e.target.value })}
            required
            className={inputCls}
          />
        </div>
      </div>

      {/* Span indicator + validation */}
      {spanDays != null && !crossesMonth && (
        <p className="text-xs text-gray-500">
          Period covers <span className="font-semibold tabular-nums">{spanDays}</span> {spanDays === 1 ? "day" : "days"}.
        </p>
      )}
      {crossesMonth && (
        <p className="text-xs text-red-600">
          A pay run must lie within a single calendar month. Split this into separate runs per month.
        </p>
      )}
      {endBeforeStart && (
        <p className="text-xs text-red-600">Period end must be on or after period start.</p>
      )}
      {payDateBeforeEnd && (
        <p className="text-xs text-red-600">Pay date must be on or after period end. It can equal period end but not precede it.</p>
      )}

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
        <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className={inputCls} />
      </div>
      {err && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded px-3 py-2">{err}</p>}
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
        <button type="button" onClick={onCancel} className="px-4 py-2 border border-[var(--border)] bg-white hover:bg-gray-50 text-gray-700 rounded-md text-sm font-medium">Cancel</button>
        <button
          type="submit"
          disabled={mut.isPending || periodInvalid}
          className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-md text-sm font-semibold shadow-sm"
        >
          {mut.isPending ? "Creating..." : "Create"}
        </button>
      </div>
    </form>
  );
}
