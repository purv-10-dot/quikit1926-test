"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { Modal } from "@/components/hrms/modal";
import { Select } from "@/components/hrms/ui/select";
import { NumberInput } from "@/components/hrms/ui/number-input";
import { Users, Plus, IndianRupee, Check, ShieldCheck, X as XIcon, Lock } from "lucide-react";
import { clsx } from "clsx";
import { SkeletonTable } from "@/components/hrms/skeleton";

interface Row {
  employeeId: string;
  employeeCode: string;
  name: string;
  workEmail: string;
  department: string | null;
  designation: string | null;
  salary: { id: string; ctc: string | number; effectiveFrom: string; structure: { id: string; name: string; code: string } | null } | null;
}

interface Template { id: string; name: string; code: string; isDefault: boolean; }

const INR = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const inputCls = "w-full px-3 py-2 text-sm border border-[var(--border)] rounded-md focus:outline-none focus:ring-1 focus:ring-[#166534] focus:border-transparent";

export default function EmployeeSalariesPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const [assignTarget, setAssignTarget] = useState<Row | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["payroll", "employee-salaries"],
    queryFn: () => api.get<Row[]>("/api/v1/hrms/payroll/employee-salaries"),
  });

  const rows = data?.data ?? [];
  const assigned = rows.filter((r) => r.salary).length;

  return (
    <div className="w-full px-5 py-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-start gap-3">
          <Users size={28} className="text-[#22c55e] mt-1.5" />
          <div>
            <h1 className="text-page-title text-gray-900 leading-tight">Employee salaries</h1>
            <p className="text-xs text-gray-500 mt-1">{assigned}/{rows.length} employees have a salary assigned.</p>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-4"><SkeletonTable rows={6} cols={5} /></div>
        ) : rows.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-500">No employees found.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] font-semibold text-gray-500 uppercase tracking-[0.04em] border-b border-gray-200">
                <th className="text-left py-2.5 px-4">Employee</th>
                <th className="text-left py-2.5 px-4">Department</th>
                <th className="text-left py-2.5 px-4">Designation</th>
                <th className="text-left py-2.5 px-4">Template</th>
                <th className="text-right py-2.5 px-4">CTC (Annual)</th>
                <th className="text-left py-2.5 px-4">Effective From</th>
                <th className="w-24" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.employeeId} className="row-stagger border-b border-gray-50 hover:bg-gray-50" style={{ ["--i" as never]: Math.min(i, 10) }}>
                  <td className="py-2.5 px-4">
                    <p className="text-[13px] font-medium text-gray-900">{r.name}</p>
                    <p className="text-xs text-gray-500">{r.employeeCode} · {r.workEmail}</p>
                  </td>
                  <td className="py-2.5 px-4 text-xs text-gray-700">{r.department ?? "—"}</td>
                  <td className="py-2.5 px-4 text-xs text-gray-700">{r.designation ?? "—"}</td>
                  <td className="py-2.5 px-4 text-xs text-gray-700">{r.salary?.structure?.name ?? <span className="text-gray-400">—</span>}</td>
                  <td className="py-2.5 px-4 text-right text-gray-900">
                    {r.salary ? `₹${INR.format(Number(r.salary.ctc))}` : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="py-2.5 px-4 text-xs text-gray-700">
                    {r.salary ? new Date(r.salary.effectiveFrom).toLocaleDateString("en-IN") : "—"}
                  </td>
                  <td className="py-2.5 px-4 text-right">
                    <button
                      onClick={() => setAssignTarget(r)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-normal bg-green-600 hover:bg-green-700 text-white rounded shadow-sm"
                    >
                      {r.salary ? "Revise" : <><Plus size={12} /> Assign</>}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={!!assignTarget} onClose={() => setAssignTarget(null)} title={assignTarget?.salary ? "Revise Salary" : "Assign Salary"} size="md">
        {assignTarget && (
          <AssignForm
            row={assignTarget}
            onCancel={() => setAssignTarget(null)}
            onSaved={() => {
              qc.invalidateQueries({ queryKey: ["payroll", "employee-salaries"] });
              qc.invalidateQueries({ queryKey: ["payroll", "setup", "status"] });
              setAssignTarget(null);
            }}
          />
        )}
      </Modal>
    </div>
  );
}

