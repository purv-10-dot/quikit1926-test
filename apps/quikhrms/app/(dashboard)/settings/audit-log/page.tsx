"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { clsx } from "clsx";
import { Select } from "@/components/hrms/ui/select";
import {
  Shield, Activity, CheckCircle2, Pencil, PlusCircle, XCircle, Trash2,
  ChevronLeft, ChevronRight, CalendarDays, Filter, FileText,
} from "lucide-react";
import { SkeletonTable } from "@/components/hrms/skeleton";

interface AuditLogItem {
  id: string;
  userId: string;
  userName: string | null;
  subjectName: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  changes: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

// Pretty-print a single before/after value.
function fmtVal(v: unknown): string {
  if (v == null || v === "") return "—";
  if (typeof v === "number") return INR.format(v);
  return String(v);
}

// Extract a field-level before→after diff from changes._diff (set by the
// audit helper when routes pass before+after). Returns [] when absent.
function diffEntries(log: AuditLogItem): { field: string; from: unknown; to: unknown }[] {
  const d = (log.changes as { _diff?: Record<string, { from: unknown; to: unknown }> } | null)?._diff;
  if (!d || typeof d !== "object") return [];
  const LABELS: Record<string, string> = {
    status: "Status", amountApproved: "Approved Amount", approvedAmount: "Approved Amount",
    rejectionReason: "Reason", amountClaimed: "Claimed Amount",
  };
  return Object.entries(d).map(([field, v]) => ({
    field: LABELS[field] ?? field,
    from: v.from,
    to: v.to,
  }));
}

interface AuditRes {
  items: AuditLogItem[];
  stats: { total: number; byAction: Record<string, number> };
}

const INR = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

const ENTITY_LABEL: Record<string, string> = {
  ReimbursementClaim: "Reimbursement claim",
  InvestmentProof: "Investment proof",
  Form12BBDeclaration: "IT declaration (Form 12BB)",
  PriorPayrollRecord: "Prior payroll record",
  OneTimeEarning: "One-time pay",
  PayRun: "Pay run",
  Employee: "Employee",
};

const ACTION_PILL: Record<string, string> = {
  Create: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Update: "bg-green-50 text-green-700 border-green-200",
  Delete: "bg-rose-50 text-rose-700 border-rose-200",
  Approve: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Reject: "bg-rose-50 text-rose-700 border-rose-200",
  Export: "bg-purple-50 text-purple-700 border-purple-200",
  Import: "bg-amber-50 text-amber-700 border-amber-200",
  StatusChange: "bg-gray-100 text-gray-700 border-gray-200",
  Login: "bg-gray-100 text-gray-700 border-gray-200",
  Logout: "bg-gray-100 text-gray-700 border-gray-200",
};

function readableDetail(log: AuditLogItem): string {
  const data = { ...(log.changes ?? {}), ...(log.metadata ?? {}) } as Record<string, unknown>;
  const parts: string[] = [];
  const money = (v: unknown) => `₹${INR.format(Number(v) || 0)}`;

  if (data.status != null && data.status !== "") parts.push(`Status → ${data.status}`);
  if (data.approvedAmount != null) parts.push(`Approved ${money(data.approvedAmount)}`);
  if (data.amountApproved != null) parts.push(`Approved ${money(data.amountApproved)}`);
  if (data.rejectionReason) parts.push(`Reason: ${data.rejectionReason}`);
  if (data.category) parts.push(`${data.category}`);
  if (data.componentName) parts.push(`${data.componentName}`);
  if (data.amountClaimed != null) parts.push(`Claimed ${money(data.amountClaimed)}`);
  if (data.fy) parts.push(`FY ${data.fy}`);
  if (typeof data.total === "number") parts.push(`${data.total} records`);
  if (data.artifact) parts.push(`${data.artifact}`);

  if (parts.length > 0) return parts.join(" · ");
  const kv = Object.entries(data)
    .filter(([, v]) => v != null && v !== "" && typeof v !== "object")
    .map(([k, v]) => `${k}: ${v}`);
  return kv.length ? kv.join(" · ") : "—";
}

const ACTION_VERB: Record<string, string> = {
  Create: "Created", Update: "Updated", Delete: "Deleted",
  Approve: "Approved", Reject: "Rejected", Export: "Exported",
  Import: "Imported", StatusChange: "Status change", Login: "Login", Logout: "Logout",
};

// Deterministic avatar colour from a name.
const AVATAR_COLORS = [
  "bg-green-100 text-green-700", "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700", "bg-violet-100 text-violet-700",
  "bg-rose-100 text-rose-700", "bg-cyan-100 text-cyan-700",
  "bg-green-100 text-green-700",
];
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
function avatarColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default function AuditLogPage() {
  const api = useApiClient();
  const [entityType, setEntityType] = useState("");
  const [action, setAction] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [showFilters, setShowFilters] = useState(false);

  const params = new URLSearchParams({
    page: String(page),
    limit: String(perPage),
    ...(entityType && { entityType }),
    ...(action && { action }),
    ...(dateFrom && { dateFrom }),
  });

  const { data, isLoading } = useQuery({
    queryKey: ["audit-logs", entityType, action, dateFrom, page, perPage],
    queryFn: () => api.get<AuditRes>(`/api/v1/hrms/audit?${params}`),
  });

  const logs = data?.data?.items ?? [];
  const stats = data?.data?.stats ?? { total: 0, byAction: {} };
  const total = data?.meta?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const pageStart = total === 0 ? 0 : (page - 1) * perPage + 1;
  const pageEnd = Math.min(page * perPage, total);

  const KPIS = [
    { key: "total",   label: "Total Actions", value: stats.total, Icon: Activity,    tone: "slate" as const },
    { key: "Approve", label: "Approved",      value: stats.byAction.Approve ?? 0, Icon: CheckCircle2, tone: "emerald" as const },
    { key: "Update",  label: "Updated",       value: stats.byAction.Update ?? 0,  Icon: Pencil,       tone: "blue" as const },
    { key: "Create",  label: "Created",       value: stats.byAction.Create ?? 0,  Icon: PlusCircle,   tone: "teal" as const },
    { key: "Reject",  label: "Rejected",      value: stats.byAction.Reject ?? 0,  Icon: XCircle,      tone: "rose" as const },
    { key: "Delete",  label: "Deleted",       value: stats.byAction.Delete ?? 0,  Icon: Trash2,       tone: "gray" as const },
  ];

  return (
    <div className="w-full space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-lg bg-green-50 text-[#22c55e] flex items-center justify-center shrink-0">
            <Shield size={22} />
          </div>
          <div>
            <h1 className="text-base font-semibold text-gray-900 leading-tight">Audit Trail</h1>
            <p className="text-xs text-gray-500 mt-0.5">Track all actions, activities and changes.</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-gray-200 bg-white text-xs font-medium text-gray-700">
            <CalendarDays size={13} className="text-gray-400" />
            {dateFrom ? `${fmtDate(dateFrom)} → today` : "All time"}
          </div>
          <button
            type="button"
            onClick={() => setShowFilters((v) => !v)}
            className={clsx(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium",
              showFilters ? "border-[#166534] bg-green-600 text-white" : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50",
            )}
          >
            <Filter size={13} /> Filters
          </button>
        </div>
      </div>

      {/* Filters (collapsible) */}
      {showFilters && (
        <div className="bg-white rounded-lg border border-gray-200 p-4 flex items-center gap-3">
          <Select
            value={entityType}
            onChange={(v) => { setEntityType(v); setPage(1); }}
            placeholder="All Entities"
            options={[
              { value: "", label: "All Entities" },
              ...["ReimbursementClaim", "InvestmentProof", "Form12BBDeclaration", "OneTimeEarning", "PayRun", "Employee"].map((e) => ({ value: e, label: ENTITY_LABEL[e] ?? e })),
            ]}
            className="w-52"
          />
          <Select
            value={action}
            onChange={(v) => { setAction(v); setPage(1); }}
            placeholder="All Actions"
            options={[
              { value: "", label: "All Actions" },
              ...["Create", "Update", "Delete", "Approve", "Reject", "Export", "Import"].map((a) => ({ value: a, label: ACTION_VERB[a] ?? a })),
            ]}
            className="w-40"
          />
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-gray-500">Since</label>
            <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
              className="border border-gray-200 rounded-md px-3 py-1.5 text-xs" />
          </div>
          {(entityType || action || dateFrom) && (
            <button
              type="button"
              onClick={() => { setEntityType(""); setAction(""); setDateFrom(""); setPage(1); }}
              className="text-xs text-gray-500 hover:text-gray-700 underline ml-auto"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {KPIS.map((k) => (
          <KpiCard key={k.key} label={k.label} value={k.value} Icon={k.Icon} tone={k.tone} />
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="p-4"><SkeletonTable rows={8} cols={6} /></div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <Shield size={32} className="mx-auto mb-2 text-gray-300" />
            <p className="text-sm">No audit logs match these filters.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50/60 border-b border-gray-200 text-table-head font-bold text-gray-500 uppercase tracking-wider">
                    <th className="text-left px-4 py-3">Timestamp</th>
                    <th className="text-left px-4 py-3">Who</th>
                    <th className="text-left px-4 py-3">Action</th>
                    <th className="text-left px-4 py-3">Subject</th>
                    <th className="text-left px-4 py-3">Change (before → after)</th>
                    <th className="text-left px-4 py-3">IP Address</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id} className="border-b border-gray-50 hover:bg-gray-50/50 last:border-0">
                      <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      </td>
                      <td className="px-4 py-3">
                        {log.userName ? (
                          <div className="flex items-center gap-2">
                            <span className={clsx("w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0", avatarColor(log.userName))}>
                              {initialsOf(log.userName)}
                            </span>
                            <span className="text-[13px] font-medium text-gray-900 whitespace-nowrap">{log.userName}</span>
                          </div>
                        ) : (
                          <span className="font-mono text-xs text-gray-500" title={log.userId}>{log.userId.slice(0, 12)}…</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={clsx("inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border", ACTION_PILL[log.action] ?? "bg-gray-100 text-gray-700 border-gray-200")}>
                          {ACTION_VERB[log.action] ?? log.action}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {log.subjectName ? (
                          <div>
                            <p className="text-[13px] font-medium text-gray-900">{log.subjectName}</p>
                            <p className="text-[10px] text-gray-400">{ENTITY_LABEL[log.entityType] ?? log.entityType}</p>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-600">
                            {ENTITY_LABEL[log.entityType] ?? log.entityType}
                            {log.entityId && <span className="text-gray-400 ml-1">#{log.entityId.slice(0, 6)}</span>}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs max-w-[340px]">
                        {(() => {
                          const diffs = diffEntries(log);
                          if (diffs.length === 0) {
                            return <span className="text-gray-600">{readableDetail(log)}</span>;
                          }
                          return (
                            <div className="space-y-0.5">
                              {diffs.map((d) => (
                                <div key={d.field} className="flex items-center gap-1.5">
                                  <span className="text-gray-500">{d.field}:</span>
                                  <span className="px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 line-through decoration-rose-300">{fmtVal(d.from)}</span>
                                  <span className="text-gray-400">→</span>
                                  <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-medium">{fmtVal(d.to)}</span>
                                </div>
                              ))}
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3 text-xs font-mono text-gray-500 whitespace-nowrap">
                        {log.ipAddress ?? <span className="text-gray-300 font-sans">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-gray-100 bg-gray-50/40 text-xs text-gray-600">
              <p>
                Showing <span className="font-semibold text-gray-900">{pageStart}</span> to{" "}
                <span className="font-semibold text-gray-900">{pageEnd}</span> of{" "}
                <span className="font-semibold text-gray-900">{total}</span> actions
              </p>
              <div className="flex items-center gap-3">
                <Pager page={page} totalPages={totalPages} onChange={setPage} />
                <Select
                  value={String(perPage)}
                  onChange={(v) => { setPerPage(Number(v)); setPage(1); }}
                  options={[10, 25, 50, 100].map((n) => ({ value: String(n), label: `${n} / page` }))}
                  className="w-28"
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function KpiCard({
  label, value, Icon, tone,
}: {
  label: string;
  value: number;
  Icon: typeof Activity;
  tone: "slate" | "emerald" | "blue" | "teal" | "rose" | "gray";
}) {
  const ring =
    tone === "emerald" ? "text-emerald-600 ring-emerald-200" :
    tone === "blue" ? "text-green-600 ring-green-200" :
    tone === "teal" ? "text-teal-600 ring-teal-200" :
    tone === "rose" ? "text-rose-600 ring-rose-200" :
    tone === "gray" ? "text-gray-500 ring-gray-200" :
    "text-slate-700 ring-slate-200";
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3.5">
      <div className="flex items-start justify-between">
        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{label}</p>
        <div className={clsx("w-7 h-7 rounded-md bg-white flex items-center justify-center ring-1", ring)}>
          <Icon size={14} />
        </div>
      </div>
      <p className="mt-2 font-serif-display text-xl font-bold text-gray-900 tabular-nums leading-none">{value}</p>
    </div>
  );
}

function Pager({
  page, totalPages, onChange,
}: { page: number; totalPages: number; onChange: (p: number) => void }) {
  if (totalPages <= 1) return null;
  const pages: (number | "...")[] = [];
  pages.push(1);
  if (page > 3) pages.push("...");
  for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
  if (page < totalPages - 2) pages.push("...");
  if (totalPages > 1) pages.push(totalPages);

  return (
    <div className="inline-flex items-center gap-0.5">
      <button type="button" onClick={() => onChange(page - 1)} disabled={page <= 1}
        className="w-7 h-7 rounded flex items-center justify-center text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent">
        <ChevronLeft size={12} />
      </button>
      {pages.map((p, i) =>
        p === "..." ? (
          <span key={`e${i}`} className="px-1 text-gray-400 select-none">…</span>
        ) : (
          <button key={p} type="button" onClick={() => onChange(p)}
            className={clsx(
              "w-7 h-7 rounded text-xs font-semibold flex items-center justify-center tabular-nums",
              p === page ? "bg-green-600 text-white" : "text-gray-700 hover:bg-gray-100",
            )}>
            {p}
          </button>
        )
      )}
      <button type="button" onClick={() => onChange(page + 1)} disabled={page >= totalPages}
        className="w-7 h-7 rounded flex items-center justify-center text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent">
        <ChevronRight size={12} />
      </button>
    </div>
  );
}
