"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { useToast } from "@/components/hrms/toast";
import { Select } from "@/components/hrms/ui/select";
import { PageBackground } from "@/components/hrms/page-background";
import { Building2, Plus, X, Trash2, Save, Star } from "lucide-react";
import { clsx } from "clsx";

type Status = "Active" | "Inactive";

interface Entity {
  id: string;
  code: string;
  name: string;
  registeredName: string | null;
  pan: string | null;
  tan: string | null;
  gstin: string | null;
  cin: string | null;
  country: string;
  currency: string;
  state: string | null;
  city: string | null;
  pincode: string | null;
  addressLine1: string | null;
  pfEstablishmentCode: string | null;
  esiEstablishmentCode: string | null;
  ptRegistrationNumber: string | null;
  lwfRegistrationNumber: string | null;
  status: Status;
  isPrimary: boolean;
  notes: string | null;
}

const COUNTRIES = ["IN","US","UK","SG","AE","DE","AU","CA"];
const CURRENCIES = ["INR","USD","GBP","EUR","SGD","AED","AUD","CAD","JPY"];

export default function LegalEntitiesPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<Entity | null>(null);
  const [showForm, setShowForm] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["legal-entities"],
    queryFn: () => api.get<Entity[]>("/api/v1/hrms/legal-entities"),
  });
  const items = data?.data ?? [];

  const createMut = useMutation({
    mutationFn: (b: Record<string, unknown>) => api.post<Entity>("/api/v1/hrms/legal-entities", b),
    onSuccess: () => { toast.success("Created"); qc.invalidateQueries({ queryKey: ["legal-entities"] }); setShowForm(false); setEditing(null); },
  });
  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => api.put<Entity>(`/api/v1/hrms/legal-entities/${id}`, body),
    onSuccess: () => { toast.success("Updated"); qc.invalidateQueries({ queryKey: ["legal-entities"] }); setEditing(null); setShowForm(false); },
  });
  const delMut = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/hrms/legal-entities/${id}`),
    onSuccess: () => { toast.success("Deleted"); qc.invalidateQueries({ queryKey: ["legal-entities"] }); },
  });

  return (
    <div className="space-y-4">
      {/* Subtle HR-themed page background (scoped to this page only). */}
      <PageBackground src="/images/pre-onboarding-bg.png" />
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Building2 className="text-[#22c55e]" />
          <div>
            <h1 className="text-base font-semibold text-gray-900">Legal Entities</h1>
            <p className="text-xs text-gray-500">Multiple registered companies under one tenant. Each has own PAN/TAN, currency, statutory codes.</p>
          </div>
        </div>
        <button
          onClick={() => { setEditing(null); setShowForm((v) => !v); }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-md text-xs font-medium"
        >
          {showForm ? <X size={13} /> : <Plus size={13} />} {showForm ? "Cancel" : "New Entity"}
        </button>
      </div>

      {(showForm || editing) && (
        <EntityForm
          existing={editing}
          submitting={createMut.isPending || updateMut.isPending}
          onCancel={() => { setEditing(null); setShowForm(false); }}
          onSubmit={(body) => editing ? updateMut.mutate({ id: editing.id, body }) : createMut.mutate(body)}
        />
      )}

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
        {isLoading ? <div className="p-4 text-center text-sm text-gray-500">Loading…</div> :
         items.length === 0 ? <div className="py-12 text-center text-sm text-gray-500">No entities yet. Create one to enable multi-entity payroll.</div> :
        <table className="w-full text-sm">
          <thead>
            <tr className="text-table-head font-bold text-gray-500 uppercase border-b border-gray-200">
              <th className="text-left py-2 px-3">Code</th>
              <th className="text-left py-2 px-3">Name</th>
              <th className="text-left py-2 px-3">Country</th>
              <th className="text-left py-2 px-3">Currency</th>
              <th className="text-left py-2 px-3">PAN</th>
              <th className="text-left py-2 px-3">TAN</th>
              <th className="text-left py-2 px-3">Status</th>
              <th className="w-32" />
            </tr>
          </thead>
          <tbody>
            {items.map((e) => (
              <tr key={e.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                <td className="py-2 px-3 font-mono text-xs text-gray-900">
                  {e.isPrimary && <Star size={10} className="inline text-amber-500 mr-1 fill-amber-500" />}
                  {e.code}
                </td>
                <td className="py-2 px-3 text-gray-900">{e.name}</td>
                <td className="py-2 px-3 text-gray-700">{e.country}</td>
                <td className="py-2 px-3 text-gray-700 font-mono">{e.currency}</td>
                <td className="py-2 px-3 text-gray-700 font-mono">{e.pan ?? "—"}</td>
                <td className="py-2 px-3 text-gray-700 font-mono">{e.tan ?? "—"}</td>
                <td className="py-2 px-3">
                  <span className={clsx("inline-block px-2 py-0.5 rounded text-[11px] font-medium",
                    e.status === "Active" ? "bg-emerald-100 text-emerald-700" : "bg-gray-100 text-gray-600")}>{e.status}</span>
                </td>
                <td className="py-2 px-3 text-right">
                  <button onClick={() => { setEditing(e); setShowForm(true); }} className="text-[#22c55e] text-xs hover:underline mr-2">Edit</button>
                  <button onClick={() => { if (confirm(`Delete ${e.name}?`)) delMut.mutate(e.id); }} className="text-gray-400 hover:text-red-600">
                    <Trash2 size={12} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>}
      </div>
    </div>
  );
}

function EntityForm({ existing, submitting, onCancel, onSubmit }: {
  existing: Entity | null;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (b: Record<string, unknown>) => void;
}) {
  const [form, setForm] = useState({
    code: "", name: "", registeredName: "", pan: "", tan: "", gstin: "", cin: "",
    country: "IN", currency: "INR", state: "", city: "", pincode: "",
    addressLine1: "", addressLine2: "",
    pfEstablishmentCode: "", esiEstablishmentCode: "",
    ptRegistrationNumber: "", lwfRegistrationNumber: "",
    status: "Active" as Status, isPrimary: false, notes: "",
  });
  useEffect(() => {
    if (existing) {
      setForm({
        code: existing.code,
        name: existing.name,
        registeredName: existing.registeredName ?? "",
        pan: existing.pan ?? "",
        tan: existing.tan ?? "",
        gstin: existing.gstin ?? "",
        cin: existing.cin ?? "",
        country: existing.country,
        currency: existing.currency,
        state: existing.state ?? "",
        city: existing.city ?? "",
        pincode: existing.pincode ?? "",
        addressLine1: existing.addressLine1 ?? "",
        addressLine2: "",
        pfEstablishmentCode: existing.pfEstablishmentCode ?? "",
        esiEstablishmentCode: existing.esiEstablishmentCode ?? "",
        ptRegistrationNumber: existing.ptRegistrationNumber ?? "",
        lwfRegistrationNumber: existing.lwfRegistrationNumber ?? "",
        status: existing.status,
        isPrimary: existing.isPrimary,
        notes: existing.notes ?? "",
      });
    }
  }, [existing]);

  const inputCls = "w-full px-3 py-2 border border-[var(--border)] rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-[#166534]";
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const payload = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, typeof v === "string" && v === "" ? null : v]));
        onSubmit(payload);
      }}
      className="rounded-lg border border-gray-200 bg-white p-4 grid grid-cols-3 gap-3"
    >
      <Field label="Code *"><input value={form.code} onChange={(e) => set("code", e.target.value.toUpperCase())} className={inputCls + " font-mono"} required /></Field>
      <Field label="Name *"><input value={form.name} onChange={(e) => set("name", e.target.value)} className={inputCls} required /></Field>
      <Field label="Registered Name"><input value={form.registeredName} onChange={(e) => set("registeredName", e.target.value)} className={inputCls} /></Field>
      <Field label="Country"><Select value={form.country} onChange={(v) => set("country", v)} options={COUNTRIES.map((c) => ({ value: c, label: c }))} /></Field>
      <Field label="Currency"><Select value={form.currency} onChange={(v) => set("currency", v)} options={CURRENCIES.map((c) => ({ value: c, label: c }))} /></Field>
      <Field label="State"><input value={form.state} onChange={(e) => set("state", e.target.value)} className={inputCls} /></Field>
      <Field label="PAN"><input value={form.pan} onChange={(e) => set("pan", e.target.value.toUpperCase())} maxLength={10} className={inputCls + " font-mono"} /></Field>
      <Field label="TAN"><input value={form.tan} onChange={(e) => set("tan", e.target.value.toUpperCase())} maxLength={10} className={inputCls + " font-mono"} /></Field>
      <Field label="GSTIN"><input value={form.gstin} onChange={(e) => set("gstin", e.target.value.toUpperCase())} maxLength={15} className={inputCls + " font-mono"} /></Field>
      <Field label="CIN"><input value={form.cin} onChange={(e) => set("cin", e.target.value.toUpperCase())} maxLength={21} className={inputCls + " font-mono"} /></Field>
      <Field label="PF Establishment Code"><input value={form.pfEstablishmentCode} onChange={(e) => set("pfEstablishmentCode", e.target.value)} className={inputCls + " font-mono"} /></Field>
      <Field label="ESI Establishment Code"><input value={form.esiEstablishmentCode} onChange={(e) => set("esiEstablishmentCode", e.target.value)} className={inputCls + " font-mono"} /></Field>
      <Field label="PT Registration No."><input value={form.ptRegistrationNumber} onChange={(e) => set("ptRegistrationNumber", e.target.value)} className={inputCls} /></Field>
      <Field label="LWF Registration No."><input value={form.lwfRegistrationNumber} onChange={(e) => set("lwfRegistrationNumber", e.target.value)} className={inputCls} /></Field>
      <Field label="Status"><Select value={form.status} onChange={(v) => set("status", v as Status)} options={[{ value: "Active", label: "Active" }, { value: "Inactive", label: "Inactive" }]} /></Field>

      <div className="col-span-2">
        <Field label="Address Line 1"><input value={form.addressLine1} onChange={(e) => set("addressLine1", e.target.value)} className={inputCls} /></Field>
      </div>
      <Field label="City"><input value={form.city} onChange={(e) => set("city", e.target.value)} className={inputCls} /></Field>

      <div className="col-span-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.isPrimary} onChange={(e) => set("isPrimary", e.target.checked)} />
          Set as primary entity (default for new pay runs)
        </label>
      </div>

      <div className="col-span-3 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="px-3 py-1.5 text-xs font-medium border border-[var(--border)] rounded-md">Cancel</button>
        <button type="submit" disabled={submitting}
          className="inline-flex items-center gap-2 px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white rounded-md text-xs font-medium">
          <Save size={13} /> {submitting ? "Saving…" : existing ? "Update" : "Create"}
        </button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  );
}
