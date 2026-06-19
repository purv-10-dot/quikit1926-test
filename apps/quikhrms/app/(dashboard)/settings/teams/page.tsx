"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { CrudTable, type Column } from "@/components/hrms/crud-table";
import { Modal } from "@/components/hrms/modal";
import { Select } from "@/components/hrms/ui/select";

interface TeamItem {
  id: string;
  name: string;
  description: string | null;
  department: { id: string; name: string } | null;
  lead: { id: string; firstName: string; lastName: string } | null;
  _count: { employees: number };
}

export default function TeamsPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<{ open: boolean; item: TeamItem | null }>({ open: false, item: null });
  const [form, setForm] = useState({ name: "", departmentId: "", description: "" });

  const { data, isLoading } = useQuery({
    queryKey: ["teams", search],
    queryFn: () => api.get<TeamItem[]>(`/api/v1/hrms/teams?limit=100${search ? `&search=${search}` : ""}`),
  });

  const { data: deptsData } = useQuery({
    queryKey: ["departments-list"],
    queryFn: () => api.get<{ id: string; name: string }[]>("/api/v1/hrms/departments?limit=100"),
  });

  const createMut = useMutation({
    mutationFn: (body: typeof form) => api.post("/api/v1/hrms/teams", body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["teams"] }); setModal({ open: false, item: null }); },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: typeof form }) => api.patch(`/api/v1/hrms/teams/${id}`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["teams"] }); setModal({ open: false, item: null }); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/hrms/teams/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["teams"] }),
  });

  const columns: Column<TeamItem>[] = [
    { key: "name", label: "Name" },
    { key: "department", label: "Department", render: (t) => t.department?.name ?? "—" },
    { key: "lead", label: "Lead", render: (t) => t.lead ? `${t.lead.firstName} ${t.lead.lastName}` : "—" },
    { key: "_count", label: "Members", render: (t) => t._count.employees },
  ];

  const openAdd = () => { setForm({ name: "", departmentId: "", description: "" }); setModal({ open: true, item: null }); };
  const openEdit = (item: TeamItem) => { setForm({ name: item.name, departmentId: item.department?.id ?? "", description: item.description ?? "" }); setModal({ open: true, item }); };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    modal.item ? updateMut.mutate({ id: modal.item.id, body: form }) : createMut.mutate(form);
  };

  return (
    <>
      <CrudTable title="Teams" data={data?.data ?? []} columns={columns} isLoading={isLoading}
        onAdd={openAdd} onEdit={openEdit} onDelete={(id) => deleteMut.mutate(id)}
        search={search} onSearchChange={setSearch} searchPlaceholder="Search teams..." />

      <Modal open={modal.open} onClose={() => setModal({ open: false, item: null })} title={modal.item ? "Edit Team" : "Add Team"}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#16243A]" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
            <Select
              value={form.departmentId}
              onChange={(v) => setForm({ ...form, departmentId: v })}
              required
              placeholder="Select department"
              searchable
              options={(deptsData?.data ?? []).map((d) => ({ value: d.id, label: d.name }))}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3}
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#16243A]" />
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
