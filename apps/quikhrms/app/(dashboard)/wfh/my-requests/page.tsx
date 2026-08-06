"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { useRoles } from "@/lib/hooks/use-roles";
import { Modal } from "@/components/hrms/modal";
import { useToast } from "@/components/hrms/toast";
import { Plus, Home, Calendar, Clock, CheckCircle2, XCircle, MessageSquare, X, Trash2, Briefcase, ListChecks } from "lucide-react";
import { clsx } from "clsx";
import { PageHeader } from "@/components/hrms/ui/page-header";
import { PageBackground } from "@/components/hrms/page-background";
import { ExcelExportButton } from "@/components/hrms/excel-export-button";
import { Pagination } from "@/components/hrms/pagination";

interface Approver { id: string; firstName: string; lastName: string; employeeCode: string }
interface ApprovalRow { id: string; level: number; role: string; status: string; comment: string | null; decidedAt: string | null; approver: Approver }
interface WfhItem {
  id: string;
  startDate: string;
  endDate: string;
  days: string;
  isHalfDay: boolean;
  session: string;
  reason: string;
  status: "Pending" | "Approved" | "Rejected" | "Cancelled";
  appliedOn: string;
  cancelReason: string | null;
  approvals: ApprovalRow[];
}

const STATUS_PILL: Record<string, string> = {
  Pending:   "bg-amber-50 text-amber-700 ring-amber-200",
  Approved:  "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Rejected:  "bg-red-50 text-red-700 ring-red-200",
  Cancelled: "bg-slate-100 text-slate-600 ring-slate-200",
};

