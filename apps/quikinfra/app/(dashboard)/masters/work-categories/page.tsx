"use client";

import { useState } from "react";
import { ListTodo } from "lucide-react";
import { MasterListPage, type MasterColumnDef } from "@/components/MasterListPage";
import { useWorkCategories, useCreateWorkCategory, useUpdateWorkCategory } from "@/hooks/use-masters";
import { FormDrawer, FormSection, FormRow, Field, TextInput, NumberInput, SelectInput } from "@/components/FormDrawer";
import dynamic from "next/dynamic";
import type { ImportFieldDef } from "@/components/ImportDataDrawer";
const ImportDataDrawer = dynamic(
  () => import("@/components/ImportDataDrawer").then((m) => m.ImportDataDrawer),
  { ssr: false },
);
import { validateForm, type ValidationRules, validateHSN, validatePositiveInteger, validateMinLength } from "@/lib/validators";

const IMPORT_FIELDS: ImportFieldDef[] = [
  { key: "name", label: "Category Name", required: true },
  { key: "description", label: "Description" },
  { key: "sortOrder", label: "Sort Order" },
];

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

interface Row { id: string; name: string; description?: string; status: string; }
const columns: MasterColumnDef<Row>[] = [
  { key: "name", label: "Category", render: (row) => <span className="font-medium text-gray-900">{row.name}</span> },
  { key: "description", label: "Description" },
  { key: "status", label: "Status", type: "status" },
];

const emptyForm = { name: "", description: "", sortOrder: "1", status: "active" };

const rules: ValidationRules<typeof emptyForm> = {
  name: [
    { required: true, label: "Category name" },
    { validator: (v) => validateMinLength(String(v ?? ""), 2, "Category name") },
  ],
  sortOrder: [{ validator: (v) => validatePositiveInteger(v, "Sort order") }],
};

export default function WorkCategoriesPage() {
  const { data: result, isLoading } = useWorkCategories();
  const createMutation = useCreateWorkCategory();
  const updateMutation = useUpdateWorkCategory();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleImportRow = async (row: Record<string, string>) => {
    if (!row.name?.trim()) return { ok: false as const, error: "Category name is required" };
    try {
      await createMutation.mutateAsync({
        name: row.name.trim(),
        description: row.description?.trim() || undefined,
        sortOrder: row.sortOrder?.trim() || "1",
        status: "active",
      });
      return { ok: true as const };
    } catch (err: any) {
      return { ok: false as const, error: err?.message ?? "Create failed" };
    }
  };

  const set = (key: string, val: any) => {
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

  const handleDelete = async (item: any) => {
    await updateMutation.mutateAsync({ id: item.id, status: "inactive" });
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <>
      <MasterListPage title="Work Categories" entityName="Work Category" permissionUrl="/masters/work-categories" columns={columns}
        showStatusTabs
        data={result?.data ?? []} total={result?.total ?? 0} isLoading={isLoading}
        canImport canExport
        historyEntityType="work_category"
        onImport={() => setImportOpen(true)}
        onAdd={() => { setForm(emptyForm); setErrors({}); setEditingId(null); setDrawerOpen(true); }}
        onEdit={(item: any) => { setForm({ ...emptyForm, ...item }); setErrors({}); setEditingId(item.id); setDrawerOpen(true); }}
        onDelete={handleDelete}
        deleteConfirmMessage={(item: any) => (
          <>
            Delete work category{" "}
            <span className="font-semibold text-gray-900">“{item.name}”</span>?
            <br />
            It will be hidden from the list. You can restore it later from the
            “Show deleted” view.
          </>
        )}
        emptyIcon={<ListTodo className="w-8 h-8" />}
        emptyDescription="Categories like Civil, Electrical, Plumbing, Road, Structural, etc." />
      <FormDrawer open={drawerOpen} onClose={closeDrawer}
        title={editingId ? "Edit Work Category" : "Add Work Category"}
        onSubmit={handleSubmit} loading={isSaving}
        submitLabel={editingId ? "Save Changes" : "Save"}>
        <FormSection title="Category Details">
          <Field label="Category Name" required error={errors.name}>
            <TextInput value={form.name} onChange={v => set("name", v)} placeholder="e.g. Civil Works" invalid={!!errors.name} />
          </Field>
          <Field label="Description"><TextInput value={form.description} onChange={v => set("description", v)} placeholder="Description of work type" /></Field>
          <FormRow>
            <Field label="Sort Order" error={errors.sortOrder}>
              <NumberInput value={form.sortOrder} onChange={v => set("sortOrder", v)} min={1} invalid={!!errors.sortOrder} />
            </Field>
          </FormRow>
          <Field label="Status">
            <SelectInput value={form.status} onChange={v => set("status", v)} options={STATUS_OPTIONS} />
          </Field>
        </FormSection>
      </FormDrawer>

      <ImportDataDrawer
        open={importOpen}
        onClose={() => setImportOpen(false)}
        entityName="Work Category"
        fields={IMPORT_FIELDS}
        onImport={handleImportRow}
      />
    </>
  );
}
