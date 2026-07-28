"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { CrudTable, type Column } from "@/components/hrms/crud-table";
import { Modal } from "@/components/hrms/modal";
import { NumberInput } from "@/components/hrms/ui/number-input";
import { Select } from "@/components/hrms/ui/select";

type Unit = "Days" | "Weeks" | "Months";

interface NoticePeriod {
  id: string;
  name: string;
  description: string | null;
  duration: number;
  unit: Unit;
  _count: { offboardingInstances: number };
}

interface FormState {
  name: string;
  description: string;
  duration: number;
  unit: Unit;
}

const emptyForm: FormState = { name: "", description: "", duration: 0, unit: "Days" };

const UNIT_OPTIONS = [
  { value: "Days", label: "Days" },
  { value: "Weeks", label: "Weeks" },
  { value: "Months", label: "Months" },
];

export function NoticePeriodTab() {
  const api = useApiClient();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;
  const [modal, setModal] = useState<{ open: boolean; item: NoticePeriod | null }>({ open: false, item: null });
  const [form, setForm] = useState<FormState>(emptyForm);

  const { data, isLoading } = useQuery({
    queryKey: ["notice-periods", search],
    queryFn: () => api.get<NoticePeriod[]>(`/api/v1/hrms/offboarding/notice-periods?limit=100${search ? `&search=${search}` : ""}`),
  });

  const buildBody = (f: FormState) => ({
    name: f.name,
    description: f.description || undefined,
    duration: f.duration,
    unit: f.unit,
  });

  const createMut = useMutation({
    mutationFn: (body: ReturnType<typeof buildBody>) => api.post("/api/v1/hrms/offboarding/notice-periods", body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["notice-periods"] }); setModal({ open: false, item: null }); },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: ReturnType<typeof buildBody> }) =>
      api.patch(`/api/v1/hrms/offboarding/notice-periods/${id}`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["notice-periods"] }); setModal({ open: false, item: null }); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/hrms/offboarding/notice-periods/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notice-periods"] }),
  });

  const columns: Column<NoticePeriod>[] = [
    { key: "name", label: "Name" },
    { key: "description", label: "Description", render: (n) => n.description || "—" },
    { key: "duration", label: "Duration", render: (n) => `${n.duration} ${n.unit}` },
    { key: "_count", label: "Employee Count", render: (n) => n._count.offboardingInstances },
  ];

  const openAdd = () => { setForm(emptyForm); setModal({ open: true, item: null }); };
  const openEdit = (item: NoticePeriod) => {
    setForm({ name: item.name, description: item.description ?? "", duration: item.duration, unit: item.unit });
    setModal({ open: true, item });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const body = buildBody(form);
    modal.item ? updateMut.mutate({ id: modal.item.id, body }) : createMut.mutate(body);
  };

  return (
    <>
      <CrudTable title="Notice Period" data={(data?.data ?? []).slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)} columns={columns} isLoading={isLoading}
        onAdd={openAdd} onEdit={openEdit} onDelete={(id) => deleteMut.mutate(id)}
        search={search} onSearchChange={(v) => { setSearch(v); setPage(1); }} searchPlaceholder="Search notice periods..."
        pagination={{ page, totalPages: Math.max(1, Math.ceil((data?.data ?? []).length / PAGE_SIZE)), total: (data?.data ?? []).length, limit: PAGE_SIZE, onPageChange: setPage }} />

      <Modal open={modal.open} onClose={() => setModal({ open: false, item: null })} title={modal.item ? "Edit Notice Period" : "Add Notice Period"}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required
              placeholder="e.g. 90 Days"
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#166534]" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2}
              placeholder="e.g. Employee needs to serve 90 days notice period"
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#166534]" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Duration</label>
              <NumberInput
                allowDecimal={false}
                min={0}
                value={form.duration}
                onChange={(v) => setForm({ ...form, duration: v ?? 0 })}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#166534]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
              <Select
                value={form.unit}
                onChange={(v) => setForm({ ...form, unit: v as Unit })}
                options={UNIT_OPTIONS}
              />
            </div>
          </div>
          <p className="text-xs text-gray-500">
            Last working date is auto-calculated when offboarding is initiated: resignation date + this duration.
          </p>
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
