"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { TimeRecordsTabs } from "@/components/hrms/time-records-tabs";
import { Modal } from "@/components/hrms/modal";
import { Select } from "@/components/hrms/ui/select";
import { useDialog } from "@/components/hrms/dialog";
import { Calendar, Plus, Send, Check, X } from "lucide-react";
import { EmptyState } from "@/components/hrms/empty-state";
import { clsx } from "clsx";

interface Timesheet {
  id: string; periodType: string; periodStart: string; periodEnd: string;
  totalHours: string | number; billableHours: string | number; status: string;
  submittedAt: string | null; approvedAt: string | null; rejectionReason: string | null;
  _count: { logs: number };
}

export default function TimesheetsPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const dialog = useDialog();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ periodType: "Weekly", periodStart: "", periodEnd: "", notes: "" });

  const { data } = useQuery({
    queryKey: ["timesheets"],
    queryFn: () => api.get<Timesheet[]>("/api/v1/hrms/timesheets?limit=100"),
  });

  const createMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post("/api/v1/hrms/timesheets", body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["timesheets"] }); setShowCreate(false); },
  });

  const submitMut = useMutation({
    mutationFn: (id: string) => api.post(`/api/v1/hrms/timesheets/${id}/submit`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["timesheets"] }),
  });

  const approveMut = useMutation({
    mutationFn: ({ id, action, reason }: { id: string; action: "Approve" | "Reject"; reason?: string }) =>
      api.post(`/api/v1/hrms/timesheets/${id}/approve`, { action, rejectionReason: reason }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["timesheets"] }),
  });

  const sheets = data?.data ?? [];

  return (
    <div>
      <TimeRecordsTabs />
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Calendar className="text-[#3b82f6]" />
          <h1 className="font-serif-display text-3xl md:text-4xl font-bold text-gray-900">Timesheets</h1>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 btn btn-primary">
          <Plus size={16} /> New Timesheet
        </button>
      </div>

      {sheets.length === 0 ? (
        <div className="p-1"><EmptyState variant="bot" title="No Data Found" className="border border-gray-200 shadow-sm" /></div>
      ) : (
        <div className="space-y-3">
          {sheets.map((s, i) => (
            <div key={s.id} className="row-stagger bg-white rounded-lg shadow-sm border border-gray-200 p-4" style={{ ["--i" as never]: Math.min(i, 10) }}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-gray-900">
                      {new Date(s.periodStart).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} — {new Date(s.periodEnd).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    </h3>
                    <span className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded-full text-xs">{s.periodType}</span>
                    <span className={clsx("px-2 py-0.5 rounded-full text-xs font-medium",
                      s.status === "TsApproved" ? "bg-green-100 text-green-700" :
                      s.status === "TsRejected" ? "bg-red-100 text-red-700" :
                      s.status === "TsSubmitted" ? "bg-[#dbeafe] text-[#2563eb]" : "bg-gray-100 text-gray-600")}>
                      {s.status.replace("Ts", "")}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500">
                    {s._count.logs} logs • {Number(s.totalHours).toFixed(1)}h total • {Number(s.billableHours).toFixed(1)}h billable
                  </div>
                  {s.rejectionReason && <div className="text-xs text-red-600 mt-1">Rejected: {s.rejectionReason}</div>}
                </div>
                <div className="flex items-center gap-1">
                  {s.status === "TsDraft" && (
                    <button onClick={() => submitMut.mutate(s.id)} className="flex items-center gap-1 bg-[#16243A] text-white px-3 py-1.5 rounded-lg text-xs hover:bg-[#2563eb]">
                      <Send size={12} /> Submit
                    </button>
                  )}
                  {s.status === "TsSubmitted" && (
                    <>
                      <button onClick={() => approveMut.mutate({ id: s.id, action: "Approve" })} className="p-2 rounded border border-green-300 text-green-600 hover:bg-green-50"><Check size={14} /></button>
                      <button onClick={async () => {
                        const r = await dialog.promptText({
                          title: "Reject timesheet",
                          description: "Provide a reason for rejection. This will be shared with the submitter.",
                          placeholder: "Reason",
                          variant: "warning",
                          confirmLabel: "Reject",
                        });
                        if (r) approveMut.mutate({ id: s.id, action: "Reject", reason: r });
                      }} className="p-2 rounded border border-red-300 text-red-600 hover:bg-red-50"><X size={14} /></button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New Timesheet">
        <form onSubmit={(e) => { e.preventDefault(); createMut.mutate(form); }} className="space-y-4">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Period Type</label>
            <Select
              value={form.periodType}
              onChange={(v) => setForm({ ...form, periodType: v })}
              options={[
                { value: "Weekly", label: "Weekly" },
                { value: "BiWeekly", label: "BiWeekly" },
                { value: "Monthly", label: "Monthly" },
              ]}
            /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Period Start</label>
              <input type="date" required value={form.periodStart} onChange={(e) => setForm({ ...form, periodStart: e.target.value })}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Period End</label>
              <input type="date" required value={form.periodEnd} onChange={(e) => setForm({ ...form, periodEnd: e.target.value })}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" /></div>
          </div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" rows={2} /></div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 border border-[var(--border)] rounded-lg text-sm">Cancel</button>
            <button type="submit" className="px-4 py-2 bg-[#16243A] text-white rounded-lg text-sm font-medium hover:bg-[#2563eb]">Create</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
