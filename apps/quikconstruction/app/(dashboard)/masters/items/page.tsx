"use client";

import { useState } from "react";
import { Package } from "lucide-react";
import { MasterListPage, type MasterColumnDef } from "@/components/MasterListPage";
import dynamic from "next/dynamic";
import type { ImportFieldDef } from "@/components/ImportDataDrawer";
const ImportDataDrawer = dynamic(
  () => import("@/components/ImportDataDrawer").then((m) => m.ImportDataDrawer),
  { ssr: false },
);
import { useItems, useCreateItem, useUpdateItem, useUOMs, useGSTCodes } from "@/hooks/use-masters";
import {
  FormDrawer, FormSection, FormRow, Field,
  TextInput, NumberInput, SelectInput, TextAreaInput, CheckboxInput,
  MultiSelectInput,
} from "@/components/FormDrawer";
import {
  validateForm, type ValidationRules,
  validateCode, validateMinLength, validateHSN, validatePercentage, validateNonNegativeNumber,
} from "@/lib/validators";

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

interface ItemRow {
  id: string; code: string; name: string; itemType?: string; groupName?: string;
  uomCode?: string; uomCodes?: string[];
  hsnCode?: string; gstRate?: string; standardRate?: string; minStockLevel?: string; status: string;
}

const columns: MasterColumnDef<ItemRow>[] = [
  { key: "code", label: "Code", width: "100px" },
  { key: "name", label: "Item / Material", render: (row) => <span className="font-medium text-gray-900">{row.name}</span> },
  { key: "itemType", label: "Type", width: "130px", render: (row) => row.itemType ? row.itemType : "—" },
  { key: "groupName", label: "Group" },
  { key: "uomCode", label: "UOM", width: "140px", render: (row) => {
    const codes = (row.uomCodes && row.uomCodes.length ? row.uomCodes : (row.uomCode ? [row.uomCode] : [])).filter(Boolean);
    if (codes.length === 0) return "—";
    return (
      <span className="inline-flex flex-wrap gap-1">
        {codes.map((c) => (
          <span key={c} className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-orange-50 text-orange-700 text-xs font-medium border border-orange-200">{c}</span>
        ))}
      </span>
    );
  } },
  { key: "hsnCode", label: "HSN", width: "100px" },
  { key: "gstRate", label: "GST %", width: "80px", render: (row) => row.gstRate ? `${row.gstRate}%` : "—" },
  { key: "standardRate", label: "Std. Rate", render: (row) => row.standardRate ? `₹ ${Number(row.standardRate).toLocaleString("en-IN")}` : "—" },
  { key: "minStockLevel", label: "Min Stock", render: (row) => row.minStockLevel ?? "—" },
  { key: "status", label: "Status", type: "status" },
];

const CATEGORIES = [
  "Cement", "Steel", "Aggregates", "Bricks & Blocks", "Sand", "Timber",
  "Plumbing", "Electrical", "Paint", "Hardware", "Fuel", "Consumables", "Safety", "Others",
].map(c => ({ value: c, label: c }));

interface ItemForm {
  code: string; name: string; itemType: string; category: string;
  uomIds: string[];
  hsnCode: string; gstRate: string;
  standardRate: string; specifications: string;
  currentStock: string; minStockLevel: string; reorderLevel: string;
  status: string;
}

const emptyForm: ItemForm = {
  code: "", name: "", itemType: "", category: "", uomIds: [], hsnCode: "", gstRate: "",
  standardRate: "", specifications: "", currentStock: "0", minStockLevel: "0",
  reorderLevel: "0", status: "active",
};

