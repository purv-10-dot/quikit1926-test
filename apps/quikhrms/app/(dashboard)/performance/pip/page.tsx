"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { Modal } from "@/components/hrms/modal";
import { todayInput } from "@/lib/utils/date-input";
import { EmployeeSelect } from "@/components/hrms/employees/employee-select";
import { Select } from "@/components/hrms/ui/select";
import { useDialog } from "@/components/hrms/dialog";
import { clsx } from "clsx";
import { Plus, AlertTriangle, CheckCircle2, XCircle, Trash2 } from "lucide-react";
import { SkeletonTable } from "@/components/hrms/skeleton";
import { useToast } from "@/components/hrms/toast";

interface PIPItem {
  id: string;
  reason: string;
  startDate: string;
  endDate: string;
  status: string;
  outcome: string | null;
  employee: { id: string; firstName: string; lastName: string; employeeCode: string; department: { name: string } | null };
  initiatedBy: { id: string; firstName: string; lastName: string };
}

const statusColors: Record<string, string> = {
  PIPActive: "bg-red-100 text-red-700",
  PIPExtended: "bg-orange-100 text-orange-700",
  PIPCompletedSuccess: "bg-green-100 text-green-700",
  PIPFailed: "bg-gray-100 text-gray-700",
  PIPWithdrawn: "bg-gray-100 text-gray-400",
};

