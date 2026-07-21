"use client"

import { useState, useEffect, useRef } from "react"
import { X, Upload, FileText, ImageIcon, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import SearchableSelect from "./SearchableSelect"
import AssetPickerTable from "./AssetPickerTable"
import type { Asset } from "@/types/asset"

// Assignees come from the merged User Management list (/api/org/users) — real
// org members, not the legacy AstEmployee directory. `value` is the platform
// User.id; the assign API resolves it to a (possibly auto-created) employee
// record server-side.
type OrgUser = { userId: string; firstName: string; lastName: string; email: string; employeeId: string | null; status: string; department: string | null }
const orgUserName = (u: OrgUser) => `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email

type FormData = {
  assetId: string
  userId: string
  assignedDate: string
  expectedReturn: string
  notes: string
}

type AttachedFile = { name: string; size: number; url: string }

interface Props {
  onClose: () => void
  onSave: (data: FormData) => Promise<void>
}

function Field({ label, required, error, hint, children }: {
  label: string; required?: boolean; error?: string; hint?: string; children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-gray-600 flex items-center gap-1.5">
        {label}{required && <span className="text-red-500">*</span>}
        {hint && <span className="text-[10px] font-normal text-accent-500 bg-accent-50 px-1.5 py-0.5 rounded">{hint}</span>}
      </label>
      {children}
      {error && <p className="text-[10px] text-red-500">{error}</p>}
    </div>
  )
}

export default function AssignAssetModal({ onClose, onSave }: Props) {
  const today = new Date().toISOString().split("T")[0]

  const [form, setForm] = useState<FormData>({
    assetId: "", userId: "", assignedDate: today, expectedReturn: "", notes: "",
  })
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({})
  const [saving, setSaving] = useState(false)
  const [assets, setAssets] = useState<Asset[]>([])
  const [users, setUsers] = useState<OrgUser[]>([])
  const [files, setFiles] = useState<AttachedFile[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch("/api/assets").then((r) => r.json()).then((j) => {
      const data: Asset[] = j.data ?? []
      setAssets(data.filter((a) => a.assetStatus === "Available"))
    })
    // Only active org members are assignable. /api/org/users is the merged User
    // Management list (membership status is lowercase "active" / "inactive").
    fetch("/api/org/users").then((r) => r.json()).then((j) => setUsers((j.data ?? []).filter((u: OrgUser) => u.status === "active")))
  }, [])

  const selectedAsset = assets.find((a) => a.id === form.assetId)

  function set(field: keyof FormData, value: string) {
    setForm((f) => ({ ...f, [field]: value }))
    setErrors((e) => ({ ...e, [field]: "" }))
  }

  function validate() {
    const e: typeof errors = {}
    if (!form.assetId)      e.assetId      = "Required"
    if (!form.userId)       e.userId       = "Required"
    if (!form.assignedDate) e.assignedDate = "Required"
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit() {
    if (!validate()) return
    setSaving(true)
    await onSave(form)
    setSaving(false)
  }

  function handleFiles(incoming: FileList | null) {
    if (!incoming) return
    const toAdd = Array.from(incoming).slice(0, 5 - files.length)
    setFiles((prev) => [
      ...prev,
      ...toAdd.map((f) => ({ name: f.name, size: f.size, url: URL.createObjectURL(f) })),
    ])
  }

  function formatSize(b: number) {
    if (b < 1024) return `${b} B`
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
    return `${(b / (1024 * 1024)).toFixed(1)} MB`
  }

  const userOptions  = users.map((u) => ({ value: u.userId, label: orgUserName(u), sublabel: u.email, extra: u.employeeId ?? "—" }))

  const inputCls = (err?: string) => cn(
    "w-full px-3 py-2 text-xs border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-400 bg-white",
    err ? "border-red-300" : "border-gray-200"
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[92vh]">

        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Assign Asset</h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          {/* Employee */}
          <Field label="Employee" required error={errors.userId}>
            <SearchableSelect
              options={userOptions} value={form.userId}
              onChange={(v) => set("userId", v)}
              placeholder="Select Employee" searchPlaceholder="Search employee…" error={errors.userId}
              columnHeaders={{ label: "Name", sublabel: "Email", extra: "Emp Code" }}
            />
          </Field>

          {/* Asset — detailed, searchable table (single-select) */}
          <Field label="Asset" required error={errors.assetId}>
            <AssetPickerTable
              assets={assets}
              selectedIds={form.assetId ? [form.assetId] : []}
              onSelect={(id) => set("assetId", id)}
              error={errors.assetId}
            />
          </Field>

          {/* Auto-populated category */}
          {selectedAsset && (
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-600">Base Category</label>
                <div className={cn(inputCls(), "text-gray-500 bg-gray-50 cursor-not-allowed")}>
                  {selectedAsset.baseCategory?.name ?? "—"}
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-600">Category</label>
                <div className={cn(inputCls(), "text-gray-500 bg-gray-50 cursor-not-allowed")}>
                  {selectedAsset.category?.name ?? "—"}
                </div>
              </div>
            </div>
          )}

          {/* Assigned Date + Expected Return */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Assigned Date" required error={errors.assignedDate}>
              <input
                type="date"
                value={form.assignedDate}
                onChange={(e) => set("assignedDate", e.target.value)}
                className={inputCls(errors.assignedDate)}
              />
            </Field>
            <Field label="Expected Return">
              <input
                type="date"
                value={form.expectedReturn}
                onChange={(e) => set("expectedReturn", e.target.value)}
                className={inputCls()}
              />
            </Field>
          </div>

          {/* Notes */}
          <Field label="Notes">
            <textarea
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Assignment notes…"
              rows={3}
              className={cn(inputCls(), "resize-none")}
            />
          </Field>

          {/* Supporting Documents */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-2">Supporting Documents</p>
            <div
              onClick={() => files.length < 5 && fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); handleFiles(e.dataTransfer.files) }}
              className={cn(
                "border-2 border-dashed rounded-lg px-4 py-6 text-center transition-colors",
                files.length < 5
                  ? "border-gray-200 hover:border-accent-300 hover:bg-accent-50/30 cursor-pointer"
                  : "border-gray-100 bg-gray-50 cursor-not-allowed"
              )}
            >
              <Upload className="w-5 h-5 text-gray-300 mx-auto mb-1" />
              <p className="text-xs text-gray-400">
                {files.length < 5
                  ? `Upload assignment proof / images (max 5) — ${5 - files.length} remaining`
                  : "Maximum 5 files attached"}
              </p>
            </div>
            <input ref={fileRef} type="file" multiple accept="image/*,.pdf" className="hidden"
              onChange={(e) => handleFiles(e.target.files)} />

            {files.length > 0 && (
              <ul className="mt-2 space-y-1.5">
                {files.map((f, i) => (
                  <li key={i} className="flex items-center gap-2 px-3 py-2 bg-gray-50 rounded-lg border border-gray-100">
                    {f.name.match(/\.(jpg|jpeg|png|gif|webp)$/i)
                      ? <ImageIcon className="w-3.5 h-3.5 text-accent-400 flex-shrink-0" />
                      : <FileText className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />}
                    <span className="flex-1 text-xs text-gray-700 truncate">{f.name}</span>
                    <span className="text-[10px] text-gray-400">{formatSize(f.size)}</span>
                    <button onClick={() => setFiles((p) => p.filter((_, j) => j !== i))}
                      className="p-0.5 text-gray-300 hover:text-red-500 transition-colors">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-200 rounded-lg transition-colors">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={saving}
            className="px-6 py-2 text-xs font-semibold bg-accent-600 text-white rounded-lg hover:bg-accent-700 disabled:opacity-50 transition-colors">
            {saving ? "Assigning…" : "Confirm Assignment"}
          </button>
        </div>
      </div>
    </div>
  )
}
