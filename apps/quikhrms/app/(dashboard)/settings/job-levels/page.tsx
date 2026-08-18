"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { CrudTable, type Column } from "@/components/hrms/crud-table";
import { Modal } from "@/components/hrms/modal";
import { NumberInput } from "@/components/hrms/ui/number-input";
import { PageBackground } from "@/components/hrms/page-background";
import { useDashboardConfig } from "@/lib/hooks/use-dashboard-config";

interface JobLevel {
  id: string;
  code: string;
  name: string;
  slaDays: number;
  sortOrder: number;
  isActive: boolean;
  _count: { requisitions: number };
}

const emptyForm = { code: "", name: "", slaDays: 15 as number | null, sortOrder: 0 as number | null };

export default function JobLevelsPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const { hasPermission } = useDashboardConfig();
  const canManage = hasPermission("hrms.settings.write");
  const [modal, setModal] = useState<{ open: boolean; item: JobLevel | null }>({ open: false, item: null });
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["job-levels"],
    queryFn: () => api.get<JobLevel[]>("/api/v1/hrms/settings/job-levels?includeInactive=1"),
  });

  const createMut = useMutation({
    mutationFn: (body: typeof form) => api.post("/api/v1/hrms/settings/job-levels", body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["job-levels"] }); setModal({ open: false, item: null }); },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: typeof form }) =>
      api.patch(`/api/v1/hrms/settings/job-levels/${id}`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["job-levels"] }); setModal({ open: false, item: null }); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/hrms/settings/job-levels/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["job-levels"] }),
  });

  const columns: Column<JobLevel>[] = [
    { key: "code", label: "Code" },
    { key: "name", label: "Name" },
    { key: "slaDays", label: "Standard SLA", render: (l) => `${l.slaDays} days` },
    { key: "isActive", label: "Status", render: (l) => (
      <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${l.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
        {l.isActive ? "Active" : "Inactive"}
      </span>
    ) },
    { key: "_count", label: "Requisitions", render: (l) => l._count.requisitions },
  ];

  const openAdd = () => { setForm(emptyForm); setModal({ open: true, item: null }); };
  const openEdit = (item: JobLevel) => {
    setForm({ code: item.code, name: item.name, slaDays: item.slaDays, sortOrder: item.sortOrder });
    setModal({ open: true, item });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const body = { ...form, slaDays: form.slaDays ?? 0, sortOrder: form.sortOrder ?? 0 };
    if (modal.item) updateMut.mutate({ id: modal.item.id, body });
    else createMut.mutate(body);
  };

  const sorted = [...(data?.data ?? [])]
    .filter((l) => !search || l.name.toLowerCase().includes(search.toLowerCase()) || l.code.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.slaDays - b.slaDays);

  return (
    <>
      <PageBackground src="/images/pre-onboarding-bg.png" />
      <CrudTable
        title="Job Levels"
        data={sorted}
        columns={columns}
        isLoading={isLoading}
        onAdd={openAdd}
        onEdit={openEdit}
        onDelete={(id) => deleteMut.mutate(id)}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search job levels..."
        canManage={canManage}
      />

      <Modal open={modal.open} onClose={() => setModal({ open: false, item: null })} title={modal.item ? "Edit Job Level" : "Add Job Level"}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-xs text-gray-500">
            Drives the default hiring SLA for the Recruiter Performance Dashboard — e.g. &quot;L1&quot;, 8 days.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Code</label>
              <input type="text" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="e.g. L1, SP2" required
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#166534]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Standard SLA (days)</label>
              <NumberInput allowDecimal={false} value={form.slaDays} onChange={(v) => setForm({ ...form, slaDays: v })}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-xs" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Entry / Junior" required
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#166534]" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Display Order</label>
            <NumberInput allowDecimal={false} value={form.sortOrder} onChange={(v) => setForm({ ...form, sortOrder: v })}
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-xs" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setModal({ open: false, item: null })}
              className="px-3 py-1.5 border border-[var(--border)] rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={createMut.isPending || updateMut.isPending}
              className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 disabled:opacity-50">
              {modal.item ? "Update" : "Create"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
