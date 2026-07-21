"use client"

import { useState } from "react"
import { X, Building2, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import type { Vendor, VendorStatus } from "@/types/vendor"

export type VendorPayload = {
  name: string
  contactPerson: string | null
  phone: string | null
  email: string | null
  address: string | null
  status: VendorStatus
}

interface Props {
  vendor?: Vendor | null
  onClose: () => void
  onSave: (data: VendorPayload) => Promise<void>
}

const STATUSES: VendorStatus[] = ["Active", "Inactive"]

function Field({ label, required, error, children }: {
  label: string; required?: boolean; error?: string; children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-gray-600 flex items-center gap-1">
        {label}{required && <span className="text-red-500">*</span>}
      </label>
      {children}
      {error && <p className="text-[10px] text-red-500">{error}</p>}
    </div>
  )
}

export default function AddEditVendorModal({ vendor, onClose, onSave }: Props) {
  const [form, setForm] = useState({
    name:          vendor?.name ?? "",
    contactPerson: vendor?.contactPerson ?? "",
    phone:         vendor?.phone ?? "",
    email:         vendor?.email ?? "",
    address:       vendor?.address ?? "",
    status:        (vendor?.status ?? "Active") as VendorStatus,
  })
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({})
  const [saving, setSaving] = useState(false)

  function set(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value }))
    setErrors((e) => ({ ...e, [field]: "" }))
  }

  function validate() {
    const e: typeof errors = {}
    if (!form.name.trim()) e.name = "Vendor name is required"
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) e.email = "Enter a valid email"
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit() {
    if (!validate()) return
    setSaving(true)
    try {
      await onSave({
        name: form.name.trim(),
        contactPerson: form.contactPerson.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        address: form.address.trim() || null,
        status: form.status,
      })
    } finally {
      setSaving(false)
    }
  }

  const inputCls = (err?: string) => cn(
    "w-full px-3 py-2 text-xs border rounded-lg focus:outline-none focus:ring-2 focus:ring-accent-400 bg-white",
    err ? "border-red-300" : "border-gray-200",
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-accent-100 flex items-center justify-center flex-shrink-0">
              <Building2 className="w-4 h-4 text-accent-600" />
            </div>
            <h2 className="text-sm font-semibold text-gray-900">{vendor ? "Edit Vendor" : "Add Vendor"}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          <Field label="Vendor Name" required error={errors.name}>
            <input value={form.name} onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. Acme IT Services" className={inputCls(errors.name)} />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Contact Person">
              <input value={form.contactPerson} onChange={(e) => set("contactPerson", e.target.value)}
                placeholder="Full name" className={inputCls()} />
            </Field>
            <Field label="Phone">
              <input value={form.phone} onChange={(e) => set("phone", e.target.value)}
                placeholder="Phone number" className={inputCls()} />
            </Field>
          </div>

          <Field label="Email" error={errors.email}>
            <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)}
              placeholder="vendor@example.com" className={inputCls(errors.email)} />
          </Field>

          <Field label="Address">
            <textarea value={form.address} onChange={(e) => set("address", e.target.value)}
              rows={2} placeholder="Street, city, state…" className={cn(inputCls(), "resize-none")} />
          </Field>

          <Field label="Status" required>
            <div className="relative">
              <select value={form.status} onChange={(e) => set("status", e.target.value)}
                className={cn(inputCls(), "appearance-none")}>
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            </div>
          </Field>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-200 rounded-lg transition-colors">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={saving}
            className="px-5 py-2 text-xs font-semibold text-white rounded-lg bg-accent-600 hover:bg-accent-700 disabled:opacity-50 transition-colors">
            {saving ? "Saving…" : vendor ? "Save Changes" : "Add Vendor"}
          </button>
        </div>
      </div>
    </div>
  )
}