export default function MyWfhPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const toast = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [logItem, setLogItem] = useState<WfhItem | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    startDate: today, endDate: today,
    isHalfDay: false, session: "FullDay" as "FullDay" | "FirstHalf" | "SecondHalf",
    reason: "",
  });

  const { data, isLoading } = useQuery({
    queryKey: ["wfh", "my"],
    queryFn: () => api.get<WfhItem[]>("/api/v1/hrms/wfh/requests?scope=me&limit=50"),
  });
  const items = data?.data ?? [];
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const pageItems = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const { data: quotaData } = useQuery({
    queryKey: ["wfh", "quota", "me"],
    queryFn: () => api.get<{ hasQuota: boolean; group: { id: string; name: string } | null; yearlyQuota: number | null; used: number; remaining: number | null; year?: number }>("/api/v1/hrms/wfh/quota/me"),
  });
  const quota = quotaData?.data;

  const { hasRole } = useRoles();
  const isSuperAdmin = hasRole("admin");

  const createMut = useMutation({
    mutationFn: () => api.post("/api/v1/hrms/wfh/requests", form),
    onSuccess: () => {
      toast.success("WFH request submitted", "Manager will be notified");
      qc.invalidateQueries({ queryKey: ["wfh"] });
      setShowCreate(false);
      setForm({ startDate: today, endDate: today, isHalfDay: false, session: "FullDay", reason: "" });
    },
    onError: (e: unknown) => toast.error("Couldn't submit request", e instanceof Error ? e.message : undefined),
  });

  const cancelMut = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/hrms/wfh/requests/${id}`),
    onSuccess: () => {
      toast.success("Request cancelled");
      qc.invalidateQueries({ queryKey: ["wfh"] });
    },
  });

  const stats = {
    pending:  items.filter((i) => i.status === "Pending").length,
    approved: items.filter((i) => i.status === "Approved").length,
    rejected: items.filter((i) => i.status === "Rejected").length,
    total: items.length,
  };

  // ── Excel export (exports the currently rendered request list) ──
  const exportColumns = [
    { header: "From", key: "from", width: 16 },
    { header: "To", key: "to", width: 16 },
    { header: "Days", key: "days", width: 10 },
    { header: "Session", key: "session", width: 14 },
    { header: "Reason", key: "reason", width: 30 },
    { header: "Status", key: "status", width: 14 },
  ];
  const exportRows = items.map((i) => ({
    from: new Date(i.startDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
    to: new Date(i.endDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }),
    days: i.days,
    session: i.session === "FirstHalf" ? "First Half" : i.session === "SecondHalf" ? "Second Half" : "Full Day",
    reason: i.reason || "",
    status: i.status,
  }));

  return (
    <div className="w-full px-5 py-4">
      {/* Subtle HR-themed page background (scoped to this page only). */}
      <PageBackground src="/images/pre-onboarding-bg.png" />
      <PageHeader
        icon={<Home size={28} className="text-[#22c55e]" />}
        title="Work from home"
        subtitle="Apply for and track your remote work requests."
        actions={
          <>
            <ExcelExportButton filename="my-wfh-requests" sheetName="My WFH Requests" columns={exportColumns} rows={exportRows} label="Export to Excel" />
            <button onClick={() => setShowCreate(true)} className="btn btn-primary">
              <Plus size={13} /> Apply for WFH
            </button>
          </>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <StatCard label="Total" value={stats.total} icon={<Home size={18} />} color="blue" />
        <StatCard label="Pending" value={stats.pending} icon={<Clock size={18} />} color="amber" />
        <StatCard label="Approved" value={stats.approved} icon={<CheckCircle2 size={18} />} color="emerald" />
        <StatCard label="Rejected" value={stats.rejected} icon={<XCircle size={18} />} color="red" />
        <StatCard
          label={quota?.hasQuota && quota.yearlyQuota != null ? `Remaining (of ${quota.yearlyQuota})` : "Remaining"}
          value={quota?.hasQuota && quota.remaining != null ? quota.remaining : "—"}
          icon={<Briefcase size={18} />}
          color="blue"
        />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-slate-400 text-xs">Loading...</div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <Home size={36} className="mx-auto mb-2 text-slate-300" />
            <p className="text-[13px] font-semibold">No WFH requests yet</p>
            <p className="text-xs text-slate-400 mt-0.5">Click &quot;Apply for WFH&quot; to submit your first request.</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50/60 border-b border-slate-200">
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-[0.04em]">Date(s)</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-[0.04em]">Days</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-[0.04em]">Reason</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-[0.04em]">Approvals</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-[0.04em]">Status</th>
                <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-slate-500 uppercase tracking-[0.04em]">Action</th>
              </tr>
            </thead>
            <tbody>
              {pageItems.map((i, idx) => (
                <tr
                  key={i.id}
                  onClick={() => setLogItem(i)}
                  className="row-stagger border-b border-slate-100 hover:bg-slate-50/60 cursor-pointer"
                  style={{ ["--i" as never]: Math.min(idx, 10) }}
                >
                  <td className="px-4 py-2.5 text-xs text-slate-700">
                    <div className="flex items-center gap-1.5"><Calendar size={12} className="text-slate-400" /> {fmtRange(i.startDate, i.endDate)}</div>
                    {i.isHalfDay && <p className="text-[11px] text-slate-400 mt-0.5">{i.session}</p>}
                  </td>
                  <td className="px-4 py-2.5 text-xs font-semibold text-slate-700">{i.days}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-600 max-w-xs truncate">{i.reason}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-col gap-0.5">
                      {i.approvals.map((a) => (
                        <div key={a.id} className="flex items-center gap-1.5 text-[11px]">
                          <span className="font-semibold text-slate-600">{a.role}:</span>
                          <span className={clsx("px-1.5 py-0.5 rounded font-medium ring-1",
                            a.status === "Approved" ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                            : a.status === "Rejected" ? "bg-red-50 text-red-700 ring-red-200"
                            : a.status === "Skipped" ? "bg-slate-100 text-slate-500 ring-slate-200"
                            : "bg-amber-50 text-amber-700 ring-amber-200")}>
                            {a.status}
                          </span>
                          <span className="text-slate-400">{a.approver.firstName} {a.approver.lastName}</span>
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={clsx("px-2 py-0.5 rounded-full text-[11px] font-medium ring-1", STATUS_PILL[i.status])}>{i.status}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="inline-flex items-center gap-2 justify-end">
                      <button
                        onClick={() => setLogItem(i)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-normal bg-slate-50 text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100"
                      >
                        <ListChecks size={12} /> Log
                      </button>
                      {i.status === "Pending" && (
                        <button
                          onClick={() => { if (confirm("Cancel this WFH request?")) cancelMut.mutate(i.id); }}
                          disabled={cancelMut.isPending}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-normal bg-red-50 text-red-700 ring-1 ring-red-200 hover:bg-red-100 disabled:opacity-50"
                        >
                          <Trash2 size={12} /> Cancel
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!isLoading && items.length > 0 && (
          <Pagination page={page} totalPages={totalPages} total={items.length} limit={PAGE_SIZE} onPageChange={setPage} />
        )}
      </div>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Apply for Work From Home" size="lg">
        <form onSubmit={(e) => {
          e.preventDefault();
          if (!form.reason.trim()) return toast.error("Reason is required");
          if (form.endDate < form.startDate) return toast.error("End date can’t be before the start date");
          if (form.isHalfDay && form.startDate !== form.endDate) return toast.error("Half-day WFH must be a single day");
          createMut.mutate();
        }} className="space-y-4">
          {/* Half-day only makes sense for a single day. */}
          {form.startDate === form.endDate && (
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={form.isHalfDay}
                onChange={(e) => setForm({
                  ...form,
                  isHalfDay: e.target.checked,
                  session: e.target.checked ? "FirstHalf" : "FullDay",
                  endDate: e.target.checked ? form.startDate : form.endDate,
                })}
              />
              Half-day WFH
            </label>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Start Date *</label>
              <input
                type="date"
                required
                min={today}
                value={form.startDate}
                onChange={(e) => setForm({
                  ...form,
                  startDate: e.target.value,
                  endDate: form.isHalfDay ? e.target.value : (form.endDate < e.target.value ? e.target.value : form.endDate),
                })}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#166534]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">End Date *</label>
              <input
                type="date"
                required
                disabled={form.isHalfDay}
                min={form.startDate}
                value={form.endDate}
                onChange={(e) => {
                  const end = e.target.value;
                  const multiDay = end !== form.startDate;
                  // Extending to a range drops half-day (it only applies to one day).
                  setForm({ ...form, endDate: end, isHalfDay: multiDay ? false : form.isHalfDay, session: multiDay ? "FullDay" : form.session });
                }}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#166534] disabled:bg-slate-50 disabled:text-slate-400"
              />
            </div>
          </div>

          <div className="w-36">
            <label className="block text-xs font-medium text-gray-700 mb-1">Total days</label>
            <input
              readOnly
              value={totalDaysLabel(form.startDate, form.endDate, form.isHalfDay)}
              className="w-full border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs bg-slate-50 text-slate-600 cursor-default focus:outline-none"
            />
          </div>

          {form.isHalfDay && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Session *</label>
              <div className="flex gap-2">
                {(["FirstHalf", "SecondHalf"] as const).map((s) => (
                  <button key={s} type="button"
                    onClick={() => setForm({ ...form, session: s })}
                    className={clsx("flex-1 px-3 py-1.5 rounded-lg text-xs font-medium ring-1",
                      form.session === s ? "bg-green-600 text-white ring-[#22c55e]" : "bg-white text-slate-600 ring-slate-200")}
                  >{s === "FirstHalf" ? "First Half" : "Second Half"}</button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Reason *</label>
            <textarea
              rows={3}
              required
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              placeholder="Why do you need WFH? (e.g., medical, family commitment, internet/commute issues)"
              className="w-full border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#166534]"
            />
          </div>

          <div className="bg-green-50 border border-green-200 rounded-md p-2.5 text-[11px] text-green-700 flex gap-1.5">
            <MessageSquare size={12} className="shrink-0 mt-0.5" />
            Approval flow: <strong>Manager → HR</strong>. Both must approve.
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <button type="button" onClick={() => setShowCreate(false)} disabled={createMut.isPending}
              className="px-3 py-1.5 border border-[var(--border)] rounded-lg text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={createMut.isPending}
              className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-medium shadow-sm disabled:opacity-50">
              {createMut.isPending ? "Submitting..." : "Submit Request"}
            </button>
          </div>
        </form>
      </Modal>

      <Modal open={!!logItem} onClose={() => setLogItem(null)} title={logItem ? `Approval log · ${fmtRange(logItem.startDate, logItem.endDate)}` : "Approval log"}>
        {logItem && (
          <div className="space-y-3">
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-slate-500">Status</span>
                <span className={clsx("px-2 py-0.5 rounded-full text-[11px] font-medium ring-1", STATUS_PILL[logItem.status])}>{logItem.status}</span>
              </div>
              <div className="text-xs text-slate-600">Days: <strong className="text-slate-900">{logItem.days}</strong>{logItem.isHalfDay && ` · ${logItem.session}`}</div>
              <div className="text-xs text-slate-600 mt-1">Reason: <span className="text-slate-900">{logItem.reason}</span></div>
              {logItem.cancelReason && (
                <div className="text-xs text-red-600 mt-1">Cancel reason: {logItem.cancelReason}</div>
              )}
            </div>

            <div>
              <h4 className="text-xs font-bold text-gray-600 uppercase mb-2">Approval chain</h4>
              {logItem.approvals.length === 0 ? (
                <p className="text-xs text-gray-400">No approval steps.</p>
              ) : (
                <ol className="space-y-2">
                  {logItem.approvals.map((a) => (
                    <li key={a.id} className="border border-gray-200 rounded-lg p-3">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-gray-100 text-gray-600 text-xs font-bold flex items-center justify-center">L{a.level}</span>
                          <div>
                            <p className="text-[13px] font-semibold text-gray-900">{a.role}</p>
                            <p className="text-xs text-gray-500">{a.approver.firstName} {a.approver.lastName} {a.approver.employeeCode ? `· ${a.approver.employeeCode}` : ""}</p>
                          </div>
                        </div>
                        <span className={clsx("px-2 py-0.5 rounded text-[11px] font-medium ring-1",
                          a.status === "Approved" ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                          : a.status === "Rejected" ? "bg-red-50 text-red-700 ring-red-200"
                          : a.status === "Skipped" ? "bg-slate-100 text-slate-500 ring-slate-200"
                          : "bg-amber-50 text-amber-700 ring-amber-200")}>
                          {a.status}
                        </span>
                      </div>
                      {a.decidedAt && (
                        <p className="text-[11px] text-gray-400 mt-1.5">
                          Decided: {new Date(a.decidedAt).toLocaleString("en-IN")}
                        </p>
                      )}
                      {a.comment && (
                        <div className="mt-2 text-xs text-gray-700 bg-gray-50 border border-gray-100 rounded p-2 whitespace-pre-wrap">{a.comment}</div>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button onClick={() => setLogItem(null)} className="btn btn-secondary btn-sm">Close</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// Inclusive calendar-day count for the picked range (half-day = 0.5).
function totalDaysLabel(start: string, end: string, isHalfDay: boolean): string {
  if (isHalfDay) return "0.5 day";
  const s = new Date(start);
  const e = new Date(end);
  if (isNaN(s.getTime()) || isNaN(e.getTime()) || e < s) return "—";
  const n = Math.floor((e.getTime() - s.getTime()) / 86400000) + 1;
  return `${n} day${n === 1 ? "" : "s"}`;
}

function fmtRange(start: string, end: string): string {
  const fmt = (s: string) => new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  return start === end ? fmt(start) : `${fmt(start)} → ${fmt(end)}`;
}

function StatCard({ label, value, icon, color }: { label: string; value: React.ReactNode; icon: React.ReactNode; color: "blue" | "amber" | "emerald" | "red" }) {
  const cls = {
    blue: "bg-green-50 text-green-600",
    amber: "bg-amber-50 text-amber-600",
    emerald: "bg-emerald-50 text-emerald-600",
    red: "bg-red-50 text-red-600",
  }[color];
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex items-center gap-3">
      <div className={clsx("w-11 h-11 rounded-lg flex items-center justify-center", cls)}>{icon}</div>
      <div>
        <p className="text-[11px] text-slate-500 font-medium">{label}</p>
        <p className="text-xl font-bold text-slate-900 leading-tight">{value}</p>
      </div>
    </div>
  );
}
