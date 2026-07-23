"use client"

import { useState, useEffect } from "react"
import { X, ChevronDown, Upload, FileText, Download, Trash2, AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"
import { MAX_BULK_QUANTITY, findIntraBatchDuplicate } from "@/lib/api/assetBulk"
import type { Asset, BaseCategory, Category } from "@/types/asset"

const CONDITIONS = ["New", "Good", "Fair", "Poor", "Damaged"]

// Client-side mirror of lib/api/invoiceStorage limits (that module is server-only
// — it imports fs — so the constants are duplicated here for pre-upload checks).
const MAX_INVOICE_MB = 10
const ALLOWED_INVOICE_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp", "image/gif"]
const INVOICE_ACCEPT = ALLOWED_INVOICE_TYPES.join(",")

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

interface Props {
  asset?: Asset
  onClose: () => void
  /** Persists the asset (create/update) and returns the saved row, or null on failure. */
  onSave: (data: Omit<Asset, "id" | "createdAt" | "updatedAt" | "baseCategory" | "category">) => Promise<Asset | null>
  /** Called after the full save (incl. invoice upload) succeeds; `warning` set if the
   *  asset saved but the invoice step failed. Parent closes + refreshes the list. */
  onSaved: (warning?: string) => void
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

export default function AddEditAssetModal({ asset, onClose, onSave, onSaved }: Props) {
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
  // Invoice/receipt attachment. `existingName` reflects a file already on the
  // asset (edit); `removeExisting` marks it for deletion on save.
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null)
  const [invoiceErr, setInvoiceErr] = useState("")
  const [existingName, setExistingName] = useState<string | null>(asset?.invoiceFileName ?? null)
  const [removeExisting, setRemoveExisting] = useState(false)
  // Bulk create (Add flow only). `quantity` sizes the per-unit list; unit 1 uses
  // form.itemCode/serialNumber, units 2..N live in `extraUnits`.
  const isEdit = !!asset
  const [quantity, setQuantity] = useState(1)
  const [extraUnits, setExtraUnits] = useState<{ itemCode: string; serialNumber: string }[]>([])
  const [bulkError, setBulkError] = useState("")

  function changeQuantity(nRaw: number) {
    const n = Math.max(1, Math.min(MAX_BULK_QUANTITY, Math.floor(nRaw || 1)))
    setQuantity(n)
    setExtraUnits((prev) => {
      const next = prev.slice(0, n - 1)
      while (next.length < n - 1) next.push({ itemCode: "", serialNumber: "" })
      return next
    })
    setBulkError("")
  }

  function setUnit(idx: number, field: "itemCode" | "serialNumber", value: string) {
    setExtraUnits((prev) => prev.map((u, i) => (i === idx ? { ...u, [field]: value } : u)))
    setBulkError("")
  }

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
    if (!form.baseCategoryId)      e.baseCategoryId = "Required"
    if (!form.categoryId)          e.categoryId     = "Required"
    if (!form.itemName.trim())     e.itemName       = "Required"
    // Unit 1's code/serial live in the grid only when quantity === 1; for bulk the
    // per-unit rows are validated below.
    if (quantity === 1) {
      if (!form.itemCode.trim())     e.itemCode     = "Required"
      if (!form.serialNumber.trim()) e.serialNumber = "Required"
    }
    if (!form.invoiceNumber.trim())e.invoiceNumber  = "Required"
    if (!form.purchaseDate)        e.purchaseDate   = "Required"
    if (!form.location.trim())     e.location       = "Required"
    if (!form.condition)           e.condition      = "Required"
    if (!form.price.trim())        e.price          = "Required"
    else if (isNaN(Number(form.price)) || Number(form.price) < 0) e.price = "Enter a valid price"
    setErrors(e)
    if (Object.keys(e).length > 0) return false

    if (quantity > 1) {
      const allUnits = [{ itemCode: form.itemCode, serialNumber: form.serialNumber }, ...extraUnits]
      const missing = allUnits.findIndex((u) => !u.itemCode.trim() || !u.serialNumber.trim())
      if (missing >= 0) {
        setBulkError(`Unit ${missing + 1} needs both an Item Code and a Serial Number.`)
        return false
      }
      const dup = findIntraBatchDuplicate(allUnits)
      if (dup) {
        const label = dup.field === "itemCode" ? "Item Code" : "Serial Number"
        setBulkError(`${label} "${dup.value}" is duplicated in units ${dup.rows.join(" & ")}.`)
        return false
      }
    }
    return true
  }

  function pickInvoice(file: File | null) {
    setInvoiceErr("")
    if (!file) { setInvoiceFile(null); return }
    if (!ALLOWED_INVOICE_TYPES.includes(file.type)) {
      setInvoiceErr("Only PDF or image files (PNG, JPG, WEBP, GIF) are allowed")
      return
    }
    if (file.size > MAX_INVOICE_MB * 1024 * 1024) {
      setInvoiceErr(`File exceeds the ${MAX_INVOICE_MB}MB limit`)
      return
    }
    setInvoiceFile(file)
    setRemoveExisting(false)
  }

  async function handleBulkSubmit() {
    const units = [
      { itemCode: form.itemCode.trim(), serialNumber: form.serialNumber.trim() },
      ...extraUnits.map((u) => ({ itemCode: u.itemCode.trim(), serialNumber: u.serialNumber.trim() })),
    ]
    const shared = {
      warehouse: form.warehouse || null,
      baseCategoryId: form.baseCategoryId,
      categoryId: form.categoryId,
      itemName: form.itemName,
      invoiceNumber: form.invoiceNumber,
      price: parseFloat(form.price),
      purchaseDate: form.purchaseDate,
      location: form.location,
      condition: form.condition,
      warrantyEndDate: form.warrantyEndDate || null,
      description: form.description,
    }
    try {
      const res = await fetch("/api/assets/bulk", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ shared, units }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) { setBulkError(json.error ?? "Failed to create assets"); setSaving(false); return }
      const created: Asset[] = json.data ?? []

      // Attach the shared invoice to every created unit (best-effort).
      let invoiceWarn = false
      if (invoiceFile) {
        for (const a of created) {
          const fd = new FormData()
          fd.append("file", invoiceFile)
          const r = await fetch(`/api/assets/${a.id}/invoice`, { method: "POST", body: fd })
          if (!r.ok) invoiceWarn = true
        }
      }
      setSaving(false)
      onSaved(invoiceWarn
        ? `${created.length} assets created, but the invoice couldn't attach to all of them — edit individual assets to retry.`
        : undefined)
    } catch {
      setBulkError("Failed to create assets")
      setSaving(false)
    }
  }

  async function handleSubmit() {
    if (!validate()) return
    setSaving(true)
    if (quantity > 1) { await handleBulkSubmit(); return }
    const saved = await onSave({
      warehouse: form.warehouse || null,
      assetType: form.assetType,
      baseCategoryId: form.baseCategoryId,
      categoryId: form.categoryId,
      itemName: form.itemName,
      itemCode: form.itemCode,
      serialNumber: form.serialNumber,
      invoiceNumber: form.invoiceNumber,
      price: parseFloat(form.price),
      purchaseDate: form.purchaseDate,
      location: form.location,
      condition: form.condition,
      warrantyEndDate: form.warrantyEndDate || null,
      description: form.description,
      assetStatus: form.assetStatus,
    })
    if (!saved) { setSaving(false); return } // parent already surfaced the error

    // Attach / replace / remove the invoice against the now-persisted asset.
    try {
      if (invoiceFile) {
        const fd = new FormData()
        fd.append("file", invoiceFile)
        const res = await fetch(`/api/assets/${saved.id}/invoice`, { method: "POST", body: fd })
        if (!res.ok) {
          const j = await res.json().catch(() => ({}))
          setSaving(false)
          // Asset is already saved — close + refresh, but warn the invoice didn't attach
          // (re-submitting here would duplicate the asset on create).
          onSaved(j.error ?? "The asset was saved, but the invoice upload failed. Edit the asset to retry.")
          return
        }
      } else if (removeExisting && asset?.invoiceFileKey) {
        await fetch(`/api/assets/${saved.id}/invoice`, { method: "DELETE" })
      }
    } catch {
      setSaving(false)
      onSaved("The asset was saved, but the invoice upload failed. Edit the asset to retry.")
      return
    }

    setSaving(false)
    onSaved()
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
          {bulkError && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              <span>{bulkError}</span>
            </div>
          )}
          <div className="grid grid-cols-4 gap-4">

            {/* Row 1 */}
            {!isEdit && (
              <Field label="Quantity">
                <input type="number" min={1} max={MAX_BULK_QUANTITY} value={quantity}
                  onChange={(e) => changeQuantity(e.target.valueAsNumber)}
                  className={inputCls()} />
              </Field>
            )}
            {/* "Warehouse" field intentionally hidden — it was an unwired free-text
                placeholder (no Warehouse master exists; "Location" covers placement).
                The column is retained for export/back-compat and existing values are
                preserved on edit via form state. */}
            {/* "Asset Type" now selects the base category (Furniture / IT Equipment).
                The former Fixed/Consumable dropdown was removed as duplicative — the
                assetType column is retained (defaulted server-side) and still backs the
                inventory Type badge/filter/export. */}
            <Field label="Asset Type" required error={errors.baseCategoryId}>
              <div className="relative">
                <select value={form.baseCategoryId}
                  onChange={(e) => { set("baseCategoryId", e.target.value); set("categoryId", "") }}
                  className={selectCls(errors.baseCategoryId, !form.baseCategoryId)}>
                  <option value="">Select Asset Type</option>
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

            {/* Item Code + Serial Number are per-unit; for a bulk batch (quantity > 1)
                they move into the "Unit details" list below and the grid slots hide. */}
            {quantity === 1 && (
              <>
                <Field label="Item Code" required error={errors.itemCode}>
                  <input value={form.itemCode} onChange={(e) => set("itemCode", e.target.value)}
                    placeholder="Item Code" className={inputCls(errors.itemCode)} />
                </Field>

                <Field label="Serial Number" required error={errors.serialNumber}>
                  <input value={form.serialNumber} onChange={(e) => set("serialNumber", e.target.value)}
                    placeholder="Serial Number" className={inputCls(errors.serialNumber)} />
                </Field>
              </>
            )}

            <Field label="Invoice Number" required error={errors.invoiceNumber}>
              <input value={form.invoiceNumber} onChange={(e) => set("invoiceNumber", e.target.value)}
                placeholder="Invoice Number" className={inputCls(errors.invoiceNumber)} />
            </Field>

            {/* Invoice / Receipt upload — stored via the authenticated
                /api/assets/[id]/invoice route (local disk, not a static path). */}
            <div className="col-span-4">
              <label className="text-xs font-semibold text-gray-600 mb-1 block">
                Invoice / Receipt <span className="text-gray-400 font-normal">(PDF or image, max {MAX_INVOICE_MB}MB)</span>
              </label>

              {invoiceFile ? (
                // A newly-picked file, staged for upload on save.
                <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                  <FileText className="w-4 h-4 text-accent-500 flex-shrink-0" />
                  <span className="flex-1 truncate text-xs text-gray-700">{invoiceFile.name}</span>
                  <span className="text-[10px] text-gray-400">{fmtSize(invoiceFile.size)}</span>
                  <button type="button" onClick={() => setInvoiceFile(null)} title="Remove"
                    className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : existingName && !removeExisting ? (
                // An invoice already attached to this asset (edit mode).
                <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
                  <FileText className="w-4 h-4 text-accent-500 flex-shrink-0" />
                  <span className="flex-1 truncate text-xs text-gray-700">{existingName}</span>
                  {asset && (
                    <a href={`/api/assets/${asset.id}/invoice?download=1`} title="Download"
                      className="p-1 text-gray-400 hover:text-accent-600 hover:bg-accent-50 rounded transition-colors">
                      <Download className="w-3.5 h-3.5" />
                    </a>
                  )}
                  <button type="button" onClick={() => { setRemoveExisting(true); setExistingName(null) }} title="Remove"
                    className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-gray-50 p-6 cursor-pointer hover:border-accent-300 hover:bg-accent-50/30 transition-colors">
                  <input type="file" accept={INVOICE_ACCEPT} className="hidden"
                    onChange={(e) => pickInvoice(e.target.files?.[0] ?? null)} />
                  <Upload className="w-8 h-8 text-gray-300 mb-2" />
                  <p className="text-xs font-semibold text-gray-600">Click to upload invoice / receipt</p>
                  <p className="text-[10px] text-gray-400 mt-1">PDF, PNG, JPG, WEBP or GIF · up to {MAX_INVOICE_MB}MB</p>
                </label>
              )}
              {invoiceErr && <p className="text-[10px] text-red-500 mt-1">{invoiceErr}</p>}
            </div>

            {/* Row 3 */}
            <Field label="Price" required error={errors.price}>
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
              <Field label="Description" error={errors.description}>
                <textarea value={form.description} onChange={(e) => set("description", e.target.value)}
                  placeholder="Description" rows={3}
                  className={cn(inputCls(errors.description), "resize-none")} />
              </Field>
            </div>

            {/* Per-unit rows for a bulk batch — each needs a unique Item Code + Serial No. */}
            {quantity > 1 && (
              <div className="col-span-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <label className="text-xs font-semibold text-gray-600">
                    Unit details <span className="text-gray-400 font-normal">({quantity})</span>
                  </label>
                  <span className="text-[10px] text-gray-400">Fields above are shared — each unit needs a unique Item Code &amp; Serial Number.</span>
                </div>
                <div className="max-h-64 space-y-2 overflow-y-auto rounded-lg border border-gray-200 p-2">
                  {Array.from({ length: quantity }).map((_, i) => {
                    const isFirst = i === 0
                    const code = isFirst ? form.itemCode : (extraUnits[i - 1]?.itemCode ?? "")
                    const serial = isFirst ? form.serialNumber : (extraUnits[i - 1]?.serialNumber ?? "")
                    const onCode = (v: string) => { isFirst ? set("itemCode", v) : setUnit(i - 1, "itemCode", v); setBulkError("") }
                    const onSerial = (v: string) => { isFirst ? set("serialNumber", v) : setUnit(i - 1, "serialNumber", v); setBulkError("") }
                    return (
                      <div key={i} className="flex items-center gap-2">
                        <span className="w-12 flex-shrink-0 text-[10px] font-semibold text-gray-400">Unit {i + 1}</span>
                        <input value={code} onChange={(e) => onCode(e.target.value)}
                          placeholder="Item Code" className={inputCls()} />
                        <input value={serial} onChange={(e) => onSerial(e.target.value)}
                          placeholder="Serial Number" className={inputCls()} />
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-200 rounded-lg transition-colors">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={saving}
            className="px-6 py-2 text-xs font-semibold bg-accent-600 text-white rounded-lg hover:bg-accent-700 disabled:opacity-50 transition-colors">
            {saving ? "Saving…" : asset ? "Save Changes" : quantity > 1 ? `Add ${quantity} Assets` : "Add Asset"}
          </button>
        </div>
      </div>
    </div>
  )
}
