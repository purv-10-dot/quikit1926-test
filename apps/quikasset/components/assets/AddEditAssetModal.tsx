"use client"

import { useState, useEffect } from "react"
import { X, ChevronDown, Upload, Clock } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Asset, BaseCategory, Category } from "@/types/asset"

const ASSET_TYPES = ["Fixed", "Consumable"]
const CONDITIONS = ["New", "Good", "Fair", "Poor", "Damaged"]

interface Props {
  asset?: Asset
  onClose: () => void
  onSave: (data: Omit<Asset, "id" | "createdAt" | "updatedAt" | "baseCategory" | "category">) => Promise<void>
}

type FormData = {
  warehouse: string
  assetType: string
  baseCategoryId: string
  categoryId: string
  itemName: string
  itemCode: string
  serialNumber: string
  invoiceNumber: string
  price: string
  purchaseDate: string
  location: string
  condition: string
  warrantyEndDate: string
  description: string
  assetStatus: Asset["assetStatus"]
}

function Field({ label, required, error, children }: { label: string; required?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-gray-600">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {error && <p className="text-[10px] text-red-500">{error}</p>}
    </div>
  )
}

export default function AddEditAssetModal({ asset, onClose, onSave }: Props) {
  const [form, setForm] = useState<FormData>({
    warehouse: asset?.warehouse ?? "",
    assetType: asset?.assetType ?? "",
    baseCategoryId: asset?.baseCategoryId ?? "",
    categoryId: asset?.categoryId ?? "",
    itemName: asset?.itemName ?? "",
    itemCode: asset?.itemCode ?? "",
    serialNumber: asset?.serialNumber ?? "",
    invoiceNumber: asset?.invoiceNumber ?? "",
    price: asset?.price != null ? String(asset.price) : "",
    purchaseDate: asset?.purchaseDate ?? "",
    location: asset?.location ?? "",
    condition: asset?.condition ?? "",
    warrantyEndDate: asset?.warrantyEndDate ?? "",
    description: asset?.description ?? "",
    assetStatus: asset?.assetStatus ?? "Available",
  })
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({})
  const [saving, setSaving] = useState(false)
  const [baseCategories, setBaseCategories] = useState<BaseCategory[]>([])
  const [categories, setCategories] = useState<Category[]>([])

  useEffect(() => {
    fetch("/api/base-categories").then((r) => r.json()).then((j) => setBaseCategories(j.data ?? []))
  }, [])

  useEffect(() => {
    if (!form.baseCategoryId) { setCategories([]); return }
    fetch(`/api/categories?baseCategoryId=${form.baseCategoryId}`)
      .then((r) => r.json()).then((j) => setCategories(j.data ?? []))
  }, [form.baseCategoryId])

  function set(field: keyof FormData, value: string) {
    setForm((f) => ({ ...f, [field]: value }))
    setErrors((e) => ({ ...e, [field]: "" }))
  }

  function validate() {
    const e: typeof errors = {}
    if (!form.assetType)           e.assetType      = "Required"
    if (!form.baseCategoryId)      e.baseCategoryId = "Required"
    if (!form.categoryId)          e.categoryId     = "Required"
    if (!form.itemName.trim())     e.itemName       = "Required"
    if (!form.itemCode.trim())     e.itemCode       = "Required"
    if (!form.serialNumber.trim()) e.serialNumber   = "Required"
    if (!form.invoiceNumber.trim())e.invoiceNumber  = "Required"
    if (!form.purchaseDate)        e.purchaseDate   = "Required"
    if (!form.location.trim())     e.location       = "Required"
    if (!form.condition)           e.condition      = "Required"
    if (!form.description.trim())  e.description    = "Required"
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit() {
    if (!validate()) return
    setSaving(true)
    await onSave({
      warehouse: form.warehouse || null,
      assetType: form.assetType,
      baseCategoryId: form.baseCategoryId,
      categoryId: form.categoryId,
      itemName: form.itemName,
      itemCode: form.itemCode,
      serialNumber: form.serialNumber,
      invoiceNumber: form.invoiceNumber,
      price: form.price ? parseFloat(form.price) : null,
      purchaseDate: form.purchaseDate,
      location: form.location,
      condition: form.condition,
      warrantyEndDate: form.warrantyEndDate || null,
      description: form.description,
      assetStatus: form.assetStatus,
    })
    setSaving(false)
  }

  const inputCls = (err?: string) => cn(
    "w-full px-3 py-2 text-xs border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-400 bg-white",
    err ? "border-red-300" : "border-gray-200"
  )

  const selectCls = (err?: string, empty?: boolean) => cn(
    "w-full px-3 py-2 text-xs border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-400 bg-white appearance-none",
    err ? "border-red-300" : "border-gray-200",
    empty ? "text-gray-400" : "text-gray-800"
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">{asset ? "Edit Asset" : "Add Asset"}</h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="grid grid-cols-4 gap-4">

            {/* Row 1 */}
            <Field label="Select Warehouse" error={errors.warehouse}>
              <input value={form.warehouse} onChange={(e) => set("warehouse", e.target.value)}
                placeholder="Warehouse" className={inputCls(errors.warehouse)} />
            </Field>

            <Field label="Asset Type" required error={errors.assetType}>
              <div className="relative">
                <select value={form.assetType} onChange={(e) => set("assetType", e.target.value)}
                  className={selectCls(errors.assetType, !form.assetType)}>
                  <option value="">Select Asset Type</option>
                  {ASSET_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              </div>
            </Field>

            <Field label="Base Category" required error={errors.baseCategoryId}>
              <div className="relative">
                <select value={form.baseCategoryId}
                  onChange={(e) => { set("baseCategoryId", e.target.value); set("categoryId", "") }}
                  className={selectCls(errors.baseCategoryId, !form.baseCategoryId)}>
                  <option value="">Select Base Category</option>
                  {baseCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              </div>
            </Field>

            <Field label="Category" required error={errors.categoryId}>
              <div className="relative">
                <select value={form.categoryId} onChange={(e) => set("categoryId", e.target.value)}
                  disabled={!form.baseCategoryId}
                  className={cn(selectCls(errors.categoryId, !form.categoryId), !form.baseCategoryId && "opacity-50 cursor-not-allowed")}>
                  <option value="">Select Category</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              </div>
            </Field>

            {/* Row 2 */}
            <Field label="Item Name" required error={errors.itemName}>
              <input value={form.itemName} onChange={(e) => set("itemName", e.target.value)}
                placeholder="Item Name" className={inputCls(errors.itemName)} />
            </Field>

            <Field label="Item Code" required error={errors.itemCode}>
              <input value={form.itemCode} onChange={(e) => set("itemCode", e.target.value)}
                placeholder="Item Code" className={inputCls(errors.itemCode)} />
            </Field>

            <Field label="Serial Number" required error={errors.serialNumber}>
              <input value={form.serialNumber} onChange={(e) => set("serialNumber", e.target.value)}
                placeholder="Serial Number" className={inputCls(errors.serialNumber)} />
            </Field>

            <Field label="Invoice Number" required error={errors.invoiceNumber}>
              <input value={form.invoiceNumber} onChange={(e) => set("invoiceNumber", e.target.value)}
                placeholder="Invoice Number" className={inputCls(errors.invoiceNumber)} />
            </Field>

            {/* Invoice / Receipt upload — UI-only placeholder.
                The storage backend (cloud upload) lands in a later pass; this control is
                intentionally disabled so nothing is captured, transmitted, or persisted yet. */}
            <div className="col-span-4">
              <div className="flex items-center gap-2 mb-1">
                <label className="text-xs font-semibold text-gray-600">Invoice / Receipt</label>
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-600">
                  <Clock className="w-3 h-3" /> Coming soon
                </span>
              </div>
              <div
                aria-disabled="true"
                title="Invoice / receipt upload will be enabled in a later update"
                className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 p-6 opacity-60 cursor-not-allowed select-none"
              >
                <input type="file" disabled className="hidden" />
                <Upload className="w-8 h-8 text-gray-300 mb-2" />
                <p className="text-xs font-semibold text-gray-500">Invoice / receipt upload coming soon</p>
                <p className="text-[10px] text-gray-400 mt-1">File attachments will be enabled in a later update</p>
              </div>
            </div>

            {/* Row 3 */}
            <Field label="Price" error={errors.price}>
              <input value={form.price} onChange={(e) => set("price", e.target.value)}
                placeholder="Price" type="number" min="0" step="0.01" className={inputCls(errors.price)} />
            </Field>

            <Field label="Purchase Date" required error={errors.purchaseDate}>
              <input value={form.purchaseDate} onChange={(e) => set("purchaseDate", e.target.value)}
                type="date" className={inputCls(errors.purchaseDate)} />
            </Field>

            <Field label="Location" required error={errors.location}>
              <input value={form.location} onChange={(e) => set("location", e.target.value)}
                placeholder="Location" className={inputCls(errors.location)} />
            </Field>

            <Field label="Condition" required error={errors.condition}>
              <div className="relative">
                <select value={form.condition} onChange={(e) => set("condition", e.target.value)}
                  className={selectCls(errors.condition, !form.condition)}>
                  <option value="">Select Condition</option>
                  {CONDITIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              </div>
            </Field>

            {/* Row 4 */}
            <Field label="Warranty End Date">
              <input value={form.warrantyEndDate} onChange={(e) => set("warrantyEndDate", e.target.value)}
                type="date" className={inputCls()} />
            </Field>

            <div className="col-span-3">
              <Field label="Description" required error={errors.description}>
                <textarea value={form.description} onChange={(e) => set("description", e.target.value)}
                  placeholder="Description" rows={3}
                  className={cn(inputCls(errors.description), "resize-none")} />
              </Field>
            </div>

          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-200 rounded-lg transition-colors">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={saving}
            className="px-6 py-2 text-xs font-semibold bg-accent-600 text-white rounded-lg hover:bg-accent-700 disabled:opacity-50 transition-colors">
            {saving ? "Saving…" : asset ? "Save Changes" : "Add Asset"}
          </button>
        </div>
      </div>
    </div>
  )
}
