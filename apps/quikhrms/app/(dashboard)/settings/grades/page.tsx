"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { CrudTable, type Column } from "@/components/hrms/crud-table";
import { Modal } from "@/components/hrms/modal";
import { NumberInput } from "@/components/hrms/ui/number-input";

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
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<{ open: boolean; item: GradeItem | null }>({ open: false, item: null });
  const [form, setForm] = useState({ name: "", level: 0, minSalary: 0, maxSalary: 0 });

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

  const openAdd = () => { setForm({ name: "", level: 0, minSalary: 0, maxSalary: 0 }); setModal({ open: true, item: null }); };
  const openEdit = (item: GradeItem) => { setForm({ name: item.name, level: item.level, minSalary: Number(item.minSalary ?? 0), maxSalary: Number(item.maxSalary ?? 0) }); setModal({ open: true, item }); };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    modal.item ? updateMut.mutate({ id: modal.item.id, body: form }) : createMut.mutate(form);
  };

  const filtered = (data?.data ?? []).filter((g) => !search || g.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      <CrudTable title="Grades / Bands" data={filtered} columns={columns} isLoading={isLoading}
        onAdd={openAdd} onEdit={openEdit} onDelete={(id) => deleteMut.mutate(id)}
        search={search} onSearchChange={setSearch} searchPlaceholder="Search grades..." />

      <Modal open={modal.open} onClose={() => setModal({ open: false, item: null })} title={modal.item ? "Edit Grade" : "Add Grade"}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#16243A]" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Level</label>
            <NumberInput allowDecimal={false} value={form.level} onChange={(v) => setForm({ ...form, level: v ?? 0 })}
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#16243A]" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Min Salary</label>
              <NumberInput value={form.minSalary} onChange={(v) => setForm({ ...form, minSalary: v ?? 0 })}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#16243A]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max Salary</label>
              <NumberInput value={form.maxSalary} onChange={(v) => setForm({ ...form, maxSalary: v ?? 0 })}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#16243A]" />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setModal({ open: false, item: null })}
              className="px-4 py-2 border border-[var(--border)] rounded-lg text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="submit"
              className="px-4 py-2 bg-[#16243A] text-white rounded-lg text-sm font-medium hover:bg-[#2563eb]">
              {modal.item ? "Update" : "Create"}</button>
          </div>
        </form>
      </Modal>
    </>
  );
}
