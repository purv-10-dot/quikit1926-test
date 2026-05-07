"use client";

import { useState } from "react";
import { Receipt } from "lucide-react";
import { MasterListPage, type MasterColumnDef } from "@/components/MasterListPage";
import { useGSTCodes, useCreateGSTCode, useUpdateGSTCode, useItemGroups } from "@/hooks/use-masters";
import { FormDrawer, FormSection, FormRow, Field, TextInput, NumberInput, SelectInput, DateInput, CheckboxInput } from "@/components/FormDrawer";
import dynamic from "next/dynamic";
import type { ImportFieldDef } from "@/components/ImportDataDrawer";
const ImportDataDrawer = dynamic(
  () => import("@/components/ImportDataDrawer").then((m) => m.ImportDataDrawer),
  { ssr: false },
);
import { validateForm, type ValidationRules, validateHSN, validatePercentage, validateDateISO, validateDateRange, validateMinLength } from "@/lib/validators";

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

interface Row { id: string; code: string; description: string; itemGroupName?: string; rate: string; cgstRate: string; sgstRate: string; igstRate: string; status: string; }
const columns: MasterColumnDef<Row>[] = [
  { key: "code", label: "Code", width: "100px" },
  { key: "description", label: "Description", render: (row) => <span className="font-medium text-gray-900">{row.description}</span> },
  { key: "itemGroupName", label: "Category", render: (row) => row.itemGroupName || "—" },
  { key: "rate", label: "Rate %", width: "80px" },
  { key: "cgstRate", label: "CGST %", width: "80px" },
  { key: "sgstRate", label: "SGST %", width: "80px" },
  { key: "igstRate", label: "IGST %", width: "80px" },
  { key: "status", label: "Status", type: "status" },
];

const IMPORT_FIELDS: ImportFieldDef[] = [
  { key: "code", label: "HSN/SAC Code", required: true },
  { key: "codeType", label: "Code Type", hint: "HSN | SAC" },
  { key: "description", label: "Description", required: true },
  { key: "igstRate", label: "IGST %", required: true, hint: "e.g. 18" },
  { key: "isRcm", label: "Is RCM", hint: "true | false" },
  { key: "effectiveFrom", label: "Effective From", hint: "YYYY-MM-DD" },
  { key: "effectiveTo", label: "Effective To", hint: "YYYY-MM-DD (optional)" },
];

const emptyForm = {
  codeType: "HSN", code: "", description: "",
  itemGroupId: "", itemGroupName: "",
  igstRate: "18", isRcm: false, effectiveFrom: "", effectiveTo: "", status: "active",
};

const rules: ValidationRules<typeof emptyForm> = {
  code: [
    { required: true, label: "HSN/SAC code" },
    { validator: validateHSN },
  ],
  description: [
    { required: true, label: "Description" },
    { validator: (v) => validateMinLength(String(v ?? ""), 3, "Description") },
  ],
  igstRate: [
    { required: true, label: "IGST rate" },
    { validator: (v) => validatePercentage(v, "IGST rate") },
  ],
  effectiveFrom: [
    { required: true, label: "Effective from" },
    { validator: (v) => validateDateISO(String(v ?? ""), "Effective from") },
  ],
  effectiveTo: [{ validator: (v) => validateDateISO(String(v ?? ""), "Effective to") }],
};

