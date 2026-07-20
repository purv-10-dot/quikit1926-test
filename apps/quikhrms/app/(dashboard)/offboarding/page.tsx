"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { Modal } from "@/components/hrms/modal";
import { EmployeeSelect } from "@/components/hrms/employees/employee-select";
import { Select } from "@/components/hrms/ui/select";
import { ExcelExportButton } from "@/components/hrms/excel-export-button";
import { UserMinus, Plus, LogOut } from "lucide-react";
import { clsx } from "clsx";

interface Instance {
  id: string; employeeId: string; resignationDate: string; lastWorkingDate: string;
  reason: string; status: string; exitInterviewDone: boolean;
  _count: { tasks: number };
  employee: {
    id: string; firstName: string; lastName: string;
    displayName: string | null; employeeCode: string;
  } | null;
}

interface ListResponse { instances: Instance[]; counts: Array<{ status: string; _count: number }>; }

const REASONS = ["Resignation", "Termination", "Retirement", "ContractEnd"] as const;

/** Format a Date as a local `yyyy-mm-dd` string for <input type="date">. */
function toDateInput(d: Date): string {
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

/** The day after `yyyy-mm-dd`, as a `yyyy-mm-dd` string. */
function nextDay(date: string): string {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + 1);
  return toDateInput(d);
}

