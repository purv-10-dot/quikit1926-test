"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { DynamicFieldInput } from "@/components/leads/dynamic-field-input";
import type { LeadFieldDefinition } from "@/types/field-definition";
import type { ProductFieldDefinition } from "@/types/product-field-definition";
import type { SerializedProduct } from "@/lib/services/products/serialize";

/** Minimal row from list — full record fetched on edit. */
export interface ProductRow {
  id: string;
  name: string;
  sku: string;
  category?: string | null;
  categoryName?: string | null;
  hsnCode: string | null;
  unitGroup: string;
  defaultUnit: string;
  listPrice: number;
  currency: string;
  gstRate: number;
  productType: "Product" | "Service" | "Bundle";
  isActive: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  product: ProductRow | null;
}

interface TaxonomyOption {
  id: string;
  name: string;
  kind: string;
  parentId: string | null;
}

const GST_RATES = [0, 5, 12, 18, 28] as const;
const PRODUCT_TYPES = ["Product", "Service", "Bundle"] as const;

const UNITS_BY_TYPE: Record<"Product" | "Service" | "Bundle", readonly string[]> = {
  Product: ["Each", "Box", "Kg", "Litre", "Metre", "Pack"],
  Service: ["Day", "Hour", "Week", "Month", "Sprint", "Project"],
  Bundle: ["Each", "Pack", "Subscription"],
};
const DEFAULT_UNIT_BY_TYPE: Record<"Product" | "Service" | "Bundle", string> = {
  Product: "Each",
  Service: "Day",
  Bundle: "Each",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3 rounded-lg border border-crm-border p-4">
      <legend className="px-1 text-sm font-semibold text-crm-text">{title}</legend>
      {children}
    </fieldset>
  );
}

