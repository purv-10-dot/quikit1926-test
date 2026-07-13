"use client"

import { useState, useEffect } from "react"
import { X } from "lucide-react"
import type { User } from "@/types/user"

interface Props {
  user?: User
  onClose: () => void
  onSave: (data: Omit<User, "id">) => void
}

const EMPTY: Omit<User, "id"> = {
  employeeId: "",
  name: "",
  email: "",
  contact: "",
  department: "",
  designation: "",
  joiningDate: "",
  status: "Active",
}

const FIELD_CONFIG: { key: keyof Omit<User, "id">; label: string; required: boolean; type?: string }[] = [
  { key: "employeeId", label: "Employee ID", required: true },
  { key: "name", label: "Full Name", required: true },
  { key: "email", label: "Email Address", required: true, type: "email" },
  { key: "contact", label: "Contact Number", required: false, type: "tel" },
  { key: "department", label: "Department", required: false },
  { key: "designation", label: "Designation", required: false },
  { key: "joiningDate", label: "Joining Date", required: false, type: "date" },
]

export default function AddEditUserModal({ user, onClose, onSave }: Props) {
  const [form, setForm] = useState<Omit<User, "id">>(EMPTY)
  const [errors, setErrors] = useState<Partial<Record<keyof Omit<User, "id">, string>>>({})

  useEffect(() => {
    setForm(user ? { ...user } : { ...EMPTY })
    setErrors({})
  }, [user])

  function set(key: keyof Omit<User, "id">, value: string) {
    setForm((f) => ({ ...f, [key]: value }))
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }))
  }

  function validate() {
    const e: typeof errors = {}
    if (!form.employeeId.trim()) e.employeeId = "Required"
    if (!form.name.trim()) e.name = "Required"
    if (!form.email.trim()) e.email = "Required"
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = "Invalid email"
    return e
  }

  function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault()
    const e = validate()
    if (Object.keys(e).length) { setErrors(e); return }
    onSave(form)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">
            {user ? "Edit User" : "Add New User"}
          </h2>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="px-6 py-5 grid grid-cols-2 gap-4">
            {FIELD_CONFIG.map(({ key, label, required, type }) => (
              <div key={key} className={key === "name" || key === "email" ? "col-span-2" : ""}>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                  {label} {required && <span className="text-red-500">*</span>}
                </label>
                <input
                  type={type ?? "text"}
                  value={form[key] as string}
                  onChange={(e) => set(key, e.target.value)}
                  placeholder={label}
                  className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent-400 transition-colors ${
                    errors[key] ? "border-red-400 bg-red-50" : "border-gray-200 hover:border-gray-300"
                  }`}
                />
                {errors[key] && <p className="text-red-500 text-[10px] mt-1">{errors[key]}</p>}
              </div>
            ))}

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Status</label>
              <div className="flex items-center gap-3 h-9">
                <button
                  type="button"
                  onClick={() => set("status", form.status === "Active" ? "Inactive" : "Active")}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                    form.status === "Active" ? "bg-green-500" : "bg-gray-300"
                  }`}
                >
                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                    form.status === "Active" ? "translate-x-4" : "translate-x-1"
                  }`} />
                </button>
                <span className={`text-xs font-medium ${form.status === "Active" ? "text-green-600" : "text-gray-400"}`}>
                  {form.status}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-semibold bg-accent-600 text-white rounded-lg hover:bg-accent-700 transition-colors"
            >
              {user ? "Save Changes" : "Add User"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
