"use client"

import { useEffect, useMemo, useState } from "react"
import { X, ClipboardList, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import type { AssetRequestPriority } from "@/types/assetRequest"

/**
 * Payload POSTed to /api/asset-requests. Quantity, item-kind, and request-type
 * are no longer employee decisions — the server fixes them (1 / Physical / New).
 */
export type NewRequestPayload = {
  categoryId: string
  justification: string
  priority: AssetRequestPriority
  requiredBy: string | null
}

type Category = { id: string; name: string; baseCategoryId: string | null; baseCategory?: { name: string } | null }

interface Props {
  onClose: () => void
  onSubmit: (payload: NewRequestPayload) => Promise<void>
}

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
  const [baseCategoryId, setBaseCategoryId] = useState("")
  const [categoryId, setCategoryId] = useState("")
  const [priority, setPriority] = useState<AssetRequestPriority>("Medium")
  const [requiredBy, setRequiredBy] = useState("")
  const [justification, setJustification] = useState("")
  const [errors, setErrors] = useState<{ baseCategoryId?: string; categoryId?: string }>({})
  const [loadError, setLoadError] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    // Purpose-built endpoint gated on AssetRequest:create (Members hold it) —
    // not /api/categories, which needs Category:view. Surface load failures
    // instead of silently rendering an empty dropdown.
    fetch("/api/asset-requests/categories")
      .then(async (r) => {
        const j = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(j?.error || "Failed to load categories")
        setCategories(j?.data ?? [])
      })
      .catch(() => setLoadError("Couldn't load item types. Please close and try again."))
  }, [])

  // Base Category → Category cascade, grouped from the flat list (mirrors the
  // Add/Edit Asset form). Base options are the distinct parents; the Category
  // select narrows to the chosen base.
  const baseCategories = useMemo(() => {
    const seen = new Map<string, string>()
    for (const c of categories) {
      if (c.baseCategoryId && !seen.has(c.baseCategoryId)) {
        seen.set(c.baseCategoryId, c.baseCategory?.name ?? "—")
      }
    }
    return [...seen.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [categories])

  const visibleCategories = useMemo(
    () => (baseCategoryId ? categories.filter((c) => c.baseCategoryId === baseCategoryId) : []),
    [categories, baseCategoryId],
  )

  function validate() {
    const e: typeof errors = {}
    if (!baseCategoryId) e.baseCategoryId = "Required"
    if (!categoryId) e.categoryId = "Required"
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit() {
    if (!validate()) return
    setSaving(true)
    try {
      await onSubmit({
        categoryId,
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
          {/* Base Category → Category cascade (mirrors the Add/Edit Asset form) */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Base Category" required error={errors.baseCategoryId || loadError}>
              <div className="relative">
                <select
                  value={baseCategoryId}
                  onChange={(e) => {
                    setBaseCategoryId(e.target.value)
                    setCategoryId("")
                    setErrors((x) => ({ ...x, baseCategoryId: "", categoryId: "" }))
                  }}
                  className={cn(inputCls(errors.baseCategoryId || loadError), "appearance-none", !baseCategoryId && "text-gray-400")}
                >
                  <option value="">Select Base Category</option>
                  {baseCategories.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              </div>
            </Field>
            <Field label="Category" required error={errors.categoryId}>
              <div className="relative">
                <select
                  value={categoryId}
                  onChange={(e) => { setCategoryId(e.target.value); setErrors((x) => ({ ...x, categoryId: "" })) }}
                  disabled={!baseCategoryId}
                  className={cn(
                    inputCls(errors.categoryId), "appearance-none",
                    !categoryId && "text-gray-400",
                    !baseCategoryId && "opacity-50 cursor-not-allowed",
                  )}
                >
                  <option value="">Select Category</option>
                  {visibleCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              </div>
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

          <Field label="Justification">
            <textarea
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              rows={3}
              placeholder="Optional — why is this needed?"
              className={cn(inputCls(), "resize-none")}
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