export default function GSTPage() {
  const { data: result, isLoading } = useGSTCodes();
  const { data: itemGroupsResult } = useItemGroups();
  const createMutation = useCreateGSTCode();
  const updateMutation = useUpdateGSTCode();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleImportRow = async (row: Record<string, string>) => {
    if (!row.code?.trim()) return { ok: false as const, error: "HSN/SAC code is required" };
    if (!row.description?.trim()) return { ok: false as const, error: "Description is required" };
    if (!row.igstRate?.trim()) return { ok: false as const, error: "IGST rate is required" };
    try {
      await createMutation.mutateAsync({
        code: row.code.trim(),
        codeType: row.codeType?.trim() || "HSN",
        description: row.description.trim(),
        igstRate: row.igstRate.trim(),
        isRcm: /^(true|yes|1)$/i.test(row.isRcm ?? ""),
        effectiveFrom: row.effectiveFrom || undefined,
        effectiveTo: row.effectiveTo || undefined,
        status: "active",
      });
      return { ok: true as const };
    } catch (err: any) {
      return { ok: false as const, error: err?.message ?? "Create failed" };
    }
  };

  // Item Group lookup — renders group name with parent hierarchy for clarity
  // (e.g. "TMT Bars" under "Steel & Reinforcement" shows as "Steel & Reinforcement › TMT Bars").
  const itemGroups = itemGroupsResult?.data ?? [];
  const itemGroupOptions = itemGroups
    .filter((g: any) => g.status !== "inactive")
    .map((g: any) => ({
      value: g.id,
      label: g.parentName ? `${g.parentName} › ${g.name}` : g.name,
    }));

  const set = (key: string, val: any) => {
    setForm(prev => ({ ...prev, [key]: val }));
    if (errors[key]) setErrors(prev => { const next = { ...prev }; delete next[key]; return next; });
  };
  const igst = parseFloat(form.igstRate) || 0;
  const cgst = (igst / 2).toFixed(2);
  const sgst = (igst / 2).toFixed(2);

  const closeDrawer = () => { setDrawerOpen(false); setEditingId(null); setForm(emptyForm); setErrors({}); };

  const handleSubmit = async () => {
    const errs = validateForm(form, rules);
    const rangeCheck = validateDateRange(form.effectiveFrom, form.effectiveTo, "Effective to");
    if (!rangeCheck.valid) errs.effectiveTo = rangeCheck.error!;
    if (Object.keys(errs).length) { setErrors(errs); return; }
    // Denormalize the group name so the list column can show it without
    // a second lookup, and it survives renames cleanly (UI resolves live
    // through the join, but the cached name is a usable fallback).
    const pickedGroup = itemGroups.find((g: any) => g.id === form.itemGroupId);
    try {
      const payload = {
        ...form,
        itemGroupName: pickedGroup?.name ?? "",
        cgstRate: cgst, sgstRate: sgst, rate: form.igstRate,
      };
      if (editingId) await updateMutation.mutateAsync({ id: editingId, ...payload });
      else await createMutation.mutateAsync(payload);
      closeDrawer();
    } catch (err: any) { alert(err.message); }
  };

  const handleDelete = async (item: any) => {
    await updateMutation.mutateAsync({ id: item.id, status: "inactive" });
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <>
      <MasterListPage title="GST Codes" entityName="GST Code" columns={columns}
        data={result?.data ?? []} total={result?.total ?? 0} isLoading={isLoading}
        canImport canExport
        onImport={() => setImportOpen(true)}
        onAdd={() => { setForm(emptyForm); setErrors({}); setEditingId(null); setDrawerOpen(true); }}
        onEdit={(item: any) => { setForm({ ...emptyForm, ...item }); setErrors({}); setEditingId(item.id); setDrawerOpen(true); }}
        onDelete={handleDelete}
        deleteConfirmMessage={(item: any) => (
          <>
            Delete GST code{" "}
            <span className="font-semibold text-gray-900">“{item.code}”</span>
            {item.description ? <> — {item.description}</> : null}?
            <br />
            It will be hidden from the list. You can restore it later from the
            “Show deleted” view.
          </>
        )}
        emptyIcon={<Receipt className="w-8 h-8" />}
        emptyDescription="GST codes define tax rates applied to items and purchase orders." />

      <FormDrawer open={drawerOpen} onClose={closeDrawer}
        title={editingId ? "Edit GST Code" : "Add GST Code"} subtitle="Define HSN/SAC code with tax rates"
        onSubmit={handleSubmit} loading={isSaving}
        submitLabel={editingId ? "Save Changes" : "Save"}>
        <FormSection title="Code Details">
          <FormRow>
            <Field label="Code Type" required>
              <SelectInput value={form.codeType} onChange={v => set("codeType", v)}
                options={[{ value: "HSN", label: "HSN (Goods)" }, { value: "SAC", label: "SAC (Services)" }]} />
            </Field>
            <Field label={`${form.codeType} Code`} required error={errors.code} hint={form.codeType === "HSN" ? "6-8 digit HSN code" : "6-digit SAC code"}>
              <TextInput value={form.code} onChange={v => set("code", v.replace(/\D/g, ""))} placeholder={form.codeType === "HSN" ? "72142000" : "998311"} maxLength={8} invalid={!!errors.code} />
            </Field>
          </FormRow>
          <Field label="Description" required error={errors.description}>
            <TextInput value={form.description} onChange={v => set("description", v)} placeholder="Bars and rods of iron or non-alloy steel" invalid={!!errors.description} />
          </Field>
          <Field label="Category" hint="Tag this code to a category from Masters › Item Groups / Categories">
            <SelectInput
              value={form.itemGroupId}
              onChange={v => set("itemGroupId", v)}
              options={itemGroupOptions}
              placeholder={itemGroupOptions.length === 0 ? "No categories available" : "Select category"}
              disabled={itemGroupOptions.length === 0}
            />
          </Field>
        </FormSection>

        <FormSection title="Tax Rates">
          <Field label="IGST Rate (%)" required error={errors.igstRate} hint="CGST and SGST are auto-calculated as IGST/2">
            <NumberInput value={form.igstRate} onChange={v => set("igstRate", v)} min={0} max={100} step="0.01" placeholder="18" invalid={!!errors.igstRate} />
          </Field>
          <div className="grid grid-cols-2 gap-4 p-3 bg-gray-50 rounded-lg border border-gray-200">
            <div>
              <span className="text-xs text-gray-500">CGST Rate</span>
              <p className="text-sm font-bold text-gray-900">{cgst}%</p>
            </div>
            <div>
              <span className="text-xs text-gray-500">SGST Rate</span>
              <p className="text-sm font-bold text-gray-900">{sgst}%</p>
            </div>
          </div>
          <CheckboxInput checked={form.isRcm} onChange={v => set("isRcm", v)} label="RCM Applicable (Reverse Charge Mechanism)" />
        </FormSection>

        <FormSection title="Validity Period">
          <FormRow>
            <Field label="Effective From" required error={errors.effectiveFrom}>
              <DateInput value={form.effectiveFrom} onChange={v => set("effectiveFrom", v)} invalid={!!errors.effectiveFrom} />
            </Field>
            <Field label="Effective To" error={errors.effectiveTo} hint="Leave blank if currently active">
              <DateInput value={form.effectiveTo} onChange={v => set("effectiveTo", v)} min={form.effectiveFrom || undefined} invalid={!!errors.effectiveTo} />
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
        entityName="GST Code"
        fields={IMPORT_FIELDS}
        onImport={handleImportRow}
      />
    </>
  );
}
