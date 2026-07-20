"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { Modal } from "@/components/hrms/modal";
import { Select } from "@/components/hrms/ui/select";
import { NumberInput } from "@/components/hrms/ui/number-input";
import { Check, X, Plus } from "lucide-react";
import { clsx } from "clsx";
import { SkeletonTable } from "@/components/hrms/skeleton";

interface Revision {
  id: string;
  employeeId: string;
  employee: { id: string; employeeCode: string; firstName: string; lastName: string; department: { name: string } | null } | null;
  currentCTC: string | number;
  proposedCTC: string | number;
  effectiveFrom: string;
  reason: string | null;
  status: "Pending" | "Approved" | "Rejected" | "Cancelled";
  structure: { id: string; name: string; code: string } | null;
  rejectionReason: string | null;
  createdAt: string;
}

interface EmpRow {
  employeeId: string; employeeCode: string; name: string; workEmail: string;
  department: string | null; designation: string | null;
  salary: { ctc: string | number; structure: { id: string; name: string } | null } | null;
}

interface Template { id: string; name: string; isDefault: boolean; }

const INR = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const STATUSES = ["Pending", "Approved", "Rejected"] as const;
const inputCls = "w-full px-3 py-2 text-sm border border-[var(--border)] rounded-md";

export function SalaryRevisionTab() {
  const api = useApiClient();
  const qc = useQueryClient();
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("Pending");
  const [createOpen, setCreateOpen] = useState(false);
  const [target, setTarget] = useState<{ rev: Revision; action: "approve" | "reject" } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["payroll", "approvals", "salary-revisions", status],
    queryFn: () => api.get<Revision[]>(`/api/v1/hrms/payroll/approvals/salary-revisions?status=${status}`),
  });
  const rows = data?.data ?? [];

  const approveMut = useMutation({
    mutationFn: (id: string) => api.post(`/api/v1/hrms/payroll/approvals/salary-revisions/${id}/approve`, {}),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["payroll"] }); setTarget(null); },
  });
  const rejectMut = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.post(`/api/v1/hrms/payroll/approvals/salary-revisions/${id}/reject`, { rejectionReason: reason }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["payroll"] }); setTarget(null); },
  });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={clsx(
                "px-3 py-1 text-xs rounded-full border transition",
                status === s ? "bg-green-600 text-white border-[#22c55e]" : "bg-white text-gray-600 border-gray-300 hover:border-[#86efac]",
              )}
            >{s}</button>
          ))}
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-md text-xs font-medium shadow-sm"
        >
          <Plus size={13} /> Propose Revision
        </button>
      </div>

      {isLoading ? (
        <SkeletonTable rows={5} cols={5} />
      ) : rows.length === 0 ? (
        <div className="py-10 text-center text-xs text-gray-500">No {status.toLowerCase()} salary revisions.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-table-head font-bold text-gray-500 uppercase tracking-wider border-b border-gray-200">
                <th className="text-left py-2 px-3">Employee</th>
                <th className="text-right py-2 px-3">Current CTC</th>
                <th className="text-right py-2 px-3">Proposed CTC</th>
                <th className="text-right py-2 px-3">Increase</th>
                <th className="text-left py-2 px-3">Effective From</th>
                <th className="text-left py-2 px-3">Reason</th>
                <th className="w-32" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const diff = Number(r.proposedCTC) - Number(r.currentCTC);
                const pct = ((diff / Number(r.currentCTC)) * 100).toFixed(1);
                return (
                  <tr key={r.id} className="row-stagger border-b border-gray-50 hover:bg-gray-50" style={{ ["--i" as never]: Math.min(i, 10) }}>
                    <td className="py-3 px-3">
                      <p className="text-[13px] font-medium text-gray-900">{r.employee ? `${r.employee.firstName} ${r.employee.lastName}` : "Unknown"}</p>
                      <p className="text-xs text-gray-500">{r.employee?.employeeCode}</p>
                    </td>
                    <td className="py-3 px-3 text-right text-gray-700">₹{INR.format(Number(r.currentCTC))}</td>
                    <td className="py-3 px-3 text-right text-gray-900 font-semibold">₹{INR.format(Number(r.proposedCTC))}</td>
                    <td className="py-3 px-3 text-right">
                      <span className={diff >= 0 ? "text-emerald-600" : "text-red-600"}>
                        {diff >= 0 ? "+" : ""}₹{INR.format(Math.abs(diff))} ({pct}%)
                      </span>
                    </td>
                    <td className="py-3 px-3 text-xs text-gray-700">{new Date(r.effectiveFrom).toLocaleDateString("en-IN")}</td>
                    <td className="py-3 px-3 text-xs text-gray-600">{r.reason ?? "—"}</td>
                    <td className="py-3 px-3 text-right">
                      {r.status === "Pending" && (
                        <div className="flex gap-1 justify-end">
                          <button onClick={() => setTarget({ rev: r, action: "approve" })} className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-emerald-600 hover:bg-emerald-700 text-white rounded">
                            <Check size={12} /> Approve
                          </button>
                          <button onClick={() => setTarget({ rev: r, action: "reject" })} className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded">
                            <X size={12} /> Reject
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Propose Salary Revision" size="md">
        <CreateRevisionForm onCancel={() => setCreateOpen(false)} onCreated={() => { setCreateOpen(false); qc.invalidateQueries({ queryKey: ["payroll", "approvals", "salary-revisions"] }); }} />
      </Modal>

      <Modal open={!!target} onClose={() => setTarget(null)} title={target?.action === "approve" ? "Approve Revision" : "Reject Revision"} size="sm">
        {target && (
          <ActionForm
            revision={target.rev}
            action={target.action}
            onCancel={() => setTarget(null)}
            onSubmit={(v) => {
              if (target.action === "approve") approveMut.mutate(target.rev.id);
              else rejectMut.mutate({ id: target.rev.id, reason: v.reason ?? "" });
            }}
            pending={approveMut.isPending || rejectMut.isPending}
          />
        )}
      </Modal>
    </div>
  );
}

function CreateRevisionForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: () => void }) {
  const api = useApiClient();
  const [err, setErr] = useState<string | null>(null);

  const { data: empRes } = useQuery({
    queryKey: ["payroll", "employee-salaries"],
    queryFn: () => api.get<EmpRow[]>("/api/v1/hrms/payroll/employee-salaries"),
  });
  const { data: tplRes } = useQuery({
    queryKey: ["payroll", "salary-templates"],
    queryFn: () => api.get<Template[]>("/api/v1/hrms/payroll/salary-templates"),
  });
  const employees = (empRes?.data ?? []).filter((e) => !!e.salary);
  const templates = tplRes?.data ?? [];

  const [form, setForm] = useState<{
    employeeId: string; proposedCTC: number | null; structureId: string;
    effectiveFrom: string; reason: string;
  }>({
    employeeId: "", proposedCTC: null, structureId: "",
    effectiveFrom: new Date().toISOString().slice(0, 10), reason: "",
  });

  const mut = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post("/api/v1/hrms/payroll/approvals/salary-revisions", body),
    onSuccess: onCreated,
    meta: { suppressGlobalError: true },
    onError: (e: Error) => setErr(e.message),
  });

  const selectedEmp = employees.find((e) => e.employeeId === form.employeeId);

  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      if (!form.employeeId) return setErr("Select employee");
      if (!form.proposedCTC) return setErr("Enter proposed CTC");
      mut.mutate({
        employeeId: form.employeeId,
        proposedCTC: form.proposedCTC,
        structureId: form.structureId || null,
        effectiveFrom: form.effectiveFrom,
        reason: form.reason || null,
      });
    }} className="p-4 space-y-3">
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Employee <span className="text-red-500">*</span></label>
        <Select
          value={form.employeeId}
          onChange={(v) => setForm({ ...form, employeeId: v })}
          required
          searchable
          placeholder="Select employee"
          options={employees.map((e) => ({
            value: e.employeeId,
            label: `${e.name} (${e.employeeCode})`,
            description: `Current: ₹${INR.format(Number(e.salary!.ctc))}`,
          }))}
        />
        {employees.length === 0 && (
          <p className="text-[11px] text-amber-600 mt-1">No employees with active salary assignments. Assign salaries first.</p>
        )}
      </div>

      {selectedEmp?.salary && (
        <div className="rounded bg-gray-50 border border-gray-200 p-3 text-xs">
          <p>Current CTC: <span className="font-semibold">₹{INR.format(Number(selectedEmp.salary.ctc))}</span></p>
          <p>Current Template: <span className="font-semibold">{selectedEmp.salary.structure?.name ?? "—"}</span></p>
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Proposed Annual CTC <span className="text-red-500">*</span></label>
        <NumberInput value={form.proposedCTC} onChange={(v) => setForm({ ...form, proposedCTC: v })} required className={inputCls} />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Salary Template (optional)</label>
        <Select
          value={form.structureId}
          onChange={(v) => setForm({ ...form, structureId: v })}
          placeholder="Keep current"
          searchable={templates.length > 5}
          options={templates.map((t) => ({ value: t.id, label: `${t.name}${t.isDefault ? " (default)" : ""}` }))}
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Effective From</label>
        <input type="date" value={form.effectiveFrom} onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })} className={inputCls} />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Reason</label>
        <input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="e.g. Annual appraisal, Promotion, Market correction" className={inputCls} />
      </div>

      {err && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded px-3 py-2">{err}</p>}

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
        <button type="button" onClick={onCancel} className="px-3 py-1.5 border border-[var(--border)] bg-white hover:bg-gray-50 text-gray-700 rounded-md text-xs font-medium">Cancel</button>
        <button type="submit" disabled={mut.isPending} className="px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white rounded-md text-xs font-medium shadow-sm">
          {mut.isPending ? "Submitting..." : "Submit for Approval"}
        </button>
      </div>
    </form>
  );
}

