"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { Modal } from "@/components/hrms/modal";
import { useDialog } from "@/components/hrms/dialog";
import { UserCheck, Plus, Trash2, Pause, Play } from "lucide-react";
import { EmptyState } from "@/components/hrms/empty-state";
import { EmployeeSelect } from "@/components/hrms/employees/employee-select";
import { Select } from "@/components/hrms/ui/select";
import { clsx } from "clsx";

interface Delegation {
  id: string; delegatorId: string; delegateeId: string; type: string;
  modules: string[]; fromDate: string; toDate: string | null;
  notifyMode: string; description: string | null; isActive: boolean;
}

const MODULES = ["Leave", "Expense", "Timesheet", "Attendance", "Recruitment"] as const;

export default function DelegationsPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const dialog = useDialog();
  const [tab, setTab] = useState<"self" | "received">("self");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    delegateeId: "", type: "DelegationTemporary", fromDate: "", toDate: "",
    notifyMode: "NotifyBoth", description: "", modules: ["Leave"] as string[],
  });

  const { data } = useQuery({
    queryKey: ["delegations", tab],
    queryFn: () => api.get<Delegation[]>(`/api/v1/hrms/delegations?scope=${tab}&limit=100`),
  });

  const { data: subData } = useQuery({
    queryKey: ["employees", "me", "subordinates"],
    queryFn: () => api.get<{ employeeId: string | null; subordinateIds: string[] }>("/api/v1/hrms/employees/me/subordinates"),
    staleTime: 60_000,
  });
  const excludeIds = useMemo(() => {
    const out: string[] = [];
    if (subData?.data?.employeeId) out.push(subData.data.employeeId);
    if (subData?.data?.subordinateIds) out.push(...subData.data.subordinateIds);
    return out;
  }, [subData]);

  const createMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post("/api/v1/hrms/delegations", body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["delegations"] }); setShowAdd(false); },
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => api.put(`/api/v1/hrms/delegations/${id}`, { isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["delegations"] }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/hrms/delegations/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["delegations"] }),
  });

  const toggleModule = (m: string) => {
    setForm({ ...form, modules: form.modules.includes(m) ? form.modules.filter((x) => x !== m) : [...form.modules, m] });
  };

  const items = data?.data ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <UserCheck className="text-[#3b82f6]" />
          <h1 className="font-serif-display text-3xl md:text-4xl font-bold text-gray-900">Delegations</h1>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 btn btn-primary">
          <Plus size={16} /> New Delegation
        </button>
      </div>

      <div className="flex items-center gap-2 mb-4">
        {(["self", "received"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={clsx("px-4 py-2 rounded-lg text-sm font-medium", tab === t ? "bg-[#16243A] text-white" : "bg-white border border-[var(--border)] text-gray-700")}>
            {t === "self" ? "My Delegations" : "Delegated to Me"}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <div className="p-1"><EmptyState variant="bot" title="No Data Found" className="border border-gray-200 shadow-sm" /></div>
      ) : (
        <div className="space-y-3">
          {items.map((d, i) => (
            <div key={d.id} className={clsx("row-stagger bg-white rounded-lg shadow-sm border border-gray-200 p-4", !d.isActive && "opacity-60")} style={{ ["--i" as never]: Math.min(i, 10) }}>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-gray-600">{d.delegatorId}</span>
                    <span className="text-gray-400">→</span>
                    <span className="font-mono text-xs text-gray-600">{d.delegateeId}</span>
                    <span className="px-2 py-0.5 bg-[#dbeafe] text-[#2563eb] rounded-full text-xs">{d.type.replace("Delegation", "")}</span>
                    <span className={clsx("px-2 py-0.5 rounded-full text-xs font-medium", d.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500")}>
                      {d.isActive ? "Active" : "Inactive"}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {new Date(d.fromDate).toLocaleDateString("en-IN")} → {d.toDate ? new Date(d.toDate).toLocaleDateString("en-IN") : "∞"}
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {d.modules.map((m) => <span key={m} className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs">{m}</span>)}
                  </div>
                  {d.description && <div className="text-xs text-gray-600 mt-2">{d.description}</div>}
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => toggleMut.mutate({ id: d.id, isActive: !d.isActive })}
                    className="p-1.5 text-gray-600 hover:bg-gray-100 rounded">
                    {d.isActive ? <Pause size={14} /> : <Play size={14} />}
                  </button>
                  <button onClick={async () => {
                    const ok = await dialog.confirm({
                      title: "Delete delegation?",
                      description: "This delegation will be permanently removed.",
                      variant: "danger",
                      confirmLabel: "Delete",
                    });
                    if (ok) deleteMut.mutate(d.id);
                  }} className="p-1.5 text-red-500 hover:bg-red-50 rounded"><Trash2 size={14} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="New Delegation">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const today = new Date(); today.setHours(0, 0, 0, 0);
            if (form.fromDate && new Date(form.fromDate) < today) {
              alert("From date cannot be in the past.");
              return;
            }
            if (form.toDate && new Date(form.toDate) <= new Date(form.fromDate)) {
              alert("To date must be after From date.");
              return;
            }
            createMut.mutate({ ...form, toDate: form.toDate || undefined });
          }}
          className="space-y-4"
        >
          <EmployeeSelect
            label="Delegatee"
            required
            value={form.delegateeId}
            onChange={(id) => setForm({ ...form, delegateeId: id })}
            excludeIds={excludeIds}
          />
          <p className="-mt-2 text-[11px] text-gray-500">
            You can&apos;t delegate to yourself or to your direct/indirect reports.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <Select
                value={form.type}
                onChange={(v) => setForm({ ...form, type: v })}
                options={[
                  { value: "DelegationTemporary", label: "Temporary" },
                  { value: "DelegationPermanent", label: "Permanent" },
                ]}
              /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Notify</label>
              <Select
                value={form.notifyMode}
                onChange={(v) => setForm({ ...form, notifyMode: v })}
                options={[
                  { value: "NotifyBoth", label: "Both" },
                  { value: "NotifyDelegatee", label: "Delegatee only" },
                ]}
              /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">From</label>
              <input
                type="date"
                required
                min={new Date().toISOString().slice(0, 10)}
                value={form.fromDate}
                onChange={(e) => setForm({ ...form, fromDate: e.target.value })}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
              /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">To (optional)</label>
              <input
                type="date"
                min={form.fromDate || new Date().toISOString().slice(0, 10)}
                value={form.toDate}
                onChange={(e) => setForm({ ...form, toDate: e.target.value })}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm"
              /></div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Modules</label>
            <div className="flex flex-wrap gap-2">
              {MODULES.map((m) => (
                <button key={m} type="button" onClick={() => toggleModule(m)}
                  className={clsx("px-3 py-1 rounded-lg border text-xs",
                    form.modules.includes(m) ? "bg-[#16243A] text-white border-[#3b82f6]" : "bg-white text-gray-700 border-gray-300")}>
                  {m}
                </button>
              ))}
            </div>
          </div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" rows={2} /></div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-2 border border-[var(--border)] rounded-lg text-sm">Cancel</button>
            <button type="submit" disabled={createMut.isPending} className="px-4 py-2 bg-[#16243A] text-white rounded-lg text-sm font-medium hover:bg-[#2563eb] disabled:opacity-50">Save</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
