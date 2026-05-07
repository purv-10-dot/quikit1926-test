"use client";

import { useState } from "react";
import { Calculator } from "lucide-react";
import { MasterListPage, type MasterColumnDef } from "@/components/MasterListPage";
import { useUOMs, useCreateUOM, useUpdateUOM } from "@/hooks/use-masters";
import {
  FormDrawer, FormSection, FormRow, Field,
  TextInput, SelectInput, CheckboxInput,
} from "@/components/FormDrawer";
import dynamic from "next/dynamic";
import type { ImportFieldDef } from "@/components/ImportDataDrawer";
const ImportDataDrawer = dynamic(
  () => import("@/components/ImportDataDrawer").then((m) => m.ImportDataDrawer),
  { ssr: false },
);
import { validateForm, type ValidationRules, validateCode, validateMinLength } from "@/lib/validators";

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

interface UOMRow { id: string; code: string; name: string; status: string; }

const columns: MasterColumnDef<UOMRow>[] = [
  { key: "code", label: "Code", width: "120px" },
  { key: "name", label: "Unit of Measurement", render: (row) => <span className="font-medium text-gray-900">{row.name}</span> },
  { key: "status", label: "Status", type: "status" },
];

const UOM_TYPES = [
  { value: "Weight", label: "Weight (Kg, MT, Quintal)" },
  { value: "Volume", label: "Volume (Ltr, KL, Cum)" },
  { value: "Length", label: "Length (m, Km, Rmt)" },
  { value: "Area", label: "Area (Sqm, Sqft)" },
  { value: "Count", label: "Count (Nos, Pcs, Set)" },
  { value: "Time", label: "Time (Hr, Day, Month)" },
];

const PRECISION_OPTIONS = [
  { value: "0", label: "0 decimals (whole numbers)" },
  { value: "2", label: "2 decimals" },
  { value: "3", label: "3 decimals" },
];

const IMPORT_FIELDS: ImportFieldDef[] = [
  { key: "code", label: "UOM Code", required: true, hint: "e.g. KG, MT, NOS" },
  { key: "name", label: "Full Name", required: true },
  { key: "type", label: "Type", hint: "Weight | Volume | Length | Area | Count | Time" },
  { key: "precision", label: "Decimal Precision", hint: "0 | 2 | 3" },
  { key: "isBase", label: "Is Base UOM", hint: "true | false" },
];

const emptyForm = { code: "", name: "", type: "Count", precision: "2", isBase: false, status: "active" };

const rules: ValidationRules<typeof emptyForm> = {
  code: [
    { required: true, label: "UOM code" },
    { validator: (v) => validateCode(String(v ?? ""), "UOM code") },
    { validator: (v) => {
        const s = String(v ?? "").trim();
        if (s.length > 10) return { valid: false, error: "UOM code must be 10 characters or fewer" };
        return { valid: true };
    } },
  ],
  name: [
    { required: true, label: "UOM name" },
    { validator: (v) => validateMinLength(String(v ?? ""), 2, "UOM name") },
  ],
  type: [{ required: true, label: "UOM type" }],
};

export default function UOMPage() {
  const { data: result, isLoading } = useUOMs();
  const createMutation = useCreateUOM();
  const updateMutation = useUpdateUOM();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleImportRow = async (row: Record<string, string>) => {
    if (!row.code?.trim()) return { ok: false as const, error: "UOM code is required" };
    if (!row.name?.trim()) return { ok: false as const, error: "UOM name is required" };
    try {
      await createMutation.mutateAsync({
        code: row.code.trim().toUpperCase(),
        name: row.name.trim(),
        type: row.type?.trim() || "Count",
        precision: row.precision?.trim() || "2",
        isBase: /^(true|yes|1)$/i.test(row.isBase ?? ""),
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
      if (editingId) {
        await updateMutation.mutateAsync({ id: editingId, ...form });
      } else {
        await createMutation.mutateAsync(form);
      }
      closeDrawer();
    } catch (err: any) { alert(err.message); }
  };

  const handleDelete = async (item: any) => {
    await updateMutation.mutateAsync({ id: item.id, status: "inactive" });
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <>
      <MasterListPage title="Units of Measurement" entityName="UOM" columns={columns}
        data={result?.data ?? []} total={result?.data?.length ?? 0} isLoading={isLoading}
        canImport canExport
        onImport={() => setImportOpen(true)}
        onAdd={() => { setForm(emptyForm); setErrors({}); setEditingId(null); setDrawerOpen(true); }}
        onEdit={(item: any) => { setForm({ ...emptyForm, ...item }); setErrors({}); setEditingId(item.id); setDrawerOpen(true); }}
        onDelete={handleDelete}
        deleteConfirmMessage={(item: any) => (
          <>
            Delete UOM{" "}
            <span className="font-semibold text-gray-900">“{item.code}”</span>
            {item.name ? <> — {item.name}</> : null}?
            <br />
            It will be hidden from the list. You can restore it later from the
            “Show deleted” view.
          </>
        )}
        emptyIcon={<Calculator className="w-8 h-8" />}
        emptyDescription="Define units like Kg, MT, Nos, Sqm, Cum, Rmt etc." />

      <FormDrawer open={drawerOpen} onClose={closeDrawer}
        title={editingId ? "Edit UOM" : "Add UOM"} subtitle="Define a unit of measurement"
        onSubmit={handleSubmit} loading={isSaving}
        submitLabel={editingId ? "Save Changes" : "Save"}>
        <FormSection title="UOM Details">
          <FormRow>
            <Field label="UOM Code" required error={errors.code} hint="e.g. KG, MT, NOS, SQM">
              <TextInput value={form.code} onChange={v => set("code", v.toUpperCase())} placeholder="KG" invalid={!!errors.code} />
            </Field>
            <Field label="Full Name" required error={errors.name}>
              <TextInput value={form.name} onChange={v => set("name", v)} placeholder="Kilogram" invalid={!!errors.name} />
            </Field>
          </FormRow>
          <FormRow>
            <Field label="UOM Type" required>
              <SelectInput value={form.type} onChange={v => set("type", v)} options={UOM_TYPES} />
            </Field>
            <Field label="Decimal Precision">
              <SelectInput value={form.precision} onChange={v => set("precision", v)} options={PRECISION_OPTIONS} />
            </Field>
          </FormRow>
          <CheckboxInput checked={form.isBase} onChange={v => set("isBase", v)} label="This is the base UOM for its type" />
          <Field label="Status">
            <SelectInput value={form.status} onChange={v => set("status", v)} options={STATUS_OPTIONS} />
          </Field>
        </FormSection>
      </FormDrawer>

      <ImportDataDrawer
        open={importOpen}
        onClose={() => setImportOpen(false)}
        entityName="UOM"
        fields={IMPORT_FIELDS}
        onImport={handleImportRow}
      />
    </>
  );
}
