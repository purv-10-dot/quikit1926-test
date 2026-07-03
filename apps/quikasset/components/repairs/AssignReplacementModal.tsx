"use client"

import { useState, useEffect } from "react"
import { X, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import SearchableSelect from "@/components/assignments/SearchableSelect"
import type { Asset } from "@/types/asset"
import type { Repair } from "@/types/repair"
import type { Assignment } from "@/types/assignment"
import type { User } from "@/types/user"

type FormData = {
  assetId: string
  userId: string
  type: "Temporary" | "Permanent" | ""
  startDate: string
  endDate: string
  notes: string
}

interface Props {
  repair: Repair
  onClose: () => void
  onSave: (data: Omit<FormData, "type"> & { type: "Temporary" | "Permanent" }) => Promise<void>
}

function Field({ label, required, error, children }: {
  label: string; required?: boolean; error?: string; children: React.ReactNode
}) {
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

export default function AssignReplacementModal({ repair, onClose, onSave }: Props) {
  const today = new Date().toISOString().split("T")[0]

  const [form, setForm] = useState<FormData>({
    assetId: "", userId: "", type: "", startDate: today, endDate: "", notes: "",
  })
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({})
  const [saving, setSaving] = useState(false)
  const [assets, setAssets] = useState<Asset[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [originalAssignee, setOriginalAssignee] = useState<Assignment | null>(null)
  const [assigneeLoaded, setAssigneeLoaded] = useState(false)

  useEffect(() => {
    // Load available assets (excluding the one under repair)
    fetch("/api/assets")
      .then((r) => r.json())
      .then((j) => {
        const data: Asset[] = j.data ?? []
        setAssets(data.filter((a) => a.assetStatus === "Available" && a.id !== repair.assetId))
      })

    // Load all users for manual selection
    fetch("/api/users")
      .then((r) => r.json())
      .then((j) => setUsers(j.data ?? []))

    // Auto-fetch original assignee for this repair's asset
    fetch(`/api/assignments?assetId=${repair.assetId}`)
      .then((r) => r.json())
      .then((j) => {
        const data: Assignment[] = j.data ?? []
        const active = data.find((a) => a.status === "Active") ?? data[0] ?? null
        if (active) {
          setOriginalAssignee(active)
          setForm((f) => ({ ...f, userId: active.userId }))
        }
        setAssigneeLoaded(true)
      })
  }, [repair.assetId])

  function set(field: keyof FormData, value: string) {
    setForm((f) => ({ ...f, [field]: value }))
    setErrors((e) => ({ ...e, [field]: "" }))
  }

  function validate() {
    const e: typeof errors = {}
    if (!form.assetId)   e.assetId  = "Required"
    if (!form.userId)    e.userId   = "Required"
    if (!form.type)      e.type     = "Required"
    if (!form.startDate) e.startDate = "Required"
    if (form.type === "Temporary" && !form.endDate) e.endDate = "Required for temporary replacements"
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit() {
    if (!validate()) return
    setSaving(true)
    await onSave({ ...form, type: form.type as "Temporary" | "Permanent" })
    setSaving(false)
  }

  const assetOptions = assets.map((a) => ({
    value: a.id,
    label: a.itemName,
    sublabel: a.itemCode,
  }))

  const userOptions = users.map((u) => ({
    value: u.id,
    label: u.name,
    sublabel: u.email,
  }))

  const inputCls = (err?: string) => cn(
    "w-full px-3 py-2 text-xs border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-400 bg-white",
    err ? "border-red-300" : "border-gray-200"
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl flex flex-col max-h-[92vh]">

        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Assign Replacement Asset</h2>
            <p className="text-xs text-gray-400 mt-0.5">For: {repair.asset?.itemName} — {repair.issueTitle}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          {/* Assignee — auto-filled card OR manual dropdown */}
          {assigneeLoaded && (
            originalAssignee?.user ? (
              <div className="flex items-center gap-3 p-3 bg-accent-50/60 rounded-lg border border-accent-100">
                <div className="w-7 h-7 rounded-full bg-accent-200 flex items-center justify-center flex-shrink-0 text-accent-700 text-[10px] font-bold">
                  {originalAssignee.user.name.charAt(0)}
                </div>
                <div>
                  <p className="text-[10px] font-semibold text-accent-600 uppercase tracking-wide">Replacing for</p>
                  <p className="text-xs font-semibold text-gray-800">{originalAssignee.user.name}</p>
                  <p className="text-[10px] text-gray-500">{originalAssignee.user.email}</p>
                </div>
                <div className="ml-auto flex items-center gap-1 text-[10px] text-accent-500">
                  <Sparkles className="w-3 h-3" /> Auto-filled
                </div>
              </div>
            ) : (
              <Field label="Assign Replacement To" required error={errors.userId}>
                <SearchableSelect
                  options={userOptions}
                  value={form.userId}
                  onChange={(v) => set("userId", v)}
                  placeholder="Select user"
                  searchPlaceholder="Search user…"
                  error={errors.userId}
                  columnHeaders={{ label: "Name", sublabel: "Email" }}
                />
              </Field>
            )
          )}

          {/* Replacement Asset */}
          <Field label="Replacement Asset" required error={errors.assetId}>
            <SearchableSelect
              options={assetOptions} value={form.assetId}
              onChange={(v) => set("assetId", v)}
              placeholder="Select replacement asset" searchPlaceholder="Search asset…"
              error={errors.assetId}
            />
          </Field>

          {/* Replacement Type */}
          <Field label="Replacement Type" required error={errors.type}>
            <div className="grid grid-cols-2 gap-3">
              {(["Temporary", "Permanent"] as const).map((t) => (
                <button
                  key={t} type="button"
                  onClick={() => { set("type", t); if (t === "Permanent") set("endDate", "") }}
                  className={cn(
                    "px-4 py-3 text-xs font-medium rounded-lg border-2 transition-colors text-left",
                    form.type === t
                      ? t === "Temporary"
                        ? "border-yellow-400 bg-yellow-50 text-yellow-700"
                        : "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-gray-200 text-gray-500 hover:border-gray-300"
                  )}
                >
                  <p className="font-semibold">{t}</p>
                  <p className="text-[10px] mt-0.5 font-normal opacity-70">
                    {t === "Temporary"
                      ? "Asset returns to pool after end date"
                      : "Replacement becomes permanent assignment"}
                  </p>
                </button>
              ))}
            </div>
          </Field>

          {/* Start + End Date */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Start Date" required error={errors.startDate}>
              <input type="date" value={form.startDate}
                onChange={(e) => set("startDate", e.target.value)}
                className={inputCls(errors.startDate)} />
            </Field>
            <Field
              label="End Date"
              required={form.type === "Temporary"}
              error={errors.endDate}
            >
              <input type="date" value={form.endDate}
                onChange={(e) => set("endDate", e.target.value)}
                disabled={form.type === "Permanent"}
                className={cn(inputCls(errors.endDate), form.type === "Permanent" && "opacity-40 cursor-not-allowed bg-gray-50")} />
              {form.type === "Permanent" && (
                <p className="text-[10px] text-gray-400">Not applicable for permanent replacement</p>
              )}
            </Field>
          </div>

          {/* Notes */}
          <Field label="Notes">
            <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)}
              placeholder="Additional notes about the replacement…" rows={2}
              className={cn(inputCls(), "resize-none")} />
          </Field>

          {/* Info box */}
          <div className={cn(
            "rounded-lg p-3 text-[11px] border",
            form.type === "Temporary" ? "bg-yellow-50 border-yellow-100 text-yellow-700"
              : form.type === "Permanent" ? "bg-blue-50 border-blue-100 text-blue-700"
              : "bg-gray-50 border-gray-100 text-gray-500"
          )}>
            {form.type === "Temporary" && "The replacement asset will be marked Unavailable until the end date. After the repair is resolved or end date passes, it returns to the available pool."}
            {form.type === "Permanent" && "The replacement asset will be permanently assigned to this user. Once the original asset is repaired and recovered, it will re-enter the available pool for others."}
            {!form.type && "Select a replacement type to see its impact."}
          </div>

        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-200 rounded-lg transition-colors">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={saving}
            className="px-6 py-2 text-xs font-semibold bg-accent-600 text-white rounded-lg hover:bg-accent-700 disabled:opacity-50 transition-colors">
            {saving ? "Assigning…" : "Assign Replacement"}
          </button>
        </div>
      </div>
    </div>
  )
}
