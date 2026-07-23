"use client"

import { useState, useEffect } from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"
import SearchableSelect from "./SearchableSelect"
import AssetPickerTable from "./AssetPickerTable"
import type { Asset } from "@/types/asset"

// Assignees come from the merged User Management list (/api/org/users) — `value`
// is the platform User.id, resolved to an employee record server-side.
type OrgUser = { userId: string; firstName: string; lastName: string; email: string; employeeId: string | null; status: string; department: string | null }
const orgUserName = (u: OrgUser) => `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email

type FormData = { userId: string; assetIds: string[]; assignedDate: string; expectedReturn: string; notes: string }

interface Props {
  onClose: () => void
  onSave: (data: FormData) => Promise<void>
}

function Field({ label, required, error, children }: {
  label: string; required?: boolean; error?: string; children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-gray-600 flex items-center gap-1.5">
        {label}{required && <span className="text-red-500">*</span>}
      </label>
      {children}
      {error && <p className="text-[10px] text-red-500">{error}</p>}
    </div>
  )
}

export default function BulkAssignModal({ onClose, onSave }: Props) {
  const today = new Date().toISOString().split("T")[0]

  const [userId, setUserId] = useState("")
  const [selected, setSelected] = useState<string[]>([])
  const [assignedDate, setAssignedDate] = useState(today)
  const [expectedReturn, setExpectedReturn] = useState("")
  const [notes, setNotes] = useState("")
  const [errors, setErrors] = useState<{ userId?: string; assetIds?: string; assignedDate?: string }>({})
  const [saving, setSaving] = useState(false)
  const [assets, setAssets] = useState<Asset[]>([])
  const [users, setUsers] = useState<OrgUser[]>([])

  useEffect(() => {
    fetch("/api/assets").then((r) => r.json()).then((j) => {
      const data: Asset[] = j.data ?? []
      setAssets(data.filter((a) => a.assetStatus === "Available"))
    })
    // Merged User Management list; membership status is lowercase.
    fetch("/api/org/users").then((r) => r.json()).then((j) => setUsers((j.data ?? []).filter((u: OrgUser) => u.status === "active")))
  }, [])

  const userOptions = users.map((u) => ({ value: u.userId, label: orgUserName(u), sublabel: u.email, extra: u.employeeId ?? "—" }))

  // Selected assets resolved to rows, in pick order — drives the summary chips
  // so the admin can review/remove picks without scrolling the picker table.
  const selectedAssets = selected
    .map((id) => assets.find((a) => a.id === id))
    .filter((a): a is Asset => Boolean(a))

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
    setErrors((e) => ({ ...e, assetIds: "" }))
  }

  function toggleAllVisible(visibleIds: string[]) {
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.includes(id))
    if (allSelected) {
      const visible = new Set(visibleIds)
      setSelected((prev) => prev.filter((id) => !visible.has(id)))
    } else {
      setSelected((prev) => [...new Set([...prev, ...visibleIds])])
      setErrors((e) => ({ ...e, assetIds: "" }))
    }
  }

  function validate() {
    const e: typeof errors = {}
    if (!userId) e.userId = "Required"
    if (selected.length === 0) e.assetIds = "Select at least one asset"
    if (!assignedDate) e.assignedDate = "Required"
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit() {
    if (!validate()) return
    setSaving(true)
    await onSave({ userId, assetIds: selected, assignedDate, expectedReturn, notes })
    setSaving(false)
  }

  const inputCls = "w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-400 bg-white"
  const btnLabel = saving
    ? "Assigning…"
    : selected.length > 0
      ? `Assign ${selected.length} Asset${selected.length === 1 ? "" : "s"}`
      : "Assign Assets"

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[92vh]">

        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Bulk Assign Assets</h2>
            <p className="text-xs text-gray-400 mt-0.5">Assign multiple available assets to one person.</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          {/* Employee */}
          <Field label="Assign To" required error={errors.userId}>
            <SearchableSelect
              options={userOptions} value={userId}
              onChange={(v) => { setUserId(v); setErrors((e) => ({ ...e, userId: "" })) }}
              placeholder="Select Employee" searchPlaceholder="Search employee…" error={errors.userId}
              columnHeaders={{ label: "Name", sublabel: "Email", extra: "Emp Code" }}
            />
          </Field>

          {/* Assets multi-select — detailed, searchable table */}
          <Field label={`Assets (${selected.length} selected)`} required error={errors.assetIds}>
            <AssetPickerTable
              assets={assets}
              multiple
              selectedIds={selected}
              onSelect={toggle}
              onToggleAllVisible={toggleAllVisible}
              error={errors.assetIds}
            />
          </Field>

          {/* Selection summary — removable chips, so picks are visible at a glance */}
          {selectedAssets.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Selected ({selectedAssets.length})</p>
                <button type="button" onClick={() => setSelected([])}
                  className="text-[10px] font-medium text-gray-400 hover:text-red-500 transition-colors">
                  Clear all
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {selectedAssets.map((a) => (
                  <span key={a.id} className="inline-flex items-center gap-1 pl-2 pr-1 py-1 text-[11px] font-medium bg-accent-50 text-accent-700 border border-accent-100 rounded-full">
                    <span className="truncate max-w-[160px]">{a.itemName}</span>
                    <button type="button" onClick={() => toggle(a.id)} aria-label={`Remove ${a.itemName}`}
                      className="p-0.5 rounded-full text-accent-500 hover:bg-accent-200/60 hover:text-accent-700 transition-colors">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Assigned Date + Expected Return */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Assigned Date" required error={errors.assignedDate}>
              <input type="date" value={assignedDate}
                onChange={(e) => { setAssignedDate(e.target.value); setErrors((er) => ({ ...er, assignedDate: "" })) }}
                className={cn(inputCls, errors.assignedDate && "border-red-300")} />
            </Field>
            <Field label="Expected Return">
              <input type="date" value={expectedReturn} onChange={(e) => setExpectedReturn(e.target.value)} className={inputCls} />
            </Field>
          </div>

          {/* Notes */}
          <Field label="Notes">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Applied to all assignments…" rows={2} className={cn(inputCls, "resize-none")} />
          </Field>

          <p className="text-[11px] text-gray-400">
            Each asset is assigned in its current condition. All selected assets are assigned together — if any is no longer available, none are assigned.
          </p>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-200 rounded-lg transition-colors">Cancel</button>
          <button onClick={handleSubmit} disabled={saving || selected.length === 0 || !userId}
            className="px-6 py-2 text-xs font-semibold bg-accent-600 text-white rounded-lg hover:bg-accent-700 disabled:opacity-50 transition-colors">
            {btnLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
