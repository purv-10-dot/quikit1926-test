"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { CrudTable, type Column } from "@/components/hrms/crud-table";
import { PageBackground } from "@/components/hrms/page-background";
import { Modal } from "@/components/hrms/modal";
import { FormActions, FormField, FormInput } from "@/components/hrms/form";
import { NumberInput } from "@/components/hrms/ui/number-input";

interface ShiftItem {
  id: string;
  name: string;
  code: string;
  color: string | null;
  startTime: string;
  endTime: string;
  breakDuration: number;
  graceMinutes: number;
  isFlexible: boolean;
  isNightShift: boolean;
  isDefault: boolean;
  _count: { assignments: number };
}

export default function ShiftsPage() {
  const api = useApiClient();
  const router = useRouter();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<{ open: boolean; item: ShiftItem | null }>({ open: false, item: null });
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState<{
    name: string; code: string; color: string; startTime: string; endTime: string;
    breakDuration: number | null; graceMinutes: number | null; isFlexible: boolean; isNightShift: boolean;
    effectiveFrom: string; isDefault: boolean;
  }>({
    name: "", code: "", color: "#22c55e", startTime: "09:00", endTime: "18:00",
    breakDuration: null, graceMinutes: null, isFlexible: false, isNightShift: false,
    effectiveFrom: new Date().toISOString().split("T")[0], isDefault: false,
  });

  const { data, isLoading } = useQuery({
    queryKey: ["shifts"],
    queryFn: () => api.get<ShiftItem[]>("/api/v1/hrms/shifts?limit=100"),
  });

  const createMut = useMutation({
    mutationFn: (body: typeof form) => api.post("/api/v1/hrms/shifts", body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["shifts"] }); setModal({ open: false, item: null }); },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: typeof form }) => api.patch(`/api/v1/hrms/shifts/${id}`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["shifts"] }); setModal({ open: false, item: null }); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/hrms/shifts/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shifts"] }),
  });

  const columns: Column<ShiftItem>[] = [
    { key: "name", label: "Name", render: (s) => (
      <div className="flex items-center gap-2">
        {s.color && <div className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color }} />}
        <span>{s.name}</span>
      </div>
    )},
    { key: "code", label: "Code" },
    { key: "startTime", label: "Start" },
    { key: "endTime", label: "End" },
    { key: "breakDuration", label: "Break", render: (s) => `${s.breakDuration}m` },
    { key: "_count", label: "Assigned", render: (s) => s._count.assignments },
  ];

  const openAdd = () => {
    setFormError(null);
    setForm({ name: "", code: "", color: "#22c55e", startTime: "09:00", endTime: "18:00", breakDuration: null, graceMinutes: null, isFlexible: false, isNightShift: false, effectiveFrom: new Date().toISOString().split("T")[0], isDefault: false });
    setModal({ open: true, item: null });
  };

  const openEdit = (item: ShiftItem) => {
    setFormError(null);
    setForm({ name: item.name, code: item.code, color: item.color ?? "#22c55e", startTime: item.startTime, endTime: item.endTime, breakDuration: item.breakDuration, graceMinutes: item.graceMinutes, isFlexible: item.isFlexible, isNightShift: item.isNightShift, effectiveFrom: new Date().toISOString().split("T")[0], isDefault: item.isDefault });
    setModal({ open: true, item });
  };

  const filtered = (data?.data ?? []).filter((s) => !search || s.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      {/* Subtle HR-themed page background (scoped to this page only). */}
      <PageBackground src="/images/pre-onboarding-bg.png" />
      <button
        type="button"
        onClick={() => {
          if (typeof window !== "undefined" && window.history.length > 1) router.back();
          else router.push("/duty-roster");
        }}
        aria-label="Go back"
        className="mb-4 inline-flex items-center gap-1.5 px-3 py-1.5 text-[14px] font-semibold text-green-700 bg-green-600/10 hover:bg-green-600 hover:text-white rounded-full transition-colors"
      >
        <ArrowLeft size={14} /> Back
      </button>
      <CrudTable title="Shift Policies" data={filtered} columns={columns} isLoading={isLoading}
        onAdd={openAdd} onEdit={openEdit} onDelete={(id) => deleteMut.mutate(id)}
        search={search} onSearchChange={setSearch} searchPlaceholder="Search shifts..." />

      <Modal open={modal.open} onClose={() => setModal({ open: false, item: null })} title={modal.item ? "Edit Shift" : "Add Shift"}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setFormError(null);
            const [sh, sm] = form.startTime.split(":").map(Number);
            const [eh, em] = form.endTime.split(":").map(Number);
            const sMin = sh * 60 + sm;
            let eMin = eh * 60 + em;
            // Auto-detect overnight shift: if end is at/before start, it rolls past midnight.
            const isNightShift = eMin <= sMin;
            if (isNightShift) eMin += 24 * 60;
            if (form.startTime === form.endTime) {
              setFormError("Start time and end time cannot be the same.");
              return;
            }
            if (eMin - sMin < 240) {
              setFormError("Shift must be at least 4 hours long.");
              return;
            }
            const body = { ...form, isNightShift };
            modal.item ? updateMut.mutate({ id: modal.item.id, body }) : createMut.mutate(body);
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Name" required>
              <FormInput type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </FormField>
            <FormField label="Code" required>
              <FormInput type="text" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Start Time" required>
              <FormInput type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} required />
            </FormField>
            <FormField label="End Time" required>
              <FormInput type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} required />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <FormField label="Break (min)">
              <NumberInput allowDecimal={false} value={form.breakDuration} onChange={(v) => setForm({ ...form, breakDuration: v })} className="w-full border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#166534] focus:border-[#166534]" />
            </FormField>
            <FormField label="Grace (min)">
              <NumberInput allowDecimal={false} value={form.graceMinutes} onChange={(v) => setForm({ ...form, graceMinutes: v })} className="w-full border border-[var(--border)] rounded-lg px-3 py-1.5 text-xs bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-[#166534] focus:border-[#166534]" />
            </FormField>
          </div>
          {formError && <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded px-3 py-2">{formError}</div>}
          <FormActions>
            <button type="button" onClick={() => setModal({ open: false, item: null })} className="btn btn-ghost">Cancel</button>
            <button type="submit" className="btn btn-primary">{modal.item ? "Update" : "Create"}</button>
          </FormActions>
        </form>
      </Modal>
    </>
  );
}