function ActionForm({
  revision, action, onCancel, onSubmit, pending,
}: {
  revision: Revision; action: "approve" | "reject";
  onCancel: () => void;
  onSubmit: (v: { reason?: string }) => void;
  pending: boolean;
}) {
  const [reason, setReason] = useState("");
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit({ reason }); }} className="p-4 space-y-3">
      <div className="rounded bg-gray-50 border border-gray-200 p-3 text-xs">
        <p className="font-semibold">{revision.employee ? `${revision.employee.firstName} ${revision.employee.lastName}` : "—"}</p>
        <p className="text-gray-600">₹{INR.format(Number(revision.currentCTC))} → ₹{INR.format(Number(revision.proposedCTC))}</p>
        <p className="text-gray-600">Effective {new Date(revision.effectiveFrom).toLocaleDateString("en-IN")}</p>
      </div>
      {action === "approve" ? (
        <p className="text-xs text-gray-700">
          Approving will create a new salary record effective <span className="font-semibold">{new Date(revision.effectiveFrom).toLocaleDateString("en-IN")}</span> and deactivate the current one.
        </p>
      ) : (
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Rejection Reason <span className="text-red-500">*</span></label>
          <textarea required rows={3} value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls} />
        </div>
      )}
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
        <button type="button" onClick={onCancel} className="px-3 py-1.5 border border-[var(--border)] bg-white hover:bg-gray-50 text-gray-700 rounded-md text-xs font-medium">Cancel</button>
        <button type="submit" disabled={pending}
          className={clsx(
            "px-3 py-1.5 text-white rounded-md text-xs font-medium shadow-sm disabled:opacity-60",
            action === "approve" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700",
          )}>
          {pending ? "Submitting..." : action === "approve" ? "Approve" : "Reject"}
        </button>
      </div>
    </form>
  );
}
