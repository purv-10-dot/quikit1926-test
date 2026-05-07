"use client";

import { useState } from "react";
import { CreditCard } from "lucide-react";
import { MasterListPage, type MasterColumnDef } from "@/components/MasterListPage";
import { useTDSCodes, useCreateTDSCode, useUpdateTDSCode } from "@/hooks/use-masters";
import { FormDrawer, FormSection, FormRow, Field, TextInput, NumberInput, SelectInput } from "@/components/FormDrawer";
import dynamic from "next/dynamic";
import type { ImportFieldDef } from "@/components/ImportDataDrawer";
const ImportDataDrawer = dynamic(
  () => import("@/components/ImportDataDrawer").then((m) => m.ImportDataDrawer),
  { ssr: false },
);
import { validateForm, type ValidationRules, validatePercentage, validateNonNegativeNumber, validateMinLength } from "@/lib/validators";

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

interface Row { id: string; section: string; description: string; rate: string; thresholdAmount?: string; status: string; }
const columns: MasterColumnDef<Row>[] = [
  { key: "section", label: "Section", width: "120px" },
  { key: "description", label: "Description", render: (row) => <span className="font-medium text-gray-900">{row.description}</span> },
  { key: "rate", label: "Rate %", width: "80px" },
  { key: "thresholdAmount", label: "Threshold", render: (row) => row.thresholdAmount ? `₹ ${Number(row.thresholdAmount).toLocaleString("en-IN")}` : "—" },
  { key: "status", label: "Status", type: "status" },
];

const IMPORT_FIELDS: ImportFieldDef[] = [
  { key: "section", label: "Section", required: true, hint: "e.g. 194C" },
  { key: "description", label: "Description", required: true },
  { key: "rate", label: "Rate %", required: true },
  { key: "thresholdAmount", label: "Threshold Amount" },
];

const emptyForm = { section: "", description: "", rate: "", thresholdAmount: "", status: "active" };

const rules: ValidationRules<typeof emptyForm> = {
  section: [
    { required: true, label: "Section" },
    { validator: (v) => {
        const cleaned = String(v ?? "").trim();
        if (!/^\d{3}[A-Z]{0,3}$/i.test(cleaned)) return { valid: false, error: "Section must look like 194C, 194J, 194" };
        return { valid: true };
    } },
  ],
  description: [
    { required: true, label: "Description" },
    { validator: (v) => validateMinLength(String(v ?? ""), 3, "Description") },
  ],
  rate: [
    { required: true, label: "TDS rate" },
    { validator: (v) => validatePercentage(v, "TDS rate") },
  ],
  thresholdAmount: [{ validator: (v) => validateNonNegativeNumber(v, "Threshold amount") }],
};

export default function TDSPage() {
  const { data: result, isLoading } = useTDSCodes();
  const createMutation = useCreateTDSCode();
  const updateMutation = useUpdateTDSCode();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleImportRow = async (row: Record<string, string>) => {
    if (!row.section?.trim()) return { ok: false as const, error: "Section is required" };
    if (!row.description?.trim()) return { ok: false as const, error: "Description is required" };
    if (!row.rate?.trim()) return { ok: false as const, error: "Rate is required" };
    try {
      await createMutation.mutateAsync({
        section: row.section.trim().toUpperCase(),
        description: row.description.trim(),
        rate: row.rate.trim(),
        thresholdAmount: row.thresholdAmount?.trim() || undefined,
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
    } catch (err: any) { alert(err.message); }
  };

  const handleDelete = async (item: any) => {
    await updateMutation.mutateAsync({ id: item.id, status: "inactive" });
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <>
      <MasterListPage title="TDS Codes" entityName="TDS Code" columns={columns}
        data={result?.data ?? []} total={result?.total ?? 0} isLoading={isLoading}
        canImport canExport
        onImport={() => setImportOpen(true)}
        onAdd={() => { setForm(emptyForm); setErrors({}); setEditingId(null); setDrawerOpen(true); }}
        onEdit={(item: any) => { setForm({ ...emptyForm, ...item }); setErrors({}); setEditingId(item.id); setDrawerOpen(true); }}
        onDelete={handleDelete}
        deleteConfirmMessage={(item: any) => (
          <>
            Delete TDS code{" "}
            <span className="font-semibold text-gray-900">“{item.section}”</span>
            {item.description ? <> — {item.description}</> : null}?
            <br />
            It will be hidden from the list. You can restore it later from the
            “Show deleted” view.
          </>
        )}
        emptyIcon={<CreditCard className="w-8 h-8" />}
        emptyDescription="TDS codes for deduction at source on contractor/vendor payments." />
      <FormDrawer open={drawerOpen} onClose={closeDrawer}
        title={editingId ? "Edit TDS Code" : "Add TDS Code"}
        onSubmit={handleSubmit} loading={isSaving}
        submitLabel={editingId ? "Save Changes" : "Save"}>
        <FormSection title="TDS Details">
          <FormRow>
            <Field label="Section" required error={errors.section} hint="e.g. 194C, 194J">
              <TextInput value={form.section} onChange={v => set("section", v.toUpperCase())} placeholder="194C" invalid={!!errors.section} />
            </Field>
            <Field label="TDS Rate (%)" required error={errors.rate}>
              <NumberInput value={form.rate} onChange={v => set("rate", v)} min={0} max={100} step="0.01" placeholder="2" invalid={!!errors.rate} />
            </Field>
          </FormRow>
          <Field label="Description" required error={errors.description}>
            <TextInput value={form.description} onChange={v => set("description", v)} placeholder="Payment to contractors" invalid={!!errors.description} />
          </Field>
          <Field label="Threshold Amount (₹)" error={errors.thresholdAmount} hint="TDS applies above this amount">
            <NumberInput value={form.thresholdAmount} onChange={v => set("thresholdAmount", v)} min={0} placeholder="30000" invalid={!!errors.thresholdAmount} />
          </Field>
          <Field label="Status">
            <SelectInput value={form.status} onChange={v => set("status", v)} options={STATUS_OPTIONS} />
          </Field>
        </FormSection>
      </FormDrawer>

      <ImportDataDrawer
        open={importOpen}
        onClose={() => setImportOpen(false)}
        entityName="TDS Code"
        fields={IMPORT_FIELDS}
        onImport={handleImportRow}
      />
    </>
  );
}
