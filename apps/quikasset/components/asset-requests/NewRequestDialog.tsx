"use client"

import { useEffect, useState } from "react"
import { X, Package, Cloud, ClipboardList } from "lucide-react"
import { cn } from "@/lib/utils"
import SearchableSelect from "@/components/assignments/SearchableSelect"
import type {
  AssetRequestKind,
  AssetRequestType,
  AssetRequestPriority,
} from "@/types/assetRequest"

/** Payload POSTed to /api/asset-requests. */
export type NewRequestPayload = {
  categoryId: string
  itemKind: AssetRequestKind
  requestType: AssetRequestType
  quantity: number
  justification: string
  priority: AssetRequestPriority
  requiredBy: string | null
}

type Category = { id: string; name: string; baseCategory?: { name: string } | null }

interface Props {
  onClose: () => void
  onSubmit: (payload: NewRequestPayload) => Promise<void>
}

const REQUEST_TYPES: AssetRequestType[] = ["New", "Replacement", "Upgrade", "Additional"]
const PRIORITIES: AssetRequestPriority[] = ["Low", "Medium", "High", "Urgent"]

const inputCls = (err?: string) =>
  cn(
    "w-full px-3 py-2 text-xs border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-400 bg-white",
    err ? "border-red-300" : "border-gray-200",
  )

function Field({
  label, required, error, children,
}: {
  label: string; required?: boolean; error?: string; children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-gray-600 flex items-center gap-1">
        {label}
        {required && <span className="text-red-500">*</span>}
      </label>
      {children}
      {error && <p className="text-[10px] text-red-500">{error}</p>}
    </div>
  )
}

/**
 * Employee "Raise a Request" form. Item type is chosen from existing Category
 * Master rows; the API resolves the category name into the request's itemType.
 * Always submits (status Submitted) — there is no Draft step.
 */
export default function NewRequestDialog({ onClose, onSubmit }: Props) {
  const [categories, setCategories] = useState<Category[]>([])
  const [categoryId, setCategoryId] = useState("")
  const [itemKind, setItemKind] = useState<AssetRequestKind>("Physical")
  const [requestType, setRequestType] = useState<AssetRequestType>("New")
  const [quantity, setQuantity] = useState(1)
  const [priority, setPriority] = useState<AssetRequestPriority>("Medium")
  const [requiredBy, setRequiredBy] = useState("")
  const [justification, setJustification] = useState("")
  const [errors, setErrors] = useState<{ categoryId?: string; justification?: string; quantity?: string }>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then((j) => setCategories(j?.data ?? []))
      .catch(() => setCategories([]))
  }, [])

  const categoryOptions = categories.map((c) => ({
    value: c.id,
    label: c.name,
    sublabel: c.baseCategory?.name,
  }))

  function validate() {
    const e: typeof errors = {}
    if (!categoryId) e.categoryId = "Pick an item type"
    if (!justification.trim()) e.justification = "A justification is required"
    if (!Number.isInteger(quantity) || quantity < 1) e.quantity = "Must be at least 1"
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit() {
    if (!validate()) return
    setSaving(true)
    try {
      await onSubmit({
        categoryId,
        itemKind,
        requestType,
        quantity,
        justification: justification.trim(),
        priority,
        requiredBy: requiredBy || null,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-accent-100 flex items-center justify-center flex-shrink-0">
              <ClipboardList className="w-4 h-4 text-accent-600" />
            </div>
            <h2 className="text-sm font-semibold text-gray-900">Raise a Request</h2>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {/* Kind toggle */}
          <div className="grid grid-cols-2 gap-2">
            {(["Physical", "Subscription"] as const).map((k) => {
              const Icon = k === "Subscription" ? Cloud : Package
              const active = itemKind === k
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setItemKind(k)}
                  className={cn(
                    "flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium border rounded-lg transition-colors",
                    active
                      ? "border-accent-300 bg-accent-50 text-accent-700"
                      : "border-gray-200 text-gray-600 hover:bg-gray-50",
                  )}
                >
                  <Icon className="w-3.5 h-3.5" /> {k}
                </button>
              )
            })}
          </div>

          <Field label="Item type" required error={errors.categoryId}>
            <SearchableSelect
              options={categoryOptions}
              value={categoryId}
              onChange={(v) => { setCategoryId(v); setErrors((e) => ({ ...e, categoryId: "" })) }}
              placeholder="Select a category"
              searchPlaceholder="Search categories…"
              error={errors.categoryId}
              columnHeaders={{ label: "Category", sublabel: "Base category" }}
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Request type" required>
              <select
                value={requestType}
                onChange={(e) => setRequestType(e.target.value as AssetRequestType)}
                className={inputCls()}
              >
                {REQUEST_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Quantity" required error={errors.quantity}>
              <input
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => { setQuantity(e.target.valueAsNumber || 0); setErrors((x) => ({ ...x, quantity: "" })) }}
                className={inputCls(errors.quantity)}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Priority" required>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as AssetRequestPriority)}
                className={inputCls()}
              >
                {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>
            <Field label="Required by">
              <input
                type="date"
                value={requiredBy}
                onChange={(e) => setRequiredBy(e.target.value)}
                className={inputCls()}
              />
            </Field>
          </div>

          <Field label="Justification" required error={errors.justification}>
            <textarea
              value={justification}
              onChange={(e) => { setJustification(e.target.value); setErrors((x) => ({ ...x, justification: "" })) }}
              rows={3}
              placeholder="Why is this needed?"
              className={cn(inputCls(errors.justification), "resize-none")}
            />
          </Field>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-200 rounded-lg transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-5 py-2 text-xs font-semibold text-white rounded-lg bg-accent-600 hover:bg-accent-700 disabled:opacity-50 transition-colors"
          >
            {saving ? "Submitting…" : "Submit Request"}
          </button>
        </div>
      </div>
    </div>
  )
}