const rules: ValidationRules<ItemForm> = {
  code: [{ validator: (v) => validateCode(v, "Item code") }],
  name: [
    { required: true, label: "Item name" },
    { validator: (v) => validateMinLength(v, 2, "Item name") },
  ],
  category: [{ required: true, label: "Category" }],
  uomIds: [{ validator: (v) => (Array.isArray(v) && v.length > 0)
      ? { valid: true }
      : { valid: false, error: "Select at least one unit of measurement" } }],
  hsnCode: [{ validator: validateHSN }],
  gstRate: [{ validator: (v) => validatePercentage(v, "GST rate") }],
  standardRate: [
    { required: true, label: "Standard rate" },
    { validator: (v) => validateNonNegativeNumber(v, "Standard rate") },
  ],
  currentStock: [{ validator: (v) => validateNonNegativeNumber(v, "Current stock") }],
  minStockLevel: [{ validator: (v) => validateNonNegativeNumber(v, "Minimum stock level") }],
  reorderLevel: [{ validator: (v) => validateNonNegativeNumber(v, "Reorder level") }],
};

// Import field definitions. The UOM column expects either the code
// ("BAG", "KG") or the master row name — we resolve either by case-
// insensitive match against the existing UOM master below.
const IMPORT_FIELDS: ImportFieldDef[] = [
  { key: "code", label: "Code", hint: "Optional — auto-generated if blank" },
  { key: "name", label: "Item Name", required: true },
  { key: "itemType", label: "Item Type", hint: "Optional — material | consumable | asset | tool | service" },
  { key: "category", label: "Category", required: true, hint: "Cement | Steel | Aggregates | …" },
  { key: "uom", label: "UOM", required: true, hint: "Code (e.g. BAG, KG) — must match Masters → UOM" },
  { key: "hsnCode", label: "HSN Code" },
  { key: "gstRate", label: "GST Rate" },
  { key: "standardRate", label: "Standard Rate", required: true },
  { key: "specifications", label: "Specifications" },
  { key: "currentStock", label: "Current Stock" },
  { key: "minStockLevel", label: "Min Stock Level" },
  { key: "reorderLevel", label: "Reorder Level" },
];

