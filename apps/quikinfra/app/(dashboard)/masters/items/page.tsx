"use client";

import { toErrorMessage } from "@/lib/api/errors";
import { useEffect, useMemo, useRef, useState } from "react";
import { MapPin, Package, X } from "lucide-react";
import { MasterListPage, type MasterColumnDef } from "@/components/MasterListPage";
import dynamic from "next/dynamic";
import type { ImportFieldDef } from "@/components/ImportDataDrawer";
import { PrimaryButton, SecondaryButton } from "@/components/PageShell";
const ImportDataDrawer = dynamic(
  () => import("@/components/ImportDataDrawer").then((m) => m.ImportDataDrawer),
  { ssr: false },
);
import { useItems, useCreateItem, useUpdateItem, useUOMs, useGSTCodes, useItemGroups, useDeleteItem } from "@/hooks/use-masters";
import {
  FormDrawer, FormSection, FormRow, Field,
  TextInput, NumberInput, SelectInput, TextAreaInput, CheckboxInput,
  MultiSelectInput, InactiveStatusNotice,
} from "@/components/FormDrawer";
import {
  validateForm, type ValidationRules,
  validateCode, validateMinLength, validateHSN, validatePercentage, validateNonNegativeNumber,
} from "@/lib/validators";

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

const ITEM_TYPE_OPTIONS = [
  { value: "Cement", label: "Cement" },
  { value: "Steel", label: "Steel" },
  { value: "Aggregates", label: "Aggregates" },
  { value: "Bricks & Blocks", label: "Bricks & Blocks" },
  { value: "Sand", label: "Sand" },
  { value: "Timber", label: "Timber" },
  { value: "Plumbing", label: "Plumbing" },
  { value: "Electrical", label: "Electrical" },
  { value: "Paint", label: "Paint" },
  { value: "Hardware", label: "Hardware" },
  { value: "Fuel", label: "Fuel" },
  { value: "Consumables", label: "Consumables" },
  { value: "Safety", label: "Safety" },
  { value: "Others", label: "Others" },
];

interface ItemRow {
  id: string; code: string; name: string; itemType?: string; groupName?: string; category?: string;
  uomCode?: string; uomCodes?: string[]; uomIds?: string[]; uomId?: string;
  hsnCode?: string; gstRate?: string; standardRate?: string; minStockLevel?: string;
  reorderLevel?: string; specifications?: string; status: string;
}

interface ItemGroupRow {
  id: string;
  name?: string;
  status?: string;
  parentId?: string | null;
}

interface GstRow {
  code?: string;
  status?: string;
  itemGroupName?: string;
  itemGroupId?: string;
  rate?: string | number;
  igstRate?: string | number;
}

