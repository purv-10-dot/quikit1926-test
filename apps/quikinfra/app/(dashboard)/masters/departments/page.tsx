"use client";

import { toErrorMessage } from "@/lib/api/errors";
import { useState } from "react";
import { Users } from "lucide-react";
import { MasterListPage, type MasterColumnDef } from "@/components/MasterListPage";
import { useDepartments, useCreateDepartment, useUpdateDepartment, useDeleteDepartment } from "@/hooks/use-masters";
import { FormDrawer, FormSection, FormRow, Field, TextInput, SelectInput, InactiveStatusNotice } from "@/components/FormDrawer";
import dynamic from "next/dynamic";
import type { ImportFieldDef } from "@/components/ImportDataDrawer";
const ImportDataDrawer = dynamic(
  () => import("@/components/ImportDataDrawer").then((m) => m.ImportDataDrawer),
  { ssr: false },
);
import { validateForm, type ValidationRules, validateCode, validateMinLength } from "@/lib/validators";

const IMPORT_FIELDS: ImportFieldDef[] = [
  { key: "code", label: "Code", required: true, hint: "e.g. DEPT-ENG" },
  { key: "name", label: "Department Name", required: true },
  { key: "costCenter", label: "Cost Center Code" },
];

interface Row { id: string; code: string; name: string; status: string; }
const columns: MasterColumnDef<Row>[] = [
  { key: "code", label: "Code", width: "100px" },
  { key: "name", label: "Department", render: (row) => <span className="font-medium text-gray-900">{row.name}</span> },
  { key: "status", label: "Status", type: "status" },
];

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

const emptyForm = { code: "", name: "", costCenter: "", headUserId: "", status: "active" };

const rules: ValidationRules<typeof emptyForm> = {
  code: [
    { required: true, label: "Department code" },
    { validator: (v) => validateCode(String(v ?? ""), "Department code") },
    { validator: (v) => validateMinLength(String(v ?? ""), 2, "Department code") },
  ],
  name: [
    { required: true, label: "Department name" },
    { validator: (v) => validateMinLength(String(v ?? ""), 2, "Department name") },
  ],
  costCenter: [{ validator: (v) => validateCode(String(v ?? ""), "Cost center code") }],
};

export default function DepartmentsPage() {
  const { data: result, isLoading } = useDepartments();
  const createMutation = useCreateDepartment();
  const updateMutation = useUpdateDepartment();
  const deleteMutation = useDeleteDepartment();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleImportRow = async (row: Record<string, string>) => {
    if (!row.code?.trim()) return { ok: false as const, error: "Code is required" };
    if (!row.name?.trim()) return { ok: false as const, error: "Department name is required" };
    try {
      await createMutation.mutateAsync({
        code: row.code.trim().toUpperCase(),
        name: row.name.trim(),
        costCenter: row.costCenter?.trim() || undefined,
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
    if (Object.keys(errs).length) { setErrors(errs); return; }
    try {
      if (editingId) await updateMutation.mutateAsync({ id: editingId, ...form });
      else await createMutation.mutateAsync(form);
      closeDrawer();
    } catch { /* error toast handled globally */ }
  };

  // Soft delete — the DELETE endpoint flips status to "inactive" (same
  // effect as a status update), but routing through the delete hook gives
  // the correct "Department deleted" toast instead of "Department updated".
  // MasterListPage hides inactive rows by default; users can toggle
  // "Inactive" to find them and click Restore to re-activate.
  const handleDelete = async (item: { id: string }) => {
    await deleteMutation.mutateAsync(item.id);
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <>
      <MasterListPage title="Departments" entityName="Department" permissionUrl="/masters/departments" columns={columns}
        showStatusTabs
        data={result?.data ?? []} total={result?.total ?? 0} isLoading={isLoading}
        canImport canExport
        historyEntityType="department"
        onImport={() => setImportOpen(true)}
        onAdd={() => { setForm(emptyForm); setErrors({}); setEditingId(null); setDrawerOpen(true); }}
        onEdit={(item) => { setForm({ ...emptyForm, ...item } as typeof emptyForm); setErrors({}); setEditingId(item.id); setDrawerOpen(true); }}
        onDelete={handleDelete}
        deleteConfirmMessage={(item) => (
          <>
            Delete department{" "}
            <span className="font-semibold text-gray-900">“{item.name}”</span>
            {item.code ? <> (<span className="font-mono">{item.code}</span>)</> : null}?
            <br />
            It will be hidden from the list. You can restore it later from the
            “Show deleted” view.
          </>
        )}
        emptyIcon={<Users className="w-8 h-8" />}
        emptyDescription="Departments organize users and approval routing." />

      <FormDrawer open={drawerOpen} onClose={closeDrawer}
        title={editingId ? "Edit Department" : "Add Department"}
        onSubmit={handleSubmit} loading={isSaving}
        submitLabel={editingId ? "Save Changes" : "Save"}>
        <FormSection title="Department Details">
          <FormRow>
            <Field label="Department Code" required error={errors.code} hint="Short code shown in the list (e.g. DEPT-ENG)">
              <TextInput value={form.code} onChange={v => set("code", v.toUpperCase())} placeholder="DEPT-ENG" className="font-mono" invalid={!!errors.code} />
            </Field>
            <Field label="Department Name" required error={errors.name}>
              <TextInput value={form.name} onChange={v => set("name", v)} placeholder="e.g. Engineering, Procurement" invalid={!!errors.name} />
            </Field>
          </FormRow>
          <Field label="Cost Center Code" error={errors.costCenter} hint="For accounting allocation (separate from Department Code)">
            <TextInput value={form.costCenter} onChange={v => set("costCenter", v)} placeholder="CC-001" className="font-mono" invalid={!!errors.costCenter} />
          </Field>
          <Field label="Status">
            <SelectInput value={form.status} onChange={v => set("status", v)} options={STATUS_OPTIONS} />
            {form.status === "inactive" && <InactiveStatusNotice entityName="Department" />}
          </Field>
        </FormSection>
      </FormDrawer>

      <ImportDataDrawer
        open={importOpen}
        onClose={() => setImportOpen(false)}
        entityName="Department"
        fields={IMPORT_FIELDS}
        onImport={handleImportRow}
      />
    </>
  );
}
