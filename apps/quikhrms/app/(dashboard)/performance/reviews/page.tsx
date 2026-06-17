"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { Modal } from "@/components/hrms/modal";
import { Select } from "@/components/hrms/ui/select";
import { clsx } from "clsx";
import { Plus, Trash2 } from "lucide-react";
import { SkeletonTable } from "@/components/hrms/skeleton";
import { useDialog } from "@/components/hrms/dialog";
import { useToast } from "@/components/hrms/toast";

interface CycleItem {
  id: string;
  name: string;
  type: string;
  startDate: string;
  endDate: string;
  status: string;
  _count: { appraisals: number };
}

const statusColors: Record<string, string> = {
  Setup: "bg-gray-100 text-gray-600",
  GoalSetting: "bg-[#dbeafe] text-[#2563eb]",
  SelfReview: "bg-yellow-100 text-yellow-700",
  ManagerReview: "bg-orange-100 text-orange-700",
  PeerReview: "bg-purple-100 text-purple-700",
  Calibration: "bg-sky-100 text-sky-700",
  Complete: "bg-green-100 text-green-700",
};

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default function ReviewsPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", type: "Annual" as string, startDate: "", endDate: "" });

  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["appraisal-cycles", statusFilter, typeFilter],
    queryFn: () => {
      const p = new URLSearchParams({ limit: "50" });
      if (statusFilter) p.set("status", statusFilter);
      if (typeFilter) p.set("type", typeFilter);
      return api.get<CycleItem[]>(`/api/v1/hrms/performance/appraisals/cycles?${p.toString()}`);
    },
  });

  const createMut = useMutation({
    mutationFn: (body: typeof form) => api.post("/api/v1/hrms/performance/appraisals/cycles", body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["appraisal-cycles"] }); setShowCreate(false); },
  });

  const dialog = useDialog();
  const toast = useToast();
  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/hrms/performance/appraisals/cycles/${id}`),
    onSuccess: () => {
      toast.success("Cycle deleted");
      qc.invalidateQueries({ queryKey: ["appraisal-cycles"] });
    },
    onError: (e: Error) => toast.error("Delete failed", e.message),
  });
  const confirmDelete = async (c: CycleItem) => {
    const ok = await dialog.confirm({
      title: "Delete this cycle?",
      description: `"${c.name}" will be removed. ${c._count.appraisals > 0 ? `${c._count.appraisals} appraisals are linked.` : ""}`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (ok) deleteMut.mutate(c.id);
  };

  const cycles = data?.data ?? [];

  return (
    <div className="w-full px-6 py-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h1 className="font-serif-display text-3xl md:text-4xl font-bold text-gray-900">Performance reviews</h1>
        <button onClick={() => { setForm({ name: "", type: "Annual", startDate: "", endDate: "" }); setShowCreate(true); }}
          className="btn btn-primary">
          <Plus size={14} /> New cycle
        </button>
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <Select
          value={statusFilter}
          onChange={setStatusFilter}
          className="w-44"
          options={[
            { value: "", label: "All statuses" },
            ...["Setup", "GoalSetting", "SelfReview", "ManagerReview", "PeerReview", "Calibration", "Complete"]
              .map((s) => ({ value: s, label: s })),
          ]}
        />
        <Select
          value={typeFilter}
          onChange={setTypeFilter}
          className="w-40"
          options={[
            { value: "", label: "All types" },
            ...["Annual", "BiAnnual", "Quarterly", "Probation", "Confirmation", "PIPReview"]
              .map((t) => ({ value: t, label: t })),
          ]}
        />
        {(statusFilter || typeFilter) && (
          <button
            type="button"
            onClick={() => { setStatusFilter(""); setTypeFilter(""); }}
            className="text-xs text-[#3b82f6] hover:underline"
          >
            Clear
          </button>
        )}
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        {isLoading ? (
          <div className="p-4"><SkeletonTable rows={5} cols={5} /></div>
        ) : cycles.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No review cycles</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Cycle</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Period</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">Appraisals</th>
                <th className="w-12 px-3 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {cycles.map((c, i) => (
                <tr key={c.id} className="row-stagger border-b border-gray-100 hover:bg-gray-50" style={{ ["--i" as never]: Math.min(i, 10) }}>
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{c.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{c.type}</td>
                  <td className="px-4 py-3 text-sm text-gray-700">{formatDate(c.startDate)} — {formatDate(c.endDate)}</td>
                  <td className="px-4 py-3">
                    <span className={clsx("px-2 py-0.5 rounded-full text-xs font-medium", statusColors[c.status])}>{c.status}</span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-700 text-center">{c._count.appraisals}</td>
                  <td className="px-3 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => confirmDelete(c)}
                      title="Delete cycle"
                      className="p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600 rounded transition"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Appraisal Cycle">
        <form onSubmit={(e) => { e.preventDefault(); createMut.mutate(form); }} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#16243A]" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <Select
              value={form.type}
              onChange={(v) => setForm({ ...form, type: v })}
              options={["Annual", "BiAnnual", "Quarterly", "Probation", "Confirmation", "PIPReview"].map((t) => ({ value: t, label: t }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
              <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} required
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#16243A]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
              <input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} required
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#16243A]" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 border border-[var(--border)] rounded-lg text-sm">Cancel</button>
            <button type="submit" className="px-4 py-2 bg-[#16243A] text-white rounded-lg text-sm font-medium hover:bg-[#2563eb]">Create</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