function StockPinCell({
  itemId,
  currentStock,
}: {
  itemId: string;
  currentStock: number;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [data, setData] = useState<{
    total: number;
    locations: Array<{
      locationId: string;
      locationCode: string;
      locationName: string;
      type: string;
      projectId: string;
      quantity: number;
    }>;
  } | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/store/item-stock-locations?itemId=${encodeURIComponent(itemId)}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to load stock");
      setData({ total: Number(json.total ?? 0), locations: Array.isArray(json.locations) ? json.locations : [] });
    } catch (e: unknown) {
      setError(toErrorMessage(e, "Failed to load stock"));
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div ref={rootRef} className="relative flex items-center gap-2">
      <span className="text-gray-900 tabular-nums">
        {Number.isFinite(currentStock) && currentStock !== 0
          ? currentStock.toLocaleString(undefined, { maximumFractionDigits: 4 })
          : ""}
      </span>
      <button
        type="button"
        onClick={async () => {
          const next = !open;
          setOpen(next);
          if (next && !data && !loading) await load();
        }}
        className="p-1 rounded hover:bg-orange-50 text-gray-500 hover:text-orange-700"
        aria-label="Show stock by location"
        title="Show stock by location"
      >
        <MapPin className="w-4 h-4" />
      </button>

      {open ? (
        <div className="absolute z-50 top-full right-0 mt-2 w-80 rounded-lg border border-gray-200 bg-white shadow-lg overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
            <div className="text-sm font-semibold text-gray-900">Stock by location</div>
            <button type="button" onClick={() => setOpen(false)} className="p-1 rounded hover:bg-gray-100 text-gray-500">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="px-3 py-2">
            {loading ? (
              <div className="text-xs text-gray-400">Loading…</div>
            ) : error ? (
              <div className="text-xs text-red-600">{error}</div>
            ) : data && data.locations.length > 0 ? (
              <div className="space-y-2">
                <div className="text-xs text-gray-500">Total: <span className="font-semibold text-gray-900">{data.total}</span></div>
                <div className="max-h-56 overflow-y-auto divide-y divide-gray-100 border border-gray-100 rounded-md">
                  {data.locations.map((r) => (
                    <div key={`${r.locationId}-${r.projectId}`} className="px-2.5 py-2 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm text-gray-900 truncate">
                          {r.locationCode ? `${r.locationCode} — ` : ""}{r.locationName || r.locationId}
                        </div>
                        <div className="text-[10px] text-gray-500 truncate">{r.type || "location"}</div>
                      </div>
                      <div className="text-sm font-semibold text-gray-900 tabular-nums">{r.quantity}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-xs text-gray-400">No stock available in any location.</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

interface ItemForm {
  code: string; name: string; itemType: string; category: string;
  uomIds: string[];
  hsnCode: string; gstRate: string;
  standardRate: string; specifications: string;
  minStockLevel: string; reorderLevel: string;
  status: string;
}

const emptyForm: ItemForm = {
  code: "", name: "", itemType: "", category: "", uomIds: [], hsnCode: "", gstRate: "",
  standardRate: "", specifications: "", minStockLevel: "0",
  reorderLevel: "0", status: "active",
};

function buildItemGroupById(groups: ItemGroupRow[]): Map<string, ItemGroupRow> {
  const m = new Map<string, ItemGroupRow>();
  for (const g of groups) m.set(g.id, g);
  return m;
}

function rootItemGroupId(groupId: string, byId: Map<string, ItemGroupRow>): string {
  let cur = groupId;
  for (let i = 0; i < 32; i++) {
    const row = byId.get(cur);
    if (!row) return cur;
    if (!row.parentId) return cur;
    cur = row.parentId;
  }
  return cur;
}

function findGstForItemCategory(
  categoryLabel: string,
  gstRows: GstRow[],
  itemGroups: ItemGroupRow[],
): { code: string; rate: string } | null {
  const c = String(categoryLabel ?? "").trim();
  if (!c) return null;
  const n = c.toLowerCase();
  const byId = buildItemGroupById(itemGroups);
  const activeGroups = (itemGroups ?? []).filter(
    (ig) =>
      String(ig.status ?? "active") !== "inactive" &&
      String(ig.status ?? "") !== "deleted",
  );
  const group = activeGroups.find(
    (ig) => String(ig.name ?? "").trim().toLowerCase() === n,
  );
  const groupId = group?.id ?? "";
  const rootId = groupId ? rootItemGroupId(groupId, byId) : "";
  const root = rootId ? byId.get(rootId) : null;
  const rootNameNorm = root
    ? String(root.name ?? "").trim().toLowerCase()
    : "";

  const active = (gstRows ?? []).filter(
    (g) =>
      g &&
      String(g.status ?? "active") !== "inactive" &&
      String(g.status ?? "") !== "deleted",
  );
  const candidates = active.filter((g) => {
    const gn = String(g.itemGroupName ?? "").trim().toLowerCase();
    if (gn && gn === n) return true;
    if (groupId && g.itemGroupId === groupId) return true;
    if (rootId && g.itemGroupId === rootId) return true;
    if (rootNameNorm && gn === rootNameNorm) return true;
    return false;
  });
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => String(a.code).localeCompare(String(b.code)));
  const pick = candidates[0];
  const rate = String(pick.rate ?? pick.igstRate ?? "").trim();
  return { code: String(pick.code ?? "").trim(), rate };
}

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
  // Request all statuses (incl. soft-deleted "inactive") so MasterListPage's
  // "Show inactive" toggle and inactive-count have rows to work with. Other
  // consumers of useItems() omit status and get active-only from the API.
  const { data: result, isLoading } = useItems({ status: "all" });
  const { data: uomResult } = useUOMs();
  const { data: gstResult } = useGSTCodes();
  const { data: itemGroupsResult } = useItemGroups();
  const createMutation = useCreateItem();
  const updateMutation = useUpdateItem();
  const deleteMutation = useDeleteItem();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [categoryOptionsState, setCategoryOptionsState] = useState<{ value: string; label: string }[]>([]);
  const [stockByItemId, setStockByItemId] = useState<Record<string, number>>({});

  const items = result?.data ?? [];
  const columns: MasterColumnDef<ItemRow>[] = useMemo(() => ([
    { key: "code", label: "Code", width: "100px" },
    { key: "name", label: "Item / Material", render: (row) => <span className="font-medium text-gray-900">{row.name}</span> },
    { key: "itemType", label: "Type", width: "130px", render: (row) => row.itemType ? row.itemType : "—" },
    { key: "category", label: "Category", render: (row) => row.category?.trim() ? row.category : (row.groupName || "—") },
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
    {
      key: "currentStock",
      label: "Current Stock",
      width: "160px",
      render: (row) => (
        <StockPinCell
          itemId={row.id}
          currentStock={(() => {
            const v = stockByItemId[row.id];
            const n = typeof v === "number" ? v : 0;
            return Number.isFinite(n) ? n : 0;
          })()}
        />
      ),
    },
    { key: "hsnCode", label: "HSN", width: "100px" },
    { key: "gstRate", label: "GST %", width: "80px", render: (row) => row.gstRate ? `${row.gstRate}%` : "—" },
    { key: "standardRate", label: "Std. Rate", render: (row) => row.standardRate ? `₹ ${Number(row.standardRate).toLocaleString("en-IN")}` : "—" },
    { key: "minStockLevel", label: "Min Stock", render: (row) => row.minStockLevel ?? "—" },
    { key: "status", label: "Status", type: "status" },
  ]), [stockByItemId]);

  useEffect(() => {
    const ids = (items ?? []).map((i) => i.id).filter(Boolean);
    if (ids.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        // POST + body — the GET variant blew past the URL length limit
        // (HTTP 431) once the Items master crossed a few hundred rows.
        const res = await fetch(`/api/store/items-stock`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemIds: ids }),
        });
        const json = await res.json();
        if (!res.ok) return;
        if (cancelled) return;
        const raw = json?.data && typeof json.data === "object" ? json.data : {};
        const next: Record<string, number> = {};
        for (const [k, v] of Object.entries(raw)) {
          const n =
            typeof v === "number"
              ? v
              : typeof v === "string"
              ? Number(v)
              : 0;
          next[k] = Number.isFinite(n) ? n : 0;
        }
        setStockByItemId(next);
      } catch {
        // ignore
      }
    })();
    return () => { cancelled = true; };
  }, [items]);

  useEffect(() => {
    const rows = result?.data ?? [];
    const fromItems = Array.isArray(rows)
      ? rows
          .map((r) => String(r?.category ?? "").trim())
          .filter(Boolean)
      : [];
    const groups = (itemGroupsResult?.data ?? [])
      .filter(
        (g: { status?: string }) =>
          g.status !== "inactive" && g.status !== "deleted",
      )
      .map((g: { name?: string }) => String(g.name ?? "").trim())
      .filter(Boolean);
    const merged = Array.from(new Set([...fromItems, ...groups]))
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
      .map((c) => ({ value: c, label: c }));
    setCategoryOptionsState(merged);
  }, [result?.data, itemGroupsResult?.data]);

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
        (u) =>
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
    } catch (err: unknown) {
      return { ok: false as const, error: toErrorMessage(err, "Failed to create item") };
    }
  };

  const set = (key: string, val: string | string[]) => {
    setForm(prev => ({ ...prev, [key]: val }) as ItemForm);
    if (errors[key]) setErrors(prev => { const next = { ...prev }; delete next[key]; return next; });
  };

  const uomOptions = (uomResult?.data ?? []).map((u) => ({ value: u.id, label: `${u.code} — ${u.name}` }));

  const normalizeCategory = (v: string) => v.trim().toLowerCase();

  const effectiveCategoryOptions = (() => {
    const base = categoryOptionsState;
    const current = form.category?.trim() ?? "";
    if (!current) return base;
    const exists = base.some((o) => normalizeCategory(o.value) === normalizeCategory(current));
    if (exists) return base;
    // Preserve edit-mode values even if they weren't in the defaults.
    return [{ value: current, label: current }, ...base];
  })();

  const handleHSNChange = (hsn: string) => {
    set("hsnCode", hsn);
    const gstMatch = (gstResult?.data ?? []).find((g) => g.code === hsn);
    if (gstMatch) set("gstRate", String(gstMatch.rate ?? gstMatch.igstRate ?? ""));
  };

  const onCategoryChange = (v: string) => {
    const mapped = findGstForItemCategory(
      v,
      (gstResult?.data ?? []) as GstRow[],
      itemGroupsResult?.data ?? [],
    );
    setForm((prev) => ({
      ...prev,
      category: v,
      ...(mapped
        ? { hsnCode: mapped.code, gstRate: mapped.rate }
        : { hsnCode: "", gstRate: "" }),
    }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next.category;
      delete next.hsnCode;
      delete next.gstRate;
      return next;
    });
  };

  const loadFormFromRow = (item: ItemRow) => {
    const uomIds: string[] = Array.isArray(item.uomIds) && item.uomIds.length
      ? item.uomIds
      : (item.uomId ? [item.uomId] : []);
    setEditingId(item.id);
    setErrors({});
    setForm({
      code: item.code ?? "",
      name: item.name ?? "",
      itemType: item.itemType ?? "",
      category: item.category ?? item.groupName ?? "",
      uomIds,
      hsnCode: item.hsnCode ?? "",
      gstRate: item.gstRate != null ? String(item.gstRate) : "",
      standardRate: item.standardRate != null ? String(item.standardRate) : "",
      specifications: item.specifications ?? "",
      minStockLevel: item.minStockLevel != null ? String(item.minStockLevel) : "0",
      reorderLevel: item.reorderLevel != null ? String(item.reorderLevel) : "0",
      status: item.status ?? "active",
    });
  };

  const closeDrawer = () => { setDrawerOpen(false); setEditingId(null); setForm(emptyForm); setErrors({}); };

  const handleDelete = async (item: ItemRow) => {
    await deleteMutation.mutateAsync(item.id);
  };

  const handleSubmit = async () => {
    const errs = validateForm(form, rules);
    if (Object.keys(errs).length) { setErrors(errs); return; }
    // Denormalize UOM selection: keep full array under `uomIds`, and also
    // write the first pick into `uomId`/`uomCode` for backward compat with
    // readers/columns that still expect a single UOM string.
    const primaryUom = (uomResult?.data ?? []).find((u) => u.id === form.uomIds[0]);
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
    } catch { /* error toast handled globally */ }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <>
      <MasterListPage
        title="Items / Materials"
        entityName="Item"
        permissionUrl="/masters/items"
        columns={columns}
        data={(result?.data ?? []) as ItemRow[]}
        total={result?.total ?? 0}
        isLoading={isLoading}
        historyEntityType="item"
        onAdd={() => { setForm(emptyForm); setErrors({}); setEditingId(null); setDrawerOpen(true); }}
        onEdit={(item) => {
          loadFormFromRow(item);
          setDrawerOpen(true);
        }}
        onDelete={handleDelete}
        onImport={() => setImportOpen(true)}
        deleteConfirmMessage={(item) => (
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

      <FormDrawer key={editingId ?? "new"} open={drawerOpen} onClose={closeDrawer}
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
              <SelectInput
                value={form.itemType}
                onChange={(v) => set("itemType", v)}
                options={ITEM_TYPE_OPTIONS}
                placeholder="Select item type"
                invalid={!!errors.itemType}
              />
            </Field>
            <Field label="Category" required error={errors.category}>
              <SelectInput
                value={form.category}
                onChange={onCategoryChange}
                options={effectiveCategoryOptions}
                placeholder="Select category"
                searchable={effectiveCategoryOptions.length >= 8}
                invalid={!!errors.category}
              />
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
            <Field
              label="HSN Code"
              hint="Filled from Category when a GST code row links to that item group (Masters › GST). Otherwise enter HSN to fetch rate."
              error={errors.hsnCode}
            >
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
            <Field label="Reorder Level" hint="Trigger procurement when stock falls below" error={errors.reorderLevel}>
              <NumberInput value={form.reorderLevel} onChange={v => set("reorderLevel", v)} min={0} invalid={!!errors.reorderLevel} />
            </Field>
            <Field label="Minimum Stock Level" hint="Alert when below this" error={errors.minStockLevel}>
              <NumberInput value={form.minStockLevel} onChange={v => set("minStockLevel", v)} min={0} invalid={!!errors.minStockLevel} />
            </Field>
          </FormRow>
        </FormSection>
        <FormSection title="Status">
          <Field label="Status">
            <SelectInput value={form.status} onChange={v => set("status", v)} options={STATUS_OPTIONS} />
            {form.status === "inactive" && <InactiveStatusNotice entityName="Item" />}
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
