"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { CrudTable, type Column } from "@/components/hrms/crud-table";
import { Modal } from "@/components/hrms/modal";
import { NumberInput } from "@/components/hrms/ui/number-input";
import { Select } from "@/components/hrms/ui/select";
import { PageBackground } from "@/components/hrms/page-background";
import { useDashboardConfig } from "@/lib/hooks/use-dashboard-config";

interface Desig {
  id: string;
  title: string;
  level: number;
  departmentId: string | null;
  department: { id: string; name: string } | null;
  _count: { employees: number };
}

interface DeptOption {
  id: string;
  name: string;
}

interface FormState {
  title: string;
  level: number;
  departmentId: string;
}

const emptyForm: FormState = { title: "", level: 0, departmentId: "" };

export default function DesignationsPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const { hasPermission } = useDashboardConfig();
  const canManage = hasPermission("hrms.org.write");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;
  const [modal, setModal] = useState<{ open: boolean; item: Desig | null }>({ open: false, item: null });
  const [form, setForm] = useState<FormState>(emptyForm);

  const { data, isLoading } = useQuery({
    queryKey: ["designations", search],
    queryFn: () => api.get<Desig[]>(`/api/v1/hrms/designations?limit=100${search ? `&search=${search}` : ""}`),
  });

  const { data: deptsData } = useQuery({
    queryKey: ["departments", "all"],
    queryFn: () => api.get<DeptOption[]>("/api/v1/hrms/departments?limit=100"),
  });
  const departments = deptsData?.data ?? [];

  const buildBody = (f: FormState) => ({
    title: f.title,
    level: f.level,
    ...(f.departmentId ? { departmentId: f.departmentId } : { departmentId: undefined }),
  });

  const createMut = useMutation({
    mutationFn: (body: ReturnType<typeof buildBody>) => api.post("/api/v1/hrms/designations", body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["designations"] }); setModal({ open: false, item: null }); },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: ReturnType<typeof buildBody> }) =>
      api.patch(`/api/v1/hrms/designations/${id}`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["designations"] }); setModal({ open: false, item: null }); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/hrms/designations/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["designations"] }),
  });

  const columns: Column<Desig>[] = [
    { key: "title", label: "Title" },
    { key: "level", label: "Level" },
    { key: "department", label: "Department", render: (d) => d.department?.name ?? "All" },
    { key: "_count", label: "Employees", render: (d) => d._count.employees },
  ];

  const openAdd = () => { setForm(emptyForm); setModal({ open: true, item: null }); };
  const openEdit = (item: Desig) => {
    setForm({
      title: item.title,
      level: item.level,
      departmentId: item.departmentId ?? item.department?.id ?? "",
    });
    setModal({ open: true, item });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const body = buildBody(form);
    modal.item ? updateMut.mutate({ id: modal.item.id, body }) : createMut.mutate(body);
  };

  return (
    <>
      {/* Subtle HR-themed page background (scoped to this page only). */}
      <PageBackground src="/images/pre-onboarding-bg.png" />
      <CrudTable title="Designations" data={(data?.data ?? []).slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)} columns={columns} isLoading={isLoading}
        onAdd={openAdd} onEdit={openEdit} onDelete={(id) => deleteMut.mutate(id)}
        search={search} onSearchChange={(v) => { setSearch(v); setPage(1); }} searchPlaceholder="Search designations..."
        pagination={{ page, totalPages: Math.max(1, Math.ceil((data?.data ?? []).length / PAGE_SIZE)), total: (data?.data ?? []).length, limit: PAGE_SIZE, onPageChange: setPage }}
        canManage={canManage} />

      <Modal open={modal.open} onClose={() => setModal({ open: false, item: null })} title={modal.item ? "Edit Designation" : "Add Designation"}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input type="text" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#166534]" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
            <Select
              value={form.departmentId}
              onChange={(v) => setForm({ ...form, departmentId: v })}
              options={[
                { value: "", label: "All Departments" },
                ...departments.map((d) => ({ value: d.id, label: d.name })),
              ]}
            />
            <p className="text-xs text-gray-500 mt-1">Leave as &quot;All Departments&quot; to make this designation available org-wide.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Seniority Level <span className="text-gray-400 font-normal">(0 = lowest, 10 = highest)</span>
            </label>
            <NumberInput
              allowDecimal={false}
              min={0}
              max={10}
              value={form.level}
              onChange={(v) => setForm({ ...form, level: v ?? 0 })}
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#166534]"
            />
            <div className="mt-2 p-2 bg-gray-50 border border-gray-200 rounded text-xs text-gray-600 space-y-0.5">
              <div className="font-medium text-gray-700 mb-1">Typical levels:</div>
              <div><span className="font-mono font-semibold">1-2</span> — Intern, Trainee, Junior</div>
              <div><span className="font-mono font-semibold">3-4</span> — Mid-level, Associate</div>
              <div><span className="font-mono font-semibold">5-6</span> — Senior, Lead</div>
              <div><span className="font-mono font-semibold">7-8</span> — Manager, Principal</div>
              <div><span className="font-mono font-semibold">9-10</span> — Director, VP, C-Suite</div>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Used for: org chart sorting, salary band lookup, approval routing (e.g. only Level ≥4 can approve large expenses).
            </p>
          </div>
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
