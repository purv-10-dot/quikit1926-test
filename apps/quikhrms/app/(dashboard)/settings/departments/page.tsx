"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { CrudTable, type Column } from "@/components/hrms/crud-table";
import { Modal } from "@/components/hrms/modal";
import { Select } from "@/components/hrms/ui/select";
import { PageBackground } from "@/components/hrms/page-background";

interface Dept {
  id: string;
  name: string;
  code: string;
  status: string;
  description: string | null;
  head: { id: string; firstName: string; lastName: string } | null;
  parentDepartment: { id: string; name: string } | null;
  _count: { employees: number; teams: number };
}

export default function DepartmentsPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;
  const [modal, setModal] = useState<{ open: boolean; item: Dept | null }>({
    open: false,
    item: null,
  });
  const [form, setForm] = useState({ name: "", code: "", description: "", status: "Active" });

  const { data, isLoading } = useQuery({
    queryKey: ["departments", search],
    queryFn: () =>
      api.get<Dept[]>(`/api/v1/hrms/departments?limit=100${search ? `&search=${search}` : ""}`),
  });

  const createMutation = useMutation({
    mutationFn: (body: typeof form) => api.post("/api/v1/hrms/departments", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["departments"] });
      setModal({ open: false, item: null });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: typeof form }) =>
      api.patch(`/api/v1/hrms/departments/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["departments"] });
      setModal({ open: false, item: null });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/hrms/departments/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["departments"] }),
  });

  const columns: Column<Dept>[] = [
    { key: "name", label: "Name" },
    { key: "code", label: "Code" },
    { key: "status", label: "Status", render: (d) => (
      <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${d.status === "Active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
        {d.status}
      </span>
    )},
    { key: "head", label: "Head", render: (d) => d.head ? `${d.head.firstName} ${d.head.lastName}` : "—" },
    { key: "_count", label: "Employees", render: (d) => d._count.employees },
  ];

  const openAdd = () => {
    setForm({ name: "", code: "", description: "", status: "Active" });
    setModal({ open: true, item: null });
  };

  const openEdit = (item: Dept) => {
    setForm({ name: item.name, code: item.code, description: item.description ?? "", status: item.status });
    setModal({ open: true, item });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (modal.item) {
      updateMutation.mutate({ id: modal.item.id, body: form });
    } else {
      createMutation.mutate(form);
    }
  };

  return (
    <>
      {/* Subtle HR-themed page background (scoped to this page only). */}
      <PageBackground src="/images/pre-onboarding-bg.png" />
      <CrudTable
        title="Departments"
        data={(data?.data ?? []).slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)}
        columns={columns}
        isLoading={isLoading}
        onAdd={openAdd}
        onEdit={openEdit}
        onDelete={(id) => deleteMutation.mutate(id)}
        search={search}
        onSearchChange={(v) => { setSearch(v); setPage(1); }}
        searchPlaceholder="Search departments..."
        pagination={{ page, totalPages: Math.max(1, Math.ceil((data?.data ?? []).length / PAGE_SIZE)), total: (data?.data ?? []).length, limit: PAGE_SIZE, onPageChange: setPage }}
      />

      <Modal
        open={modal.open}
        onClose={() => setModal({ open: false, item: null })}
        title={modal.item ? "Edit Department" : "Add Department"}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#166534]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Code</label>
            <input
              type="text"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              required
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#166534]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#166534]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <Select
              value={form.status}
              onChange={(v) => setForm({ ...form, status: v })}
              options={[
                { value: "Active", label: "Active" },
                { value: "Inactive", label: "Inactive" },
              ]}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setModal({ open: false, item: null })}
              className="px-3 py-1.5 border border-[var(--border)] rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700"
            >
              {modal.item ? "Update" : "Create"}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
