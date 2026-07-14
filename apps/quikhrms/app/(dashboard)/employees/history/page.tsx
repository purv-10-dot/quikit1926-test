"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { Modal } from "@/components/hrms/modal";
import { useToast } from "@/components/hrms/toast";
import {
  History, Plus, ArrowRight, Award, TrendingUp, ArrowRightLeft, Wallet,
  BadgeCheck, MoreHorizontal, Calendar, Lightbulb, User as UserIcon, Clock,
} from "lucide-react";
import { EmptyState } from "@/components/hrms/empty-state";
import { EmployeeSelect } from "@/components/hrms/employees/employee-select";
import { FileUploadInput } from "@/components/hrms/file-upload-input";
import { clsx } from "clsx";

interface HistoryEntry {
  id: string; employeeId: string; changeType: string;
  fromValue: Record<string, unknown> | null; toValue: Record<string, unknown>;
  effectiveDate: string; reason: string | null; letterUrl: string | null; notes: string | null;
  approvedBy: string | null; createdAt: string;
  // Present only in the tenant-wide "all employees" feed.
  employee?: { id: string; firstName: string; lastName: string; employeeCode: string | null } | null;
}

interface EmployeeDetail {
  id: string; firstName: string; lastName: string; employeeCode: string;
  employmentType: string | null; status: string | null; profilePhoto: string | null;
  designation: { title: string } | null;
  department: { name: string } | null;
  officeLocation: { name: string } | null;
  reportingManager: { firstName: string; lastName: string } | null;
}

type ChangeTypeKey =
  | "Promotion" | "Transfer" | "SalaryChange" | "ConfirmationChange" | "RoleChange";

const mgrName = (e?: EmployeeDetail) =>
  e?.reportingManager ? `${e.reportingManager.firstName} ${e.reportingManager.lastName}`.trim() : "";

interface FieldDef { key: string; label: string; current: (e?: EmployeeDetail) => string }

const CHANGE_CARDS: { key: ChangeTypeKey; label: string; icon: typeof TrendingUp }[] = [
  { key: "Promotion", label: "Promotion", icon: TrendingUp },
  { key: "Transfer", label: "Transfer", icon: ArrowRightLeft },
  { key: "SalaryChange", label: "Salary Revision", icon: Wallet },
  { key: "ConfirmationChange", label: "Confirmation", icon: BadgeCheck },
  { key: "RoleChange", label: "Others", icon: MoreHorizontal },
];

const FIELDS_BY_TYPE: Record<ChangeTypeKey, FieldDef[]> = {
  Promotion: [
    { key: "Designation", label: "Designation", current: (e) => e?.designation?.title ?? "" },
    { key: "Department", label: "Department", current: (e) => e?.department?.name ?? "" },
    { key: "Reporting Manager", label: "Reporting To", current: mgrName },
  ],
  Transfer: [
    { key: "Department", label: "Department", current: (e) => e?.department?.name ?? "" },
    { key: "Location", label: "Location", current: (e) => e?.officeLocation?.name ?? "" },
    { key: "Reporting Manager", label: "Reporting To", current: mgrName },
  ],
  SalaryChange: [
    { key: "CTC", label: "CTC (₹/yr)", current: () => "" },
  ],
  ConfirmationChange: [
    { key: "Status", label: "Status", current: (e) => e?.status ?? "" },
  ],
  RoleChange: [
    { key: "Designation", label: "Designation", current: (e) => e?.designation?.title ?? "" },
    { key: "Department", label: "Department", current: (e) => e?.department?.name ?? "" },
    { key: "Reporting Manager", label: "Reporting To", current: mgrName },
  ],
};

const RATING_KEY = "Talent Rating";
const ratingColor = (r: string) =>
  r === "A-Player" ? "bg-emerald-100 text-emerald-700"
    : r === "B-Player" ? "bg-amber-100 text-amber-700"
      : r === "C-Player" ? "bg-red-100 text-red-700"
        : "bg-gray-100 text-gray-600";