export default function ItemsPage() {
  const { data: result, isLoading } = useItems();
  const { data: uomResult } = useUOMs();
  const { data: gstResult } = useGSTCodes();
  const createMutation = useCreateItem();
  const updateMutation = useUpdateItem();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleImportRow = async (row: Record<string, string>) => {
    if (!row.name?.trim()) return { ok: false as const, error: "Item name is required" };
    if (!row.category?.trim()) return { ok: false as const, error: "Category is required" };
    if (!row.standardRate?.trim()) return { ok: false as const, error: "Standard rate is required" };

    const resolvedItemType = row.itemType?.trim() ?? "";

    // Resolve UOM cell — split on comma / semicolon / pipe so cells like
    // "Nos, PKT" or "Nos; KG" become two UOMs on the same item.
    const cellPieces = (row.uom ?? "")
      .split(/[,;|]/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (cellPieces.length === 0) {
      return { ok: false as const, error: "UOM is required" };
    }
    const matchedUoms: { id: string; code: string }[] = [];
    for (const piece of cellPieces) {
      const target = piece.toLowerCase();
      const match = (uomResult?.data ?? []).find(
        (u: any) =>
          String(u.code ?? "").toLowerCase() === target ||
          String(u.name ?? "").toLowerCase() === target,
      );
      if (!match) {
        return {
          ok: false as const,
          error: `UOM "${piece}" not found — add it to Masters → UOM first.`,
        };
      }
      if (!matchedUoms.some((m) => m.id === match.id)) {
        matchedUoms.push({ id: match.id, code: match.code });
      }
    }
    const primaryUom = matchedUoms[0];

    try {
      await createMutation.mutateAsync({
        code: row.code?.toUpperCase() || "",
        name: row.name.trim(),
        itemType: resolvedItemType,
        category: row.category.trim(),
        uomIds: matchedUoms.map((m) => m.id),
        uomId: primaryUom.id,
        uomCode: primaryUom.code,
        hsnCode: row.hsnCode || "",
        gstRate: row.gstRate || "",
        standardRate: row.standardRate,
        specifications: row.specifications || "",
        currentStock: row.currentStock || "0",
        minStockLevel: row.minStockLevel || "0",
        reorderLevel: row.reorderLevel || "0",
        status: "active",
      });
      return { ok: true as const };
    } catch (err: any) {
      return { ok: false as const, error: err?.message ?? "Failed to create item" };
    }
  };

  const set = (key: string, val: any) => {
    setForm(prev => ({ ...prev, [key]: val }));
    if (errors[key]) setErrors(prev => { const next = { ...prev }; delete next[key]; return next; });
  };

  const uomOptions = (uomResult?.data ?? []).map((u: any) => ({ value: u.id, label: `${u.code} — ${u.name}` }));

  const handleHSNChange = (hsn: string) => {
    set("hsnCode", hsn);
    const gstMatch = (gstResult?.data ?? []).find((g: any) => g.code === hsn);
    if (gstMatch) set("gstRate", gstMatch.rate);
  };

  const closeDrawer = () => { setDrawerOpen(false); setEditingId(null); setForm(emptyForm); setErrors({}); };

  const handleDelete = async (item: any) => {
    await updateMutation.mutateAsync({ id: item.id, status: "inactive" });
  };

  const handleSubmit = async () => {
    const errs = validateForm(form, rules);
    if (Object.keys(errs).length) { setErrors(errs); return; }
    // Denormalize UOM selection: keep full array under `uomIds`, and also
    // write the first pick into `uomId`/`uomCode` for backward compat with
    // readers/columns that still expect a single UOM string.
    const primaryUom = (uomResult?.data ?? []).find((u: any) => u.id === form.uomIds[0]);
    const payload = {
      ...form,
      uomId: form.uomIds[0] ?? "",
      uomCode: primaryUom?.code ?? "",
    };
    try {
      if (editingId) {
        await updateMutation.mutateAsync({ id: editingId, ...payload });
      } else {
        await createMutation.mutateAsync(payload);
      }
      closeDrawer();
    } catch (err: any) {
      alert("Error: " + (err.message ?? "Failed to save item"));
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <>
      <MasterListPage
        title="Items / Materials"
        entityName="Item"
        columns={columns}
        data={result?.data ?? []}
        total={result?.total ?? 0}
        isLoading={isLoading}
        onAdd={() => { setForm(emptyForm); setErrors({}); setEditingId(null); setDrawerOpen(true); }}
        onEdit={(item: any) => {
          setEditingId(item.id);
          setErrors({});
          // Back-compat: older rows store a single `uomId`. Newer rows store
          // `uomIds: string[]`. Normalize either form into the array.
          const uomIds: string[] = Array.isArray(item.uomIds) && item.uomIds.length
            ? item.uomIds
            : (item.uomId ? [item.uomId] : []);
          setForm({
            code: item.code ?? "",
            name: item.name ?? "",
            itemType: item.itemType ?? "",
            category: item.groupName ?? item.category ?? "",
            uomIds,
            hsnCode: item.hsnCode ?? "",
            gstRate: item.gstRate ?? "",
            standardRate: item.standardRate ?? "",
            specifications: item.specifications ?? "",
            currentStock: item.currentStock ?? "0",
            minStockLevel: item.minStockLevel ?? "0",
            reorderLevel: item.reorderLevel ?? "0",
            status: item.status ?? "active",
          });
          setDrawerOpen(true);
        }}
        onDelete={handleDelete}
        onImport={() => setImportOpen(true)}
        deleteConfirmMessage={(item: any) => (
          <>
            Delete item{" "}
            <span className="font-semibold text-gray-900">“{item.name}”</span>
            {item.code ? <> (<span className="font-mono">{item.code}</span>)</> : null}?
            <br />
            It will be hidden from the list. You can restore it later from the
            “Show deleted” view.
          </>
        )}
        canExport canImport
        emptyIcon={<Package className="w-8 h-8" />}
        emptyDescription="Items are materials, consumables, and assets tracked across procurement and inventory."
      />

      <FormDrawer open={drawerOpen} onClose={closeDrawer}
        title={editingId ? "Edit Item / Material" : "Add Item / Material"}
        subtitle={editingId ? "Update item details" : "Register a new material for procurement and inventory"}
        width="xl" onSubmit={handleSubmit} loading={isSaving}
        submitLabel={editingId ? "Save Changes" : "Save"}>

        <FormSection title="Basic Information">
          <FormRow>
            <Field label="Item Code" hint="Optional — auto-generated if left blank" error={errors.code}>
              <TextInput value={form.code} onChange={v => set("code", v.toUpperCase())} placeholder="MAT-001" invalid={!!errors.code} />
            </Field>
            <Field label="Item Name" required error={errors.name}>
              <TextInput value={form.name} onChange={v => set("name", v)} placeholder="10mm TMT Bar" invalid={!!errors.name} />
            </Field>
          </FormRow>
          <FormRow>
            <Field label="Item Type" error={errors.itemType} hint="Optional — free text">
              <TextInput value={form.itemType} onChange={v => set("itemType", v)} placeholder="e.g. Raw Material" invalid={!!errors.itemType} />
            </Field>
            <Field label="Category" required error={errors.category}>
              <SelectInput value={form.category} onChange={v => set("category", v)} options={CATEGORIES} placeholder="Select category" invalid={!!errors.category} />
            </Field>
          </FormRow>
          <Field label="Units of Measurement" required error={errors.uomIds} hint="Pick one or more — e.g. Bag and Kg" span={2}>
            <MultiSelectInput values={form.uomIds} onChange={v => set("uomIds", v)} options={uomOptions} placeholder="Select UOM(s)" invalid={!!errors.uomIds} />
          </Field>
          <Field label="Specifications" span={2}>
            <TextAreaInput value={form.specifications} onChange={v => set("specifications", v)}
              placeholder="Grade, size, brand, technical specs..." rows={2} />
          </Field>
        </FormSection>

        <FormSection title="Tax & Pricing">
          <FormRow>
            <Field label="HSN Code" hint="6-8 digit HSN code (auto-fetches GST rate)" error={errors.hsnCode}>
              <TextInput value={form.hsnCode} onChange={handleHSNChange} placeholder="72142000" maxLength={8} invalid={!!errors.hsnCode} />
            </Field>
            <Field label="GST Rate (%)" hint="Auto-filled from HSN" error={errors.gstRate}>
              <NumberInput value={form.gstRate} onChange={v => set("gstRate", v)} min={0} max={100} step="0.01" placeholder="18" invalid={!!errors.gstRate} />
            </Field>
          </FormRow>
          <Field label="Standard Rate (₹)" required hint="Default purchase rate" error={errors.standardRate}>
            <NumberInput value={form.standardRate} onChange={v => set("standardRate", v)} min={0} step="0.01" placeholder="0.00" invalid={!!errors.standardRate} />
          </Field>
        </FormSection>

        <FormSection title="Stock Parameters">
          <FormRow>
            <Field label="Current Stock" error={errors.currentStock}>
              <NumberInput value={form.currentStock} onChange={v => set("currentStock", v)} min={0} invalid={!!errors.currentStock} />
            </Field>
            <Field label="Minimum Stock Level" hint="Alert when below this" error={errors.minStockLevel}>
              <NumberInput value={form.minStockLevel} onChange={v => set("minStockLevel", v)} min={0} invalid={!!errors.minStockLevel} />
            </Field>
          </FormRow>
          <Field label="Reorder Level" hint="Trigger procurement when stock falls below" error={errors.reorderLevel}>
            <NumberInput value={form.reorderLevel} onChange={v => set("reorderLevel", v)} min={0} invalid={!!errors.reorderLevel} />
          </Field>
        </FormSection>
        <FormSection title="Status">
          <Field label="Status">
            <SelectInput value={form.status} onChange={v => set("status", v)} options={STATUS_OPTIONS} />
          </Field>
        </FormSection>
      </FormDrawer>

      <ImportDataDrawer
        open={importOpen}
        onClose={() => setImportOpen(false)}
        entityName="Item"
        fields={IMPORT_FIELDS}
        onImport={handleImportRow}
      />
    </>
  );
}
