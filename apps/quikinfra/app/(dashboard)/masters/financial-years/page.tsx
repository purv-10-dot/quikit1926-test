"use client";

import { toErrorMessage } from "@/lib/api/errors";
import { useState } from "react";
import { CalendarCheck } from "lucide-react";
import { MasterListPage, type MasterColumnDef } from "@/components/MasterListPage";
import { useFinancialYears, useCreateFinancialYear, useUpdateFinancialYear, useDeleteFinancialYear } from "@/hooks/use-masters";
import { FormDrawer, FormSection, FormRow, Field, TextInput, DateInput, CheckboxInput, SelectInput, InactiveStatusNotice } from "@/components/FormDrawer";
import dynamic from "next/dynamic";
import type { ImportFieldDef } from "@/components/ImportDataDrawer";
const ImportDataDrawer = dynamic(
  () => import("@/components/ImportDataDrawer").then((m) => m.ImportDataDrawer),
  { ssr: false },
);
import {
  validateForm, type ValidationRules,
  validateFYCode, validateDateISO, validateDateRange,
} from "@/lib/validators";

const IMPORT_FIELDS: ImportFieldDef[] = [
  { key: "label", label: "Label", required: true, hint: "e.g. FY 2025-26" },
  { key: "startDate", label: "Start Date", required: true, hint: "YYYY-MM-DD" },
  { key: "endDate", label: "End Date", required: true, hint: "YYYY-MM-DD" },
  { key: "isCurrent", label: "Is Current", hint: "true | false" },
];

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

interface Row { id: string; label: string; startDate: string; endDate: string; isCurrent: boolean; status: string; }
const columns: MasterColumnDef<Row>[] = [
  { key: "label", label: "Financial Year", render: (row) => <span className="font-medium text-gray-900">{row.label}</span> },
  { key: "startDate", label: "Start" }, { key: "endDate", label: "End" },
  { key: "isCurrent", label: "Current", render: (row) => row.isCurrent ? <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded">Current</span> : "—" },
  { key: "status", label: "Status", type: "status" },
];

const emptyForm = { label: "", startDate: "", endDate: "", isCurrent: false, status: "active" };

const rules: ValidationRules<typeof emptyForm> = {
  label: [{ required: true, label: "Financial year label" }, { validator: validateFYCode }],
  startDate: [
    { required: true, label: "Start date" },
    { validator: (v) => validateDateISO(v, "Start date") },
  ],
  endDate: [
    { required: true, label: "End date" },
    { validator: (v) => validateDateISO(v, "End date") },
  ],
};

export default function FinancialYearsPage() {
  const { data: result, isLoading } = useFinancialYears();
  const createMutation = useCreateFinancialYear();
  const updateMutation = useUpdateFinancialYear();
  const deleteMutation = useDeleteFinancialYear();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleImportRow = async (row: Record<string, string>) => {
    if (!row.label?.trim()) return { ok: false as const, error: "Label is required" };
    if (!row.startDate?.trim()) return { ok: false as const, error: "Start date is required" };
    if (!row.endDate?.trim()) return { ok: false as const, error: "End date is required" };
    try {
      await createMutation.mutateAsync({
        label: row.label.trim(),
        startDate: row.startDate.trim(),
        endDate: row.endDate.trim(),
        isCurrent: /^(true|yes|1)$/i.test(row.isCurrent ?? ""),
        status: "active",
      });
      return { ok: true as const };
    } catch (err: unknown) {
      return { ok: false as const, error: toErrorMessage(err, "Create failed") };
    }
  };

  const set = <K extends keyof typeof emptyForm>(key: K, val: (typeof emptyForm)[K]) => {
    setForm(prev => ({ ...prev, [key]: val }));
    if (errors[key]) setErrors(prev => { const next = { ...prev }; delete next[key]; return next; });
  };

  const closeDrawer = () => { setDrawerOpen(false); setEditingId(null); setForm(emptyForm); setErrors({}); };

  const handleSubmit = async () => {
    const errs = validateForm(form, rules);
    if (!errs.endDate) {
      const rangeResult = validateDateRange(form.startDate, form.endDate, "End date");
      if (!rangeResult.valid) errs.endDate = rangeResult.error!;
    }
    if (Object.keys(errs).length) { setErrors(errs); return; }
    try {
      if (editingId) await updateMutation.mutateAsync({ id: editingId, ...form });
      else await createMutation.mutateAsync(form);
      closeDrawer();
    } catch { /* error toast handled globally */ }
  };

  const handleDelete = async (item: { id: string }) => {
    await deleteMutation.mutateAsync(item.id);
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <>
      <MasterListPage title="Financial Years" entityName="Financial Year" columns={columns}
        data={result?.data ?? []} total={result?.total ?? 0} isLoading={isLoading}
        canImport canExport
        onImport={() => setImportOpen(true)}
        onAdd={() => { setForm(emptyForm); setErrors({}); setEditingId(null); setDrawerOpen(true); }}
        onEdit={(item) => { setForm({ ...emptyForm, ...item } as typeof emptyForm); setErrors({}); setEditingId(item.id); setDrawerOpen(true); }}
        onDelete={handleDelete}
        deleteConfirmMessage={(item) => (
          <>
            Delete financial year{" "}
            <span className="font-semibold text-gray-900">“{item.label}”</span>?
            <br />
            It will be hidden from the list. You can restore it later from the
            “Show deleted” view.
          </>
        )}
        emptyIcon={<CalendarCheck className="w-8 h-8" />}
        emptyDescription="Define financial years (e.g. FY 2025-26) for reporting and document numbering." />
      <FormDrawer open={drawerOpen} onClose={closeDrawer}
        title={editingId ? "Edit Financial Year" : "Add Financial Year"}
        onSubmit={handleSubmit} loading={isSaving}
        submitLabel={editingId ? "Save Changes" : "Save"}>
        <FormSection title="Financial Year Details">
          <Field label="Label" required hint="e.g. FY 2025-26" error={errors.label}>
            <TextInput value={form.label} onChange={v => set("label", v)} placeholder="FY 2025-26" invalid={!!errors.label} />
          </Field>
          <FormRow>
            <Field label="Start Date" required error={errors.startDate}>
              <DateInput
                value={form.startDate}
                onChange={(v) => {
                  set("startDate", v);
                  if (form.endDate && v && form.endDate < v) set("endDate", "");
                }}
                invalid={!!errors.startDate}
              />
            </Field>
            <Field label="End Date" required error={errors.endDate} hint={form.startDate ? undefined : "Pick a start date first"}>
              <DateInput
                value={form.endDate}
                onChange={v => set("endDate", v)}
                min={form.startDate || undefined}
                invalid={!!errors.endDate}
              />
            </Field>
          </FormRow>
          <CheckboxInput checked={form.isCurrent} onChange={v => set("isCurrent", v)} label="This is the current active financial year" />
          <Field label="Status">
            <SelectInput value={form.status} onChange={v => set("status", v)} options={STATUS_OPTIONS} />
            {form.status === "inactive" && <InactiveStatusNotice entityName="Financial Year" />}
          </Field>
        </FormSection>
      </FormDrawer>

      <ImportDataDrawer
        open={importOpen}
        onClose={() => setImportOpen(false)}
        entityName="Financial Year"
        fields={IMPORT_FIELDS}
        onImport={handleImportRow}
      />
    </>
  );
}
