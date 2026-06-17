"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { Modal } from "@/components/hrms/modal";
import { EmployeeSelect } from "@/components/hrms/employees/employee-select";
import { Select } from "@/components/hrms/ui/select";
import { UserMinus, Plus, LogOut } from "lucide-react";
import { clsx } from "clsx";

interface Instance {
  id: string; employeeId: string; resignationDate: string; lastWorkingDate: string;
  reason: string; status: string; exitInterviewDone: boolean;
  _count: { tasks: number };
}

interface ListResponse { instances: Instance[]; counts: Array<{ status: string; _count: number }>; }

const REASONS = ["Resignation", "Termination", "Retirement", "ContractEnd"] as const;

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

  return (
    <div className="w-full px-6 py-6">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div className="flex items-start gap-3">
          <UserMinus size={28} className="text-[#3b82f6] mt-1.5" />
          <h1 className="font-serif-display text-3xl md:text-4xl font-bold text-gray-900">Offboarding</h1>
        </div>
        <button onClick={() => setShowInit(true)} className="btn btn-primary">
          <Plus size={14} /> Initiate offboarding
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {["Initiated", "OffboardInProgress", "ClearancePending", "OffboardCompleted"].map((s) => (
          <div key={s} className="bg-white rounded-lg shadow-sm border border-gray-200 p-3">
            <div className="text-xs text-gray-500 uppercase">{s}</div>
            <div className="font-serif-display text-3xl md:text-4xl font-bold text-gray-900 mt-1">{countsMap[s] ?? 0}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 text-sm font-medium text-gray-700">Active Offboardings</div>
        {!d || d.instances.length === 0 ? (
          <div className="p-8 text-center text-gray-500 text-sm">No offboardings</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="text-left px-4 py-2">Employee</th>
                <th className="text-left px-4 py-2">Reason</th>
                <th className="text-left px-4 py-2">Last Working</th>
                <th className="text-left px-4 py-2">Tasks</th>
                <th className="text-left px-4 py-2">Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {d.instances.map((i, idx) => (
                <tr key={i.id} className="row-stagger" style={{ ["--i" as never]: Math.min(idx, 10) }}>
                  <td className="px-4 py-3 font-mono text-xs">{i.employeeId}</td>
                  <td className="px-4 py-3">{i.reason}</td>
                  <td className="px-4 py-3">{new Date(i.lastWorkingDate).toLocaleDateString("en-IN")}</td>
                  <td className="px-4 py-3">{i._count.tasks}</td>
                  <td className="px-4 py-3">
                    <span className={clsx("px-2 py-0.5 rounded-full text-xs font-medium",
                      i.status === "OffboardCompleted" ? "bg-green-100 text-green-700" :
                      "bg-[#dbeafe] text-[#2563eb]")}>{i.status}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/offboarding/${i.employeeId}`} className="text-[#3b82f6] hover:underline text-xs flex items-center gap-1 justify-end">
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
            if (form.resignationDate && form.lastWorkingDate && new Date(form.lastWorkingDate) < new Date(form.resignationDate)) {
              alert("Last working date cannot be before resignation date.");
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
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Resignation Date</label>
              <input type="date" required value={form.resignationDate} onChange={(e) => setForm({ ...form, resignationDate: e.target.value })}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Last Working Date</label>
              <input
                type="date"
                required
                min={form.resignationDate || undefined}
                value={form.lastWorkingDate}
                onChange={(e) => setForm({ ...form, lastWorkingDate: e.target.value })}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
              /></div>
          </div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
            <Select
              value={form.reason}
              onChange={(v) => setForm({ ...form, reason: v as typeof REASONS[number] })}
              options={REASONS.map((r) => ({ value: r, label: r }))}
            /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" rows={2} /></div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowInit(false)} className="px-4 py-2 border border-[var(--border)] rounded-lg text-sm">Cancel</button>
            <button type="submit" disabled={initMut.isPending} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">Initiate</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