const typeColors: Record<string, string> = {
  Promotion: "bg-green-100 text-green-700",
  Transfer: "bg-[#dcfce7] text-[#16a34a]",
  RoleChange: "bg-purple-100 text-purple-700",
  SalaryChange: "bg-emerald-100 text-emerald-700",
  ConfirmationChange: "bg-cyan-100 text-cyan-700",
  EmpStatusChange: "bg-yellow-100 text-yellow-700",
  DepartmentChange: "bg-[#dcfce7] text-[#16a34a]",
  ManagerChange: "bg-orange-100 text-orange-700",
};

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

export default function EmploymentHistoryPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const [employeeId, setEmployeeId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  // Per-employee history (when one is selected).
  const { data } = useQuery({
    queryKey: ["employee-history", employeeId],
    queryFn: () => api.get<HistoryEntry[]>(`/api/v1/hrms/employees/${employeeId}/history`),
    enabled: !!employeeId,
    // Always fetch fresh on view so a just-recorded change (e.g. a department
    // edit) shows immediately instead of from a stale 60s cache.
    staleTime: 0,
    refetchOnMount: "always",
  });

  // Default view: all employees' history (no one selected).
  const { data: allData } = useQuery({
    queryKey: ["employee-history", "all"],
    queryFn: () => api.get<HistoryEntry[]>("/api/v1/hrms/employees/history?limit=500"),
    enabled: !employeeId,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const allEntries = (employeeId ? data?.data : allData?.data) ?? [];
  const fromTs = fromDate ? new Date(fromDate).getTime() : null;
  const toTs = toDate ? new Date(toDate).getTime() + 24 * 60 * 60 * 1000 - 1 : null;
  const entries = allEntries.filter((e) => {
    const t = new Date(e.effectiveDate).getTime();
    if (fromTs !== null && t < fromTs) return false;
    if (toTs !== null && t > toTs) return false;
    return true;
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <History className="text-[#22c55e]" />
          <h1 className="text-base font-semibold text-gray-900">Employment History</h1>
        </div>
        {employeeId && (
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 btn btn-primary">
            <Plus size={13} /> Add Change
          </button>
        )}
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
        <div className="md:col-span-2">
          <EmployeeSelect label="Employee" value={employeeId} onChange={setEmployeeId} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Effective From</label>
          <input type="date" value={fromDate} max={toDate || undefined} onChange={(e) => setFromDate(e.target.value)} className="w-full border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Effective To</label>
          <input type="date" value={toDate} min={fromDate || undefined} onChange={(e) => setToDate(e.target.value)} className="w-full border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs" />
        </div>
        {(fromDate || toDate) && (
          <div className="md:col-span-4 flex items-center justify-between text-xs text-gray-500">
            <span>Showing {entries.length} of {allEntries.length}</span>
            <button type="button" onClick={() => { setFromDate(""); setToDate(""); }} className="text-[#22c55e] hover:underline">Clear date filter</button>
          </div>
        )}
      </div>

      {(
        entries.length === 0 ? (
          <div className="p-1"><EmptyState variant="bot" title={fromDate || toDate ? "No changes in selected date range" : "No Data Found"} className="border border-gray-200 shadow-sm" /></div>
        ) : (
          <div className="space-y-3">
            {entries.map((e) => {
              const keys = Object.keys(e.toValue ?? {});
              return (
                <div key={e.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      {/* Show who, in the all-employees feed (no employee selected). */}
                      {!employeeId && e.employee && (
                        <div className="flex items-center gap-1.5 mb-1.5 text-[13px] font-semibold text-gray-900">
                          <UserIcon size={13} className="text-gray-400" />
                          {e.employee.firstName} {e.employee.lastName}
                          {e.employee.employeeCode && (
                            <span className="text-xs font-normal text-gray-400">· {e.employee.employeeCode}</span>
                          )}
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <span className={clsx("px-2 py-0.5 rounded-full text-[11px] font-medium", typeColors[e.changeType] ?? "bg-gray-100 text-gray-700")}>{e.changeType}</span>
                        <span className="text-xs text-gray-500">Effective {fmtDate(e.effectiveDate)}</span>
                      </div>
                      {e.reason && <div className="text-xs text-gray-700 mt-2">{e.reason}</div>}

                      <div className="mt-2 space-y-1">
                        {keys.map((k) => {
                          const to = String(e.toValue[k]);
                          const from = e.fromValue?.[k];
                          if (k === RATING_KEY) {
                            return (
                              <div key={k} className="flex items-center gap-2 text-xs">
                                <Award size={13} className="text-gray-400" />
                                <span className="text-gray-500 w-32 shrink-0">Talent Rating</span>
                                <span className={clsx("px-2 py-0.5 rounded-full font-semibold", ratingColor(to))}>{to}</span>
                              </div>
                            );
                          }
                          return (
                            <div key={k} className="flex items-center gap-2 text-xs">
                              <span className="text-gray-500 w-32 shrink-0 truncate">{k}</span>
                              {from != null && from !== "" && (
                                <>
                                  <span className="bg-gray-100 px-2 py-0.5 rounded text-gray-600">{String(from)}</span>
                                  <ArrowRight size={12} className="text-gray-400 shrink-0" />
                                </>
                              )}
                              <span className="bg-[#dcfce7] px-2 py-0.5 rounded text-[#16a34a] font-medium">{to}</span>
                            </div>
                          );
                        })}
                      </div>

                      {e.notes && <div className="text-xs text-gray-600 mt-2">{e.notes}</div>}
                    </div>
                    {e.letterUrl && (
                      <a href={e.letterUrl} target="_blank" rel="noreferrer" className="text-xs text-[#22c55e] hover:underline shrink-0 ml-3">View letter</a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {showAdd && (
        <AddChangeModal
          employeeId={employeeId}
          recent={allEntries}
          onClose={() => setShowAdd(false)}
          onSaved={() => { qc.invalidateQueries({ queryKey: ["employee-history"] }); setShowAdd(false); }}
        />
      )}
    </div>
  );
}

// ─── ADD EMPLOYMENT CHANGE (redesigned) ──────────────────

function AddChangeModal({ employeeId, recent, onClose, onSaved }: {
  employeeId: string; recent: HistoryEntry[]; onClose: () => void; onSaved: () => void;
}) {
  const api = useApiClient();
  const toast = useToast();

  const [changeType, setChangeType] = useState<ChangeTypeKey>("Promotion");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [reason, setReason] = useState("");
  const [letterUrl, setLetterUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [newValues, setNewValues] = useState<Record<string, string>>({});

  const { data: empResp } = useQuery({
    queryKey: ["employee-detail", employeeId],
    queryFn: () => api.get<EmployeeDetail>(`/api/v1/hrms/employees/${employeeId}`),
    enabled: !!employeeId,
  });
  const emp = empResp?.data;

  const fields = FIELDS_BY_TYPE[changeType];
  const setType = (t: ChangeTypeKey) => { setChangeType(t); setNewValues({}); };
  const setNew = (k: string, v: string) => setNewValues((p) => ({ ...p, [k]: v }));

  // Live diff for the summary panel.
  const changes = useMemo(
    () => fields
      .map((f) => ({ key: f.key, label: f.label, from: f.current(emp), to: (newValues[f.key] ?? "").trim() }))
      .filter((c) => c.to),
    [fields, emp, newValues],
  );

  const addMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post(`/api/v1/hrms/employees/${employeeId}/history`, body),
    onSuccess: () => { toast.success("Employment change recorded"); onSaved(); },
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!effectiveDate) { toast.error("Effective date required"); return; }
    if (changes.length === 0) { toast.error("Nothing to record", "Fill at least one new value."); return; }
    const fromValue: Record<string, string> = {};
    const toValue: Record<string, string> = {};
    for (const c of changes) {
      toValue[c.key] = c.to;
      if (c.from) fromValue[c.key] = c.from;
    }
    addMut.mutate({
      changeType,
      effectiveDate,
      reason: reason || undefined,
      fromValue: Object.keys(fromValue).length ? fromValue : undefined,
      toValue,
      letterUrl: letterUrl || undefined,
      notes: notes || undefined,
    });
  };

  const empName = emp ? `${emp.firstName} ${emp.lastName}`.trim() : "Employee";
  const inputCls = "w-full border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-[#166534]";

  return (
    <Modal open onClose={onClose} title="Add Employment Change" subtitle="Update employee details and track their career growth" size="2xl" bodyClassName="p-0 overflow-y-auto">
      <form onSubmit={submit}>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px]">
          {/* ── LEFT: form ── */}
          <div className="p-4 space-y-4 border-r border-gray-100">
            {/* Step indicator (Change Details is the active step) */}
            <div className="flex items-center gap-2 text-xs">
              {["Change Details", "Review", "Confirm"].map((s, i) => (
                <div key={s} className="flex items-center gap-2">
                  <span className={clsx("inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-semibold",
                    i === 0 ? "bg-green-600 text-white" : "bg-gray-100 text-gray-500")}>
                    <span className={clsx("w-4 h-4 rounded-full grid place-items-center text-[10px]",
                      i === 0 ? "bg-white/20" : "bg-gray-200 text-gray-600")}>{i + 1}</span>
                    {s}
                  </span>
                  {i < 2 && <span className="text-gray-300">—</span>}
                </div>
              ))}
            </div>

            {/* 1. Change Type */}
            <div>
              <p className="text-[13px] font-semibold text-gray-900 mb-1">1. Change Type</p>
              <p className="text-xs text-gray-500 mb-3">Select the type of employment change.</p>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {CHANGE_CARDS.map((c) => {
                  const active = changeType === c.key;
                  const Icon = c.icon;
                  return (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => setType(c.key)}
                      className={clsx(
                        "flex flex-col items-center gap-1.5 rounded-lg border px-2 py-3 text-center transition",
                        active ? "border-[#16a34a] bg-[#f0fdf4] text-[#16a34a] ring-1 ring-[#bbf7d0]" : "border-gray-200 text-gray-600 hover:border-[#bbf7d0] hover:bg-gray-50",
                      )}
                    >
                      <Icon size={18} />
                      <span className="text-[11px] font-semibold leading-tight">{c.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. Change Details */}
            <div>
              <p className="text-[13px] font-semibold text-gray-900 mb-3">2. Change Details</p>

              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-700 mb-1">Effective Date</label>
                <div className="relative">
                  <Calendar size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input type="date" required value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} className={clsx(inputCls, "pl-8")} />
                </div>
              </div>

              {/* Current details (read-only) */}
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">Current Details</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
                {fields.map((f) => (
                  <div key={f.key} className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2">
                    <div className="text-[10px] uppercase tracking-wide text-gray-400">{f.label}</div>
                    <div className="text-xs text-gray-700 truncate">{f.current(emp) || "—"}</div>
                  </div>
                ))}
              </div>

              {/* New details (inputs) */}
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-2">New Details</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
                {fields.map((f) => (
                  <div key={f.key}>
                    <label className="block text-xs font-medium text-gray-600 mb-1">New {f.label}</label>
                    <input value={newValues[f.key] ?? ""} onChange={(e) => setNew(f.key, e.target.value)} placeholder={f.current(emp) || "Enter value"} className={inputCls} />
                  </div>
                ))}
              </div>

              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-700 mb-1">Reason</label>
                <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Promotion based on performance and contribution during annual review." className={inputCls} />
              </div>

              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-700 mb-1">Attachment</label>
                <FileUploadInput
                  value={letterUrl}
                  onChange={(url) => setLetterUrl(url)}
                  accept="application/pdf,image/png,image/jpeg,image/webp"
                  label=""
                  placeholder="Upload letter (PDF / image)"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Internal notes (optional)" className={inputCls} />
              </div>
            </div>
          </div>

          {/* ── RIGHT: summary + history ── */}
          <div className="p-4 space-y-4 bg-gray-50/60">
            {/* Employee card */}
            <div className="rounded-xl border border-gray-200 bg-white p-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#dcfce7] grid place-items-center text-[#16a34a] overflow-hidden shrink-0">
                {emp?.profilePhoto ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={emp.profilePhoto} alt="" className="w-full h-full object-cover" />
                ) : <UserIcon size={18} />}
              </div>
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-gray-900 truncate">{empName}</div>
                <div className="text-[11px] text-gray-500 truncate">
                  {emp?.employeeCode ?? "—"}{emp?.employmentType ? ` · ${emp.employmentType}` : ""}
                </div>
              </div>
            </div>

            {/* Changes summary */}
            <div className="rounded-xl border border-gray-200 bg-white p-3">
              <p className="text-[13px] font-semibold text-gray-900 mb-2">Changes Summary</p>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between gap-2">
                  <span className="text-gray-500">Effective Date</span>
                  <span className="text-gray-800 font-medium">{effectiveDate ? fmtDate(effectiveDate) : "—"}</span>
                </div>
                {changes.length === 0 ? (
                  <p className="text-gray-400 italic pt-1">No changes yet — fill the new details.</p>
                ) : changes.map((c) => (
                  <div key={c.key} className="flex items-center justify-between gap-2">
                    <span className="text-gray-500 shrink-0">{c.label}</span>
                    <span className="flex items-center gap-1 min-w-0">
                      {c.from && <span className="text-gray-400 line-through truncate max-w-[80px]">{c.from}</span>}
                      <ArrowRight size={11} className="text-gray-300 shrink-0" />
                      <span className="text-[#16a34a] font-semibold truncate max-w-[100px]">{c.to}</span>
                    </span>
                  </div>
                ))}
                {reason && (
                  <div className="pt-1 border-t border-gray-100 mt-1">
                    <span className="text-gray-500">Reason</span>
                    <p className="text-gray-700 mt-0.5">{reason}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Employment history timeline */}
            <div className="rounded-xl border border-gray-200 bg-white p-3">
              <p className="text-[13px] font-semibold text-gray-900 mb-2">Employment History</p>
              {recent.length === 0 ? (
                <p className="text-xs text-gray-400">No prior records.</p>
              ) : (
                <ol className="relative border-l border-gray-200 ml-1.5 space-y-3">
                  {recent.slice(0, 4).map((h) => (
                    <li key={h.id} className="ml-3">
                      <span className="absolute -left-[5px] w-2.5 h-2.5 rounded-full bg-[#16a34a] ring-2 ring-white" />
                      <div className="text-[11px] text-gray-400 flex items-center gap-1"><Clock size={10} /> {fmtDate(h.effectiveDate)}</div>
                      <div className="text-[13px] font-semibold text-gray-800">{h.changeType}</div>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            {/* Tip */}
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 flex gap-2">
              <Lightbulb size={15} className="text-amber-500 shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-800 leading-relaxed">
                Tip: the employee&apos;s profile is not auto-updated — record the change here, then update their profile if needed.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-100 bg-white sticky bottom-0">
          <button type="button" onClick={onClose} className="px-3 py-1.5 border border-[var(--border)] rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
          <button type="submit" disabled={addMut.isPending} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 disabled:opacity-50">
            {addMut.isPending ? "Saving…" : "Save Change"} <ArrowRight size={13} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