export function ProductFormModal({ open, onClose, onSaved, product }: Props) {
  const isEdit = !!product;
  const [loading, setLoading] = useState(false);
  const [taxonomy, setTaxonomy] = useState<TaxonomyOption[]>([]);
  const [customDefs, setCustomDefs] = useState<ProductFieldDefinition[]>([]);

  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [barcode, setBarcode] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [familyId, setFamilyId] = useState("");
  const [categoryLegacy, setCategoryLegacy] = useState("");
  const [hsnCode, setHsnCode] = useState("");
  const [sacCode, setSacCode] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [listPrice, setListPrice] = useState("");
  const [standardCost, setStandardCost] = useState("");
  const [gstRate, setGstRate] = useState<number>(18);
  const [interstate, setInterstate] = useState(false);
  const [productType, setProductType] = useState<"Product" | "Service" | "Bundle">("Product");
  const [unit, setUnit] = useState<string>("Each");
  const [manufacturer, setManufacturer] = useState("");
  const [warrantyMonths, setWarrantyMonths] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [lengthCm, setLengthCm] = useState("");
  const [widthCm, setWidthCm] = useState("");
  const [heightCm, setHeightCm] = useState("");
  const [serialTracked, setSerialTracked] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [dynValues, setDynValues] = useState<Record<string, unknown>>({});

  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const categories = useMemo(
    () => taxonomy.filter((t) => t.kind === "Category"),
    [taxonomy],
  );
  const subcategories = useMemo(
    () => taxonomy.filter((t) => t.kind === "Subcategory" && t.parentId === categoryId),
    [taxonomy, categoryId],
  );
  const brands = useMemo(() => taxonomy.filter((t) => t.kind === "Brand"), [taxonomy]);
  const families = useMemo(() => taxonomy.filter((t) => t.kind === "Family"), [taxonomy]);

  const applyRecord = useCallback((p: SerializedProduct) => {
    setName(p.name);
    setSku(p.sku);
    setBarcode(p.barcode ?? "");
    setDescription(p.description ?? "");
    setCategoryId(p.categoryId ?? "");
    setSubcategoryId(p.subcategoryId ?? "");
    setBrandId(p.brandId ?? "");
    setFamilyId(p.familyId ?? "");
    setCategoryLegacy(p.category ?? "");
    setHsnCode(p.hsnCode ?? "");
    setSacCode(p.sacCode ?? "");
    setTagsText((p.tags ?? []).join(", "));
    setListPrice(String(p.listPrice));
    setStandardCost(p.standardCost != null ? String(p.standardCost) : "");
    setGstRate(p.gstRate);
    setInterstate(p.igstRate > 0 && p.cgstRate === 0);
    setProductType(p.productType);
    setUnit(p.defaultUnit ?? DEFAULT_UNIT_BY_TYPE[p.productType]);
    setManufacturer(p.manufacturer ?? "");
    setWarrantyMonths(p.warrantyMonths != null ? String(p.warrantyMonths) : "");
    setWeightKg(p.weightKg != null ? String(p.weightKg) : "");
    setLengthCm(p.lengthCm != null ? String(p.lengthCm) : "");
    setWidthCm(p.widthCm != null ? String(p.widthCm) : "");
    setHeightCm(p.heightCm != null ? String(p.heightCm) : "");
    setSerialTracked(p.serialTracked);
    setIsActive(p.isActive);
    setDynValues((p.dynamicFields as Record<string, unknown>) ?? {});
  }, []);

  const resetCreate = useCallback(() => {
    setName("");
    setSku("");
    setBarcode("");
    setDescription("");
    setCategoryId("");
    setSubcategoryId("");
    setBrandId("");
    setFamilyId("");
    setCategoryLegacy("");
    setHsnCode("");
    setSacCode("");
    setTagsText("");
    setListPrice("");
    setStandardCost("");
    setGstRate(18);
    setInterstate(false);
    setProductType("Product");
    setUnit("Each");
    setManufacturer("");
    setWarrantyMonths("");
    setWeightKg("");
    setLengthCm("");
    setWidthCm("");
    setHeightCm("");
    setSerialTracked(false);
    setIsActive(true);
    setDynValues({});
  }, []);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setFieldErrors({});
    setSubmitting(false);

    void Promise.all([
      fetch("/api/products/taxonomy", { credentials: "include" })
        .then((r) => r.json())
        .then((j) => setTaxonomy(Array.isArray(j?.data) ? j.data : [])),
      fetch("/api/settings/product-fields?customOnly=true", { credentials: "include" })
        .then((r) => r.json())
        .then((j) => setCustomDefs(Array.isArray(j?.items) ? j.items : [])),
    ]);

    if (product?.id) {
      setLoading(true);
      void fetch(`/api/products/${product.id}`, { credentials: "include" })
        .then((r) => r.json())
        .then((j) => {
          if (j?.success && j.data) applyRecord(j.data as SerializedProduct);
          else applyRecord({
            ...product,
            category: product.category ?? null,
            categoryId: null,
            subcategoryId: null,
            brandId: null,
            familyId: null,
            barcode: null,
            sacCode: null,
            tags: [],
            standardCost: null,
            cgstRate: product.gstRate / 2,
            sgstRate: product.gstRate / 2,
            igstRate: 0,
            manufacturer: null,
            warrantyMonths: null,
            weightKg: null,
            lengthCm: null,
            widthCm: null,
            heightCm: null,
            serialTracked: false,
            dynamicFields: null,
            description: null,
            imageUrl: null,
            deletedAt: null,
            createdAt: "",
            updatedAt: "",
            categoryName: product.categoryName ?? product.category ?? null,
            subcategoryName: null,
            brandName: null,
            familyName: null,
          });
        })
        .finally(() => setLoading(false));
    } else {
      resetCreate();
      setLoading(false);
    }
  }, [open, product, applyRecord, resetCreate]);

  useEffect(() => {
    if (!categoryId && subcategoryId) setSubcategoryId("");
  }, [categoryId, subcategoryId]);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    setFieldErrors({});

    const priceNum = Number(listPrice);
    const tags = tagsText
      .split(/[,;]+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 20);

    const body: Record<string, unknown> = {
      name: name.trim(),
      sku: sku.trim(),
      listPrice: Number.isFinite(priceNum) ? priceNum : -1,
      gstRate,
      productType,
      unitGroup: unit,
      defaultUnit: unit,
      isActive,
      serialTracked,
      tags,
    };

    if (barcode.trim()) body.barcode = barcode.trim();
    if (description.trim()) body.description = description.trim();
    if (categoryId) body.categoryId = categoryId;
    if (subcategoryId) body.subcategoryId = subcategoryId;
    if (brandId) body.brandId = brandId;
    if (familyId) body.familyId = familyId;
    if (categoryLegacy.trim()) body.category = categoryLegacy.trim();
    if (hsnCode.trim()) body.hsnCode = hsnCode.trim();
    if (sacCode.trim()) body.sacCode = sacCode.trim();

    const sc = Number(standardCost);
    if (standardCost.trim() && Number.isFinite(sc)) body.standardCost = sc;

    const wm = Number(warrantyMonths);
    if (warrantyMonths.trim() && Number.isFinite(wm)) body.warrantyMonths = wm;

    if (manufacturer.trim()) body.manufacturer = manufacturer.trim();

    for (const key of ["weightKg", "lengthCm", "widthCm", "heightCm"] as const) {
      const val = { weightKg, lengthCm, widthCm, heightCm }[key];
      const n = Number(val);
      if (val.trim() && Number.isFinite(n)) body[key] = n;
    }

    if (interstate) {
      body.igstRate = gstRate;
      body.cgstRate = null;
      body.sgstRate = null;
    } else {
      body.igstRate = null;
    }

    const cleanDyn: Record<string, unknown> = {};
    for (const def of customDefs) {
      const v = dynValues[def.key];
      if (v !== undefined && v !== null && v !== "") cleanDyn[def.key] = v;
    }
    if (Object.keys(cleanDyn).length > 0) body.dynamicFields = cleanDyn;

    try {
      const url = isEdit ? `/api/products/${product!.id}` : "/api/products";
      const method = isEdit ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        if (json.fieldErrors) setFieldErrors(json.fieldErrors);
        throw new Error(json.error ?? "Failed to save product");
      }
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save product");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? "Edit product" : "Add product"}
      width="max-w-3xl"
    >
      {loading ? (
        <p className="py-8 text-center text-sm text-crm-muted">Loading product…</p>
      ) : (
        <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
          <Section title="Basic">
            <Field label="Name" required error={fieldErrors.name}>
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={200} />
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="SKU" required error={fieldErrors.sku}>
                <Input value={sku} onChange={(e) => setSku(e.target.value)} maxLength={50} />
              </Field>
              <Field label="Barcode">
                <Input value={barcode} onChange={(e) => setBarcode(e.target.value)} maxLength={80} />
              </Field>
            </div>
            <Field label="Description">
              <textarea
                className="crm-input min-h-[72px] w-full"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={5000}
              />
            </Field>
            <Field label="Tags" hint="Comma-separated">
              <Input
                value={tagsText}
                onChange={(e) => setTagsText(e.target.value)}
                placeholder="b2b, industrial, export"
              />
            </Field>
          </Section>

          <Section title="Classification">
            <p className="text-xs text-crm-muted">
              Manage options in{" "}
              <Link href="/settings/product-categories" className="text-accent-700 hover:underline">
                Settings → Categories &amp; Brands
              </Link>
              .
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Category">
                <Select
                  value={categoryId}
                  onChange={(e) => {
                    setCategoryId(e.target.value);
                    setSubcategoryId("");
                  }}
                >
                  <option value="">— Select —</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Subcategory">
                <Select
                  value={subcategoryId}
                  onChange={(e) => setSubcategoryId(e.target.value)}
                  disabled={!categoryId || subcategories.length === 0}
                >
                  <option value="">— Select —</option>
                  {subcategories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Brand">
                <Select value={brandId} onChange={(e) => setBrandId(e.target.value)}>
                  <option value="">— Select —</option>
                  {brands.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Product family">
                <Select value={familyId} onChange={(e) => setFamilyId(e.target.value)}>
                  <option value="">— Select —</option>
                  {families.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="Legacy category (text)" hint="Optional — used if taxonomy not set">
              <Input value={categoryLegacy} onChange={(e) => setCategoryLegacy(e.target.value)} maxLength={100} />
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="HSN code">
                <Input value={hsnCode} onChange={(e) => setHsnCode(e.target.value)} maxLength={10} />
              </Field>
              <Field label="SAC code" hint="For services">
                <Input value={sacCode} onChange={(e) => setSacCode(e.target.value)} maxLength={10} />
              </Field>
            </div>
          </Section>

          <Section title="Pricing & GST (India)">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="List price (₹)" required error={fieldErrors.listPrice}>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={listPrice}
                  onChange={(e) => setListPrice(e.target.value)}
                />
              </Field>
              <Field label="Standard cost (₹)" hint="For margin">
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={standardCost}
                  onChange={(e) => setStandardCost(e.target.value)}
                />
              </Field>
              <Field label="GST %" required>
                <Select value={String(gstRate)} onChange={(e) => setGstRate(Number(e.target.value))}>
                  {GST_RATES.map((r) => (
                    <option key={r} value={r}>
                      {r}%
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Type">
                <Select
                  value={productType}
                  onChange={(e) => {
                    const next = e.target.value as typeof productType;
                    setProductType(next);
                    if (!UNITS_BY_TYPE[next].includes(unit)) {
                      setUnit(DEFAULT_UNIT_BY_TYPE[next]);
                    }
                  }}
                >
                  {PRODUCT_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Unit">
                <Select value={unit} onChange={(e) => setUnit(e.target.value)}>
                  {UNITS_BY_TYPE[productType].map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="flex flex-col justify-end gap-2 pb-1">
                <label className="flex items-center gap-2 text-sm text-crm-text">
                  <input
                    type="checkbox"
                    checked={interstate}
                    onChange={(e) => setInterstate(e.target.checked)}
                    className="accent-accent-600"
                  />
                  Interstate supply (IGST {gstRate}%)
                </label>
                <p className="text-xs text-crm-muted">
                  Unchecked → CGST + SGST split ({gstRate / 2}% + {gstRate / 2}%)
                </p>
              </div>
            </div>
          </Section>

          <Section title="B2B / physical">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Manufacturer">
                <Input value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} maxLength={200} />
              </Field>
              <Field label="Warranty (months)">
                <Input
                  type="number"
                  min={0}
                  value={warrantyMonths}
                  onChange={(e) => setWarrantyMonths(e.target.value)}
                />
              </Field>
              <Field label="Weight (kg)">
                <Input
                  type="number"
                  min={0}
                  step="0.001"
                  value={weightKg}
                  onChange={(e) => setWeightKg(e.target.value)}
                />
              </Field>
              <Field label="Dimensions L×W×H (cm)">
                <div className="flex gap-2">
                  <Input
                    type="number"
                    min={0}
                    placeholder="L"
                    value={lengthCm}
                    onChange={(e) => setLengthCm(e.target.value)}
                  />
                  <Input
                    type="number"
                    min={0}
                    placeholder="W"
                    value={widthCm}
                    onChange={(e) => setWidthCm(e.target.value)}
                  />
                  <Input
                    type="number"
                    min={0}
                    placeholder="H"
                    value={heightCm}
                    onChange={(e) => setHeightCm(e.target.value)}
                  />
                </div>
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm text-crm-text">
              <input
                type="checkbox"
                checked={serialTracked}
                onChange={(e) => setSerialTracked(e.target.checked)}
                className="accent-accent-600"
              />
              Serial number tracking
            </label>
          </Section>

          {customDefs.length > 0 && (
            <Section title="Custom fields">
              <p className="text-xs text-crm-muted">
                <Link href="/settings/product-fields" className="text-accent-700 hover:underline">
                  Settings → Product Fields
                </Link>
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {customDefs.map((def) => (
                  <Field key={def.key} label={def.label}>
                    <DynamicFieldInput
                      def={def as unknown as LeadFieldDefinition}
                      value={dynValues[def.key]}
                      onChange={(next) =>
                        setDynValues((prev) => ({ ...prev, [def.key]: next }))
                      }
                    />
                  </Field>
                ))}
              </div>
            </Section>
          )}

          <label className="flex items-center gap-2 text-sm text-crm-text">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="accent-accent-600"
            />
            Active (visible in Quote Builder)
          </label>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-5 flex flex-row-reverse gap-2 border-t border-crm-border pt-4">
        <Button
          onClick={handleSubmit}
          disabled={submitting || loading || !name.trim() || !sku.trim()}
        >
          {submitting ? "Saving…" : isEdit ? "Save changes" : "Add product"}
        </Button>
        <Button variant="secondary" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
      </div>
    </Modal>
  );
}

function Field({
  label,
  required,
  hint,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-crm-text">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-crm-muted">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}