function AssignForm({ row, onCancel, onSaved }: { row: Row; onCancel: () => void; onSaved: () => void }) {
  const api = useApiClient();
  const [err, setErr] = useState<string | null>(null);

  const { data: tplRes } = useQuery({
    queryKey: ["payroll", "salary-templates"],
    queryFn: () => api.get<Template[]>("/api/v1/hrms/payroll/salary-templates"),
  });
  const templates = tplRes?.data ?? [];
  const defaultTpl = templates.find((t) => t.isDefault) ?? templates[0];

  const [form, setForm] = useState<{
    structureId: string; ctc: number | null; effectiveFrom: string; revisionReason: string;
  }>({
    structureId: row.salary?.structure?.id ?? defaultTpl?.id ?? "",
    ctc: row.salary ? Number(row.salary.ctc) : null,
    effectiveFrom: new Date().toISOString().slice(0, 10),
    revisionReason: "",
  });

  // sync if templates load later
  useState(() => {
    if (!form.structureId && defaultTpl) setForm((p) => ({ ...p, structureId: defaultTpl.id }));
  });

  const mut = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post("/api/v1/hrms/payroll/employee-salaries", body),
    onSuccess: onSaved,
    meta: { suppressGlobalError: true },
    onError: (e: Error) => setErr(e.message),
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!form.structureId) return setErr("Select a template");
        if (!form.ctc || form.ctc <= 0) return setErr("Enter a valid CTC");
        mut.mutate({
          employeeId: row.employeeId,
          structureId: form.structureId,
          ctc: form.ctc,
          effectiveFrom: form.effectiveFrom,
          revisionReason: form.revisionReason || null,
        });
      }}
      className="p-4 space-y-4"
    >
      <div className="rounded bg-gray-50 border border-gray-200 p-3 text-xs">
        <p className="font-semibold text-gray-900">{row.name}</p>
        <p className="text-gray-600">{row.employeeCode} · {row.workEmail}</p>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">
          Salary Template <span className="text-red-500">*</span>
        </label>
        <Select
          value={form.structureId}
          onChange={(v) => setForm({ ...form, structureId: v })}
          placeholder="Select template"
          searchable
          options={templates.map((t) => ({ value: t.id, label: `${t.name}${t.isDefault ? " (default)" : ""}` }))}
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">
          Annual CTC <span className="text-red-500">*</span>
        </label>
        <div className="flex items-center border border-[var(--border)] rounded-md overflow-hidden">
          <span className="px-3 py-2 bg-gray-50 text-gray-500 text-sm border-r border-gray-300"><IndianRupee size={13} /></span>
          <NumberInput value={form.ctc} onChange={(v) => setForm({ ...form, ctc: v })} className="flex-1 px-3 py-2 text-sm outline-none" />
          <span className="px-3 py-2 bg-gray-50 text-gray-500 text-sm border-l border-gray-300">per year</span>
        </div>
        <p className="text-[11px] text-gray-500 mt-1">Monthly: ₹{INR.format(Math.round((form.ctc ?? 0) / 12))}</p>
      </div>

      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Effective From</label>
        <input type="date" value={form.effectiveFrom} onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })} className={inputCls} />
      </div>

      {row.salary && (
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Revision Reason</label>
          <input value={form.revisionReason} onChange={(e) => setForm({ ...form, revisionReason: e.target.value })} placeholder="e.g. Annual appraisal" className={inputCls} />
        </div>
      )}

      {/* Statutory deductions preview — read-only, auto-updates from CTC + template.
          If the employee has the corresponding applicability flag = false, the
          field is forced to 0 with an "Excluded" pill. */}
      <StatutoryPreview employeeId={row.employeeId} structureId={form.structureId} ctc={form.ctc} />


      {err && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded px-3 py-2">{err}</p>}

      <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
        <button type="button" onClick={onCancel} className="px-3 py-1.5 border border-[var(--border)] bg-white hover:bg-gray-50 text-gray-700 rounded-md text-xs font-medium">Cancel</button>
        <button type="submit" disabled={mut.isPending} className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white rounded-md text-xs font-medium shadow-sm">
          <Check size={13} /> {mut.isPending ? "Saving..." : "Save"}
        </button>
      </div>
    </form>
  );
}

interface StatutoryPreviewResp {
  basicMonthly: number;
  daMonthly: number;
  grossMonthly: number;
  epf: { applicable: boolean; employee: number; employer: number };
  esi: { applicable: boolean; employee: number; employer: number };
  pt:  { applicable: boolean; amount: number; state: string | null };
}

