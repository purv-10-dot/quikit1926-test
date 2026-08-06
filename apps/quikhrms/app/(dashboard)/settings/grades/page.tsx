"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { CrudTable, type Column } from "@/components/hrms/crud-table";
import { Modal } from "@/components/hrms/modal";
import { NumberInput } from "@/components/hrms/ui/number-input";
import { PageBackground } from "@/components/hrms/page-background";
import { useDashboardConfig } from "@/lib/hooks/use-dashboard-config";

interface GradeItem {
  id: string;
  name: string;
  level: number;
  minSalary: string | null;
  maxSalary: string | null;
  _count: { employees: number };
}

export default function GradesPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const { hasPermission } = useDashboardConfig();
  const canManage = hasPermission("hrms.org.write");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;
  const [modal, setModal] = useState<{ open: boolean; item: GradeItem | null }>({ open: false, item: null });
  const [form, setForm] = useState({ name: "", level: 0, minSalary: 0, maxSalary: 0 });
  const [formErr, setFormErr] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["grades"],
    queryFn: () => api.get<GradeItem[]>("/api/v1/hrms/grades?limit=100"),
  });

  const createMut = useMutation({
    mutationFn: (body: typeof form) => api.post("/api/v1/hrms/grades", body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["grades"] }); setModal({ open: false, item: null }); },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: typeof form }) => api.patch(`/api/v1/hrms/grades/${id}`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["grades"] }); setModal({ open: false, item: null }); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/hrms/grades/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["grades"] }),
  });

  const columns: Column<GradeItem>[] = [
    { key: "name", label: "Name" },
    { key: "level", label: "Level" },
    { key: "minSalary", label: "Min Salary", render: (g) => g.minSalary ? `₹${Number(g.minSalary).toLocaleString()}` : "—" },
    { key: "maxSalary", label: "Max Salary", render: (g) => g.maxSalary ? `₹${Number(g.maxSalary).toLocaleString()}` : "—" },
    { key: "_count", label: "Employees", render: (g) => g._count.employees },
  ];

  const openAdd = () => { setForm({ name: "", level: 0, minSalary: 0, maxSalary: 0 }); setFormErr(null); setModal({ open: true, item: null }); };
  const openEdit = (item: GradeItem) => { setForm({ name: item.name, level: item.level, minSalary: Number(item.minSalary ?? 0), maxSalary: Number(item.maxSalary ?? 0) }); setFormErr(null); setModal({ open: true, item }); };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return setFormErr("Name is required");
    if (form.minSalary > 0 && form.maxSalary > 0 && form.minSalary > form.maxSalary) {
      return setFormErr("Min salary can’t be greater than max salary");
    }
    setFormErr(null);
    modal.item ? updateMut.mutate({ id: modal.item.id, body: form }) : createMut.mutate(form);
  };

  const filtered = (data?.data ?? []).filter((g) => !search || g.name.toLowerCase().includes(search.toLowerCase()));
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <>
      {/* Subtle HR-themed page background (scoped to this page only). */}
      <PageBackground src="/images/pre-onboarding-bg.png" />
      <CrudTable title="Grades / Bands" data={pageItems} columns={columns} isLoading={isLoading}
        onAdd={openAdd} onEdit={openEdit} onDelete={(id) => deleteMut.mutate(id)}
        search={search} onSearchChange={(v) => { setSearch(v); setPage(1); }} searchPlaceholder="Search grades..."
        pagination={{ page, totalPages, total: filtered.length, limit: PAGE_SIZE, onPageChange: setPage }}
        canManage={canManage} />

      <Modal open={modal.open} onClose={() => setModal({ open: false, item: null })} title={modal.item ? "Edit Grade" : "Add Grade"}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#166534]" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Level</label>
            <NumberInput allowDecimal={false} value={form.level} onChange={(v) => setForm({ ...form, level: v ?? 0 })}
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#166534]" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Min Salary</label>
              <NumberInput value={form.minSalary} onChange={(v) => setForm({ ...form, minSalary: v ?? 0 })}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#166534]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max Salary</label>
              <NumberInput value={form.maxSalary} onChange={(v) => setForm({ ...form, maxSalary: v ?? 0 })}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#166534]" />
            </div>
          </div>
          {formErr && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded px-3 py-2">{formErr}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setModal({ open: false, item: null })}
              className="px-3 py-1.5 border border-[var(--border)] rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="submit"
              className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700">
              {modal.item ? "Update" : "Create"}</button>
          </div>
        </form>
      </Modal>
    </>
  );
}