export default function OffboardingDashboardPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const [showInit, setShowInit] = useState(false);
  const [form, setForm] = useState({ employeeId: "", resignationDate: "", lastWorkingDate: "", reason: "Resignation" as typeof REASONS[number], notes: "" });

  const { data } = useQuery({
    queryKey: ["offboarding", "list"],
    queryFn: () => api.get<ListResponse>("/api/v1/hrms/offboarding?limit=100"),
  });

  const initMut = useMutation({
    mutationFn: (body: typeof form) => api.post("/api/v1/hrms/offboarding/initiate", body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["offboarding"] }); setShowInit(false); },
  });

  const d = data?.data;
  const countsMap: Record<string, number> = {};
  (d?.counts ?? []).forEach((c) => { countsMap[c.status] = c._count; });

  // Flatten each offboarding instance (the currently rendered set) into one
  // export row, matching the visible table columns.
  const excelColumns = [
    { header: "Employee", key: "employee", width: 24 },
    { header: "Employee Code", key: "employeeCode", width: 16 },
    { header: "Reason", key: "reason", width: 16 },
    { header: "Last Working Day", key: "lastWorkingDay", width: 18 },
    { header: "Tasks", key: "tasks", width: 10 },
    { header: "Status", key: "status", width: 20 },
  ];
  const excelRows = (d?.instances ?? []).map((i) => ({
    employee: i.employee ? (i.employee.displayName ?? `${i.employee.firstName} ${i.employee.lastName}`) : i.employeeId,
    employeeCode: i.employee?.employeeCode ?? "",
    reason: i.reason,
    lastWorkingDay: i.lastWorkingDate
      ? new Date(i.lastWorkingDate).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
      : "",
    tasks: i._count.tasks,
    status: i.status,
  }));

  return (
    <div className="w-full px-5 py-4">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div className="flex items-start gap-3">
          <UserMinus size={28} className="text-[#22c55e] mt-1.5" />
          <h1 className="text-base font-semibold text-gray-900">Offboarding</h1>
        </div>
        <div className="flex items-center gap-2">
          <ExcelExportButton filename="offboarding" sheetName="Offboardings" columns={excelColumns} rows={excelRows} label="Excel" />
          <button onClick={() => setShowInit(true)} className="btn btn-primary">
            <Plus size={13} /> Initiate offboarding
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        {["Initiated", "OffboardInProgress", "ClearancePending", "OffboardCompleted"].map((s) => (
          <div key={s} className="bg-white rounded-lg shadow-sm border border-gray-200 p-3">
            <div className="text-xs text-gray-500 uppercase">{s}</div>
            <div className="font-serif-display text-lg md:text-xl font-bold text-gray-900 mt-1">{countsMap[s] ?? 0}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 text-[13px] font-semibold text-gray-700">Active Offboardings</div>
        {!d || d.instances.length === 0 ? (
          <div className="p-8 text-center text-gray-500 text-xs">No offboardings</div>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-[11px] font-semibold tracking-[0.04em] uppercase text-gray-500">
              <tr>
                <th className="text-left px-4 py-2.5">Employee</th>
                <th className="text-left px-4 py-2.5">Reason</th>
                <th className="text-left px-4 py-2.5">Last Working</th>
                <th className="text-left px-4 py-2.5">Tasks</th>
                <th className="text-left px-4 py-2.5">Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {d.instances.map((i, idx) => (
                <tr key={i.id} className="row-stagger" style={{ ["--i" as never]: Math.min(idx, 10) }}>
                  <td className="px-4 py-2.5">
                    {i.employee ? (
                      <>
                        <div className="text-[13px] font-medium text-gray-900">
                          {i.employee.displayName ?? `${i.employee.firstName} ${i.employee.lastName}`}
                        </div>
                        <div className="text-xs text-gray-400">{i.employee.employeeCode}</div>
                      </>
                    ) : (
                      <span className="font-mono text-xs text-gray-500">{i.employeeId}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">{i.reason}</td>
                  <td className="px-4 py-2.5">{new Date(i.lastWorkingDate).toLocaleDateString("en-IN")}</td>
                  <td className="px-4 py-2.5">{i._count.tasks}</td>
                  <td className="px-4 py-2.5">
                    <span className={clsx("px-2 py-0.5 rounded-full text-[11px] font-medium",
                      i.status === "OffboardCompleted" ? "bg-green-100 text-green-700" :
                      "bg-[#dcfce7] text-[#16a34a]")}>{i.status}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Link href={`/offboarding/${i.employeeId}`} className="text-[#22c55e] hover:underline text-xs flex items-center gap-1 justify-end">
                      <LogOut size={12} /> Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={showInit} onClose={() => setShowInit(false)} title="Initiate Offboarding">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (form.resignationDate && form.lastWorkingDate && new Date(form.lastWorkingDate) <= new Date(form.resignationDate)) {
              alert("Last working date must be after the resignation date.");
              return;
            }
            initMut.mutate(form);
          }}
          className="space-y-4"
        >
          <EmployeeSelect
            label="Employee"
            required
            value={form.employeeId}
            onChange={(id) => setForm({ ...form, employeeId: id })}
          />
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-medium text-gray-700 mb-1">{
              form.reason === "Termination" ? "Termination Date"
                : form.reason === "Retirement" ? "Retirement Date"
                : form.reason === "ContractEnd" ? "Contract End Date"
                : "Resignation Date"
            }</label>
              <input
                type="date"
                required
                min={toDateInput(new Date())}
                value={form.resignationDate}
                onChange={(e) => {
                  const resignationDate = e.target.value;
                  // Clear an now-invalid last working date (must stay after resignation).
                  setForm((f) => ({
                    ...f,
                    resignationDate,
                    lastWorkingDate: f.lastWorkingDate && f.lastWorkingDate <= resignationDate ? "" : f.lastWorkingDate,
                  }));
                }}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs" /></div>
            <div><label className="block text-xs font-medium text-gray-700 mb-1">Last Working Date</label>
              <input
                type="date"
                required
                min={form.resignationDate ? nextDay(form.resignationDate) : toDateInput(new Date())}
                value={form.lastWorkingDate}
                onChange={(e) => setForm({ ...form, lastWorkingDate: e.target.value })}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs"
              /></div>
          </div>
          <div><label className="block text-xs font-medium text-gray-700 mb-1">Reason</label>
            <Select
              value={form.reason}
              onChange={(v) => setForm({ ...form, reason: v as typeof REASONS[number] })}
              options={REASONS.map((r) => ({ value: r, label: r }))}
            /></div>
          <div><label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="w-full border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs" rows={2} /></div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowInit(false)} className="px-3 py-1.5 border border-[var(--border)] rounded-lg text-xs font-medium">Cancel</button>
            <button type="submit" disabled={initMut.isPending} className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 disabled:opacity-50">Initiate</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