function StatutoryPreview({
  employeeId, structureId, ctc,
}: {
  employeeId: string;
  structureId: string;
  ctc: number | null;
}) {
  const api = useApiClient();
  const enabled = !!structureId && !!ctc && ctc > 0;

  const { data, isFetching } = useQuery({
    queryKey: ["statutory-preview", employeeId, structureId, ctc],
    queryFn: () => api.get<StatutoryPreviewResp>(
      `/api/v1/hrms/payroll/employee-salaries/preview-statutory?employeeId=${employeeId}&structureId=${structureId}&ctc=${ctc}`,
    ),
    enabled,
    staleTime: 30_000,
  });

  const p = data?.data;

  return (
    <div className="rounded-lg ring-1 ring-gray-200 bg-gray-50/60 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <ShieldCheck size={13} className="text-[#166534]" />
          <span className="text-xs font-bold text-gray-800 uppercase tracking-wide">
            Estimated monthly statutory deductions
          </span>
        </div>
        <span className="inline-flex items-center gap-1 text-[10px] text-gray-500 font-semibold">
          <Lock size={9} /> Read-only · derived from template + CTC
        </span>
      </div>

      {!enabled ? (
        <p className="text-[11px] text-gray-400">Pick a template and enter a CTC to see EPF / ESI / PT.</p>
      ) : isFetching && !p ? (
        <p className="text-[11px] text-gray-500">Computing…</p>
      ) : !p ? (
        <p className="text-[11px] text-amber-700">Couldn't load preview.</p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <DualPreviewCard
              title="EPF"
              applicable={p.epf.applicable}
              employee={p.epf.employee}
              employer={p.epf.employer}
            />
            <DualPreviewCard
              title="ESI"
              applicable={p.esi.applicable}
              employee={p.esi.employee}
              employer={p.esi.employer}
            />
            <SinglePreviewCard
              title="PT"
              applicable={p.pt.applicable}
              amount={p.pt.amount}
              subtitle={p.pt.state ?? "—"}
            />
          </div>
          <p className="mt-2 text-[10px] text-gray-500">
            Basic+DA: ₹{INR.format(p.basicMonthly + p.daMonthly)} · Gross: ₹{INR.format(p.grossMonthly)}.
            Excluded fields show <strong>₹0</strong> because the employee opted out in onboarding.
          </p>
        </>
      )}
    </div>
  );
}

/** EPF / ESI card — shows BOTH employee + employer contributions, each labeled. */
function DualPreviewCard({
  title, applicable, employee, employer,
}: {
  title: string;
  applicable: boolean;
  employee: number;
  employer: number;
}) {
  const total = employee + employer;
  return (
    <div className={clsx(
      "rounded-md ring-1 p-2.5",
      applicable ? "ring-gray-200 bg-white" : "ring-amber-200 bg-amber-50/60",
    )}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-bold text-gray-600 uppercase tracking-wide">{title}</span>
        {!applicable && (
          <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700">
            <XIcon size={8} /> Excluded
          </span>
        )}
      </div>

      <div className="space-y-1">
        <ContribRow label="Employee" value={employee} dimmed={!applicable} />
        <ContribRow label="Employer" value={employer} dimmed={!applicable} />
        <div className="pt-1 border-t border-gray-100 flex items-center justify-between">
          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Total</span>
          <span className={clsx("text-sm font-bold tabular-nums", applicable ? "text-gray-900" : "text-gray-400")}>
            ₹{INR.format(total)}
          </span>
        </div>
      </div>
    </div>
  );
}

/** PT card — single amount, no split. */
function SinglePreviewCard({
  title, applicable, amount, subtitle,
}: {
  title: string;
  applicable: boolean;
  amount: number;
  subtitle: string;
}) {
  return (
    <div className={clsx(
      "rounded-md ring-1 p-2.5 flex flex-col",
      applicable ? "ring-gray-200 bg-white" : "ring-amber-200 bg-amber-50/60",
    )}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-bold text-gray-600 uppercase tracking-wide">{title}</span>
        {!applicable && (
          <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700">
            <XIcon size={8} /> Excluded
          </span>
        )}
      </div>
      <div className="flex-1 flex flex-col items-center justify-center text-center">
        <p className={clsx("text-base font-bold tabular-nums", applicable ? "text-gray-900" : "text-gray-400")}>
          ₹{INR.format(amount)}
        </p>
        <p className="text-[10px] text-gray-500 mt-0.5">{subtitle}</p>
      </div>
    </div>
  );
}

function ContribRow({ label, value, dimmed }: { label: string; value: number; dimmed?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] text-gray-600 font-medium">{label}</span>
      <span className={clsx("text-sm font-semibold tabular-nums", dimmed ? "text-gray-400" : "text-gray-900")}>
        ₹{INR.format(value)}
      </span>
    </div>
  );
}