const statusLabels: Record<string, string> = {
  PIPActive: "Active",
  PIPExtended: "Extended",
  PIPCompletedSuccess: "Completed",
  PIPFailed: "Failed",
  PIPWithdrawn: "Withdrawn",
};

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default function PIPPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const dialog = useDialog();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ employeeId: "", reason: "", startDate: "", endDate: "" });

  const [statusFilter, setStatusFilter] = useState("");
  const [employeeFilter, setEmployeeFilter] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["pips", statusFilter, employeeFilter],
    queryFn: () => {
      const p = new URLSearchParams({ limit: "50" });
      if (statusFilter) p.set("status", statusFilter);
      if (employeeFilter) p.set("employeeId", employeeFilter);
      return api.get<PIPItem[]>(`/api/v1/hrms/performance/pip?${p.toString()}`);
    },
  });

  const createMut = useMutation({
    mutationFn: (body: typeof form) => api.post("/api/v1/hrms/performance/pip", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pips"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
      setShowCreate(false);
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, status, outcome }: { id: string; status: string; outcome?: string }) =>
      api.patch(`/api/v1/hrms/performance/pip/${id}`, { status, outcome }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pips"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const toast = useToast();
  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/hrms/performance/pip/${id}`),
    onSuccess: () => {
      toast.success("PIP deleted");
      qc.invalidateQueries({ queryKey: ["pips"] });
    },
  });
  const confirmDeletePIP = async (p: PIPItem) => {
    const ok = await dialog.confirm({
      title: "Delete this PIP?",
      description: `PIP for ${p.employee.firstName} ${p.employee.lastName} will be removed.`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (ok) deleteMut.mutate(p.id);
  };

  const pips = data?.data ?? [];

  return (
    <div className="w-full px-5 py-4">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h1 className="text-page-title text-gray-900">Improvement Plans</h1>
        <button onClick={() => { setForm({ employeeId: "", reason: "", startDate: "", endDate: "" }); setShowCreate(true); }}
          className="btn btn-danger">
          <Plus size={13} /> Initiate PIP
        </button>
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <Select
          value={statusFilter}
          onChange={setStatusFilter}
          className="w-44"
          options={[
            { value: "", label: "All statuses" },
            { value: "PIPActive", label: "Active" },
            { value: "PIPExtended", label: "Extended" },
            { value: "PIPCompletedSuccess", label: "Completed (Success)" },
            { value: "PIPFailed", label: "Failed" },
            { value: "PIPWithdrawn", label: "Withdrawn" },
          ]}
        />
        <div className="w-64">
          <EmployeeSelect value={employeeFilter} onChange={setEmployeeFilter} placeholder="Filter by employee" />
        </div>
        {(statusFilter || employeeFilter) && (
          <button
            type="button"
            onClick={() => { setStatusFilter(""); setEmployeeFilter(""); }}
            className="text-xs text-[#22c55e] hover:underline"
          >
            Clear
          </button>
        )}
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="p-4"><SkeletonTable rows={5} cols={5} /></div>
        ) : pips.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <AlertTriangle size={32} className="mx-auto mb-2 text-gray-300" />
            No PIPs
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-[0.04em]">Employee</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-[0.04em]">Reason</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-[0.04em]">Period</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-[0.04em]">Initiated By</th>
                <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-[0.04em]">Status</th>
                <th className="text-right px-4 py-2.5 text-[11px] font-semibold text-gray-500 uppercase tracking-[0.04em]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pips.map((p, i) => (
                <tr key={p.id} className="row-stagger border-b border-gray-100 hover:bg-gray-50" style={{ ["--i" as never]: Math.min(i, 10) }}>
                  <td className="px-4 py-2.5">
                    <p className="text-[13px] font-medium text-gray-900">{p.employee.firstName} {p.employee.lastName}</p>
                    <p className="text-xs text-gray-500">{p.employee.department?.name}</p>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-700 max-w-[200px] truncate">{p.reason}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-700">{formatDate(p.startDate)} — {formatDate(p.endDate)}</td>
                  <td className="px-4 py-2.5 text-xs text-gray-700">{p.initiatedBy.firstName} {p.initiatedBy.lastName}</td>
                  <td className="px-4 py-2.5">
                    <span className={clsx("px-2 py-0.5 rounded-full text-[11px] font-medium", statusColors[p.status])}>
                      {statusLabels[p.status] ?? p.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {p.status === "PIPActive" && (
                      <div className="flex gap-2 justify-end">
                        <button
                          type="button"
                          disabled={updateMut.isPending}
                          onClick={async () => {
                            const ok = await dialog.confirm({
                              title: "Mark PIP as Completed?",
                              description: `${p.employee.firstName} ${p.employee.lastName} will be marked Improved. The employee will be notified.`,
                              variant: "info",
                              confirmLabel: "Mark Completed",
                              cancelLabel: "Cancel",
                            });
                            if (ok) updateMut.mutate({ id: p.id, status: "PIPCompletedSuccess", outcome: "Improved" });
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-green-50 text-green-700 ring-1 ring-green-200 text-xs font-normal hover:bg-green-100 hover:ring-green-300 transition disabled:opacity-50"
                          title="Mark as successfully completed"
                        >
                          <CheckCircle2 size={12} /> Complete
                        </button>
                        <button
                          type="button"
                          disabled={updateMut.isPending}
                          onClick={async () => {
                            const ok = await dialog.confirm({
                              title: "Mark PIP as Failed?",
                              description: `${p.employee.firstName} ${p.employee.lastName} will be marked Terminated. The employee will be notified. This action is irreversible.`,
                              variant: "danger",
                              confirmLabel: "Mark Failed",
                              cancelLabel: "Cancel",
                            });
                            if (ok) updateMut.mutate({ id: p.id, status: "PIPFailed", outcome: "Terminated" });
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-red-50 text-red-700 ring-1 ring-red-200 text-xs font-normal hover:bg-red-100 hover:ring-red-300 transition disabled:opacity-50"
                          title="Mark as failed"
                        >
                          <XCircle size={12} /> Fail
                        </button>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => confirmDeletePIP(p)}
                      title="Delete PIP"
                      className="ml-2 p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 rounded transition"
                    >
                      <Trash2 size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Initiate PIP">
        <form onSubmit={(e) => { e.preventDefault(); createMut.mutate(form); }} className="space-y-4">
          <EmployeeSelect
            label="Employee"
            required
            value={form.employeeId}
            onChange={(id) => setForm({ ...form, employeeId: id })}
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
            <textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} required rows={3}
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#166534]" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
              <input type="date" value={form.startDate} min={todayInput()} onChange={(e) => setForm({ ...form, startDate: e.target.value })} required
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#166534]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
              <input type="date" value={form.endDate} min={todayInput()} onChange={(e) => setForm({ ...form, endDate: e.target.value })} required
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#166534]" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowCreate(false)} className="px-3 py-1.5 border border-[var(--border)] rounded-lg text-xs font-medium">Cancel</button>
            <button type="submit" className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-medium hover:bg-red-700">Initiate</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
