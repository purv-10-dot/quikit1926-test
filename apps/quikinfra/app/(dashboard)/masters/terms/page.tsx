"use client";

import { toErrorMessage } from "@/lib/api/errors";
import { useState } from "react";
import { FileText } from "lucide-react";
import { MasterListPage, type MasterColumnDef } from "@/components/MasterListPage";
import { useCreateTermsCondition, useUpdateTermsCondition, useDeleteTermsCondition } from "@/hooks/use-masters";
import { FormDrawer, FormSection, Field, TextInput, SelectInput, TextAreaInput, CheckboxInput, InactiveStatusNotice } from "@/components/FormDrawer";
import dynamic from "next/dynamic";
import type { ImportFieldDef } from "@/components/ImportDataDrawer";
const ImportDataDrawer = dynamic(
  () => import("@/components/ImportDataDrawer").then((m) => m.ImportDataDrawer),
  { ssr: false },
);
import { validateForm, type ValidationRules, validateMinLength } from "@/lib/validators";

const IMPORT_FIELDS: ImportFieldDef[] = [
  { key: "title", label: "Title", required: true },
  { key: "applicableTo", label: "Applicable To", required: true, hint: "po | wo | rfq | general" },
  { key: "body", label: "Body", required: true },
  { key: "isDefault", label: "Is Default", hint: "true | false" },
];

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

interface Row { id: string; title: string; applicableTo: string; isDefault: boolean; status: string; }
const columns: MasterColumnDef<Row>[] = [
  { key: "title", label: "Title", render: (row) => <span className="font-medium text-gray-900">{row.title}</span> },
  { key: "applicableTo", label: "Applicable To", width: "120px", render: (row) => (row.applicableTo ?? "").toUpperCase() },
  { key: "isDefault", label: "Default", width: "80px", render: (row) => row.isDefault ? "Yes" : "—" },
  { key: "status", label: "Status", type: "status" },
];

const APPLICABLE_OPTIONS = [
  { value: "po", label: "Purchase Order" }, { value: "wo", label: "Work Order" },
  { value: "rfq", label: "RFQ" }, { value: "general", label: "General" },
];

const emptyForm = { title: "", body: "", applicableTo: "po", isDefault: false, status: "active" };

const rules: ValidationRules<typeof emptyForm> = {
  title: [
    { required: true, label: "Title" },
    { validator: (v) => validateMinLength(String(v ?? ""), 3, "Title") },
  ],
  body: [
    { required: true, label: "Terms body" },
    { validator: (v) => validateMinLength(String(v ?? ""), 10, "Terms body") },
  ],
  applicableTo: [{ required: true, label: "Applicable to" }],
};

export default function TermsPage() {
  const createMutation = useCreateTermsCondition();
  const updateMutation = useUpdateTermsCondition();
  const deleteMutation = useDeleteTermsCondition();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleImportRow = async (row: Record<string, string>) => {
    if (!row.title?.trim()) return { ok: false as const, error: "Title is required" };
    if (!row.body?.trim()) return { ok: false as const, error: "Body is required" };
    if (!row.applicableTo?.trim()) return { ok: false as const, error: "Applicable To is required" };
    try {
      await createMutation.mutateAsync({
        title: row.title.trim(),
        applicableTo: row.applicableTo.trim().toLowerCase(),
        body: row.body.trim(),
        isDefault: /^(true|yes|1)$/i.test(row.isDefault ?? ""),
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

  const handleDelete = async (item: { id: string }) => {
    await deleteMutation.mutateAsync(item.id);
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <>
      <MasterListPage title="Terms & Conditions" entityName="T&C Template" permissionUrl="/masters/terms" columns={columns}
        showStatusTabs
        infinite={{
          queryKey: "terms-conditions-infinite",
          endpoint: "/api/masters/terms",
          pageSize: 25,
          defaultSortBy: "createdAt",
          defaultSortOrder: "desc",
        }}
        canImport canExport
        historyEntityType="terms_condition"
        onImport={() => setImportOpen(true)}
        onAdd={() => { setForm(emptyForm); setErrors({}); setEditingId(null); setDrawerOpen(true); }}
        onEdit={(item) => { setForm({ ...emptyForm, ...item } as typeof emptyForm); setErrors({}); setEditingId(item.id); setDrawerOpen(true); }}
        onDelete={handleDelete}
        deleteConfirmMessage={(item) => (
          <>
            Delete T&amp;C template{" "}
            <span className="font-semibold text-gray-900">“{item.title}”</span>?
            <br />
            It will be hidden from the list. You can restore it later from the
            “Show deleted” view.
          </>
        )}
        emptyIcon={<FileText className="w-8 h-8" />}
        emptyDescription="Standard terms and conditions attached to POs, WOs, and RFQs." />
      <FormDrawer open={drawerOpen} onClose={closeDrawer}
        title={editingId ? "Edit Terms & Conditions Template" : "Add Terms & Conditions Template"} width="xl"
        onSubmit={handleSubmit} loading={isSaving}
        submitLabel={editingId ? "Save Changes" : "Save"}>
        <FormSection title="Template Details">
          <Field label="Title" required error={errors.title}>
            <TextInput value={form.title} onChange={v => set("title", v)} placeholder="Standard PO Terms" invalid={!!errors.title} />
          </Field>
          <Field label="Applicable To" required error={errors.applicableTo}>
            <SelectInput value={form.applicableTo} onChange={v => set("applicableTo", v)} options={APPLICABLE_OPTIONS} invalid={!!errors.applicableTo} />
          </Field>
          <Field label="Terms & Conditions Body" required error={errors.body}>
            <TextAreaInput value={form.body} onChange={v => set("body", v)} rows={8}
              invalid={!!errors.body}
              placeholder="1. Payment will be made within 30 days of invoice receipt...&#10;2. Materials must conform to IS standards...&#10;3. Delivery at site gate, unloading by vendor..." />
          </Field>
          <CheckboxInput checked={form.isDefault} onChange={v => set("isDefault", v)}
            label="Set as default template for this document type" />
          <Field label="Status">
            <SelectInput value={form.status} onChange={v => set("status", v)} options={STATUS_OPTIONS} />
            {form.status === "inactive" && <InactiveStatusNotice entityName="T&C Template" />}
          </Field>
        </FormSection>
      </FormDrawer>

      <ImportDataDrawer
        open={importOpen}
        onClose={() => setImportOpen(false)}
        entityName="T&C Template"
        fields={IMPORT_FIELDS}
        onImport={handleImportRow}
      />
    </>
  );
}
