"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { useToast } from "@/components/hrms/toast";
import { Modal } from "@/components/hrms/modal";
import { NumberInput } from "@/components/hrms/ui/number-input";
import { Select } from "@/components/hrms/select";
import { FileCheck2, Plus, Pencil, Trash2, Power, PowerOff, Sparkles } from "lucide-react";
import { clsx } from "clsx";

type Bundle = "PreOffer" | "PostOffer";
interface DocType {
  id: string; orgId: string; code: string; name: string; bundle: Bundle;
  isRequired: boolean; isActive: boolean; isDefault: boolean;
  sortOrder: number; helpText: string | null;
}

const emptyForm = { name: "", bundle: "PreOffer" as Bundle, isRequired: true, helpText: "", sortOrder: 999 };

export default function CandidateDocumentsSettings() {
  const api = useApiClient();
  const qc = useQueryClient();
  const toast = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ["candidate-doc-types", "all"],
    queryFn: () => api.get<DocType[]>("/api/v1/hrms/recruit/candidate-document-types?includeInactive=1"),
  });
  const items = data?.data ?? [];

  const [bundleTab, setBundleTab] = useState<Bundle>("PreOffer");
  const [editing, setEditing] = useState<DocType | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const createMut = useMutation({
    mutationFn: () => api.post("/api/v1/hrms/recruit/candidate-document-types", form),
    onSuccess: () => {
      toast.success("Document added");
      qc.invalidateQueries({ queryKey: ["candidate-doc-types"] });
      setShowCreate(false);
      setForm(emptyForm);
    },
  });

  const updateMut = useMutation({
    mutationFn: (payload: Partial<DocType> & { id: string }) =>
      api.patch(`/api/v1/hrms/recruit/candidate-document-types/${payload.id}`, payload),
    onSuccess: () => {
      toast.success("Updated");
      qc.invalidateQueries({ queryKey: ["candidate-doc-types"] });
      setEditing(null);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/hrms/recruit/candidate-document-types/${id}`),
    onSuccess: (r) => {
      const payload = (r as unknown as { data?: { softDisabled?: boolean; reason?: string } }).data;
      if (payload?.softDisabled) toast.warning("Disabled", payload.reason ?? "In-use — disabled instead of deleted");
      else toast.success("Deleted");
      qc.invalidateQueries({ queryKey: ["candidate-doc-types"] });
    },
  });

  const preOffer = items.filter((i) => i.bundle === "PreOffer").sort((a, b) => a.sortOrder - b.sortOrder);
  const postOffer = items.filter((i) => i.bundle === "PostOffer").sort((a, b) => a.sortOrder - b.sortOrder);
  const list = bundleTab === "PreOffer" ? preOffer : postOffer;

  return (
    <div className="bg-slate-50 min-h-screen -m-6 p-6">
      <div className="flex items-start justify-between mb-5 gap-3 flex-wrap">
        <div>
          <h1 className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <FileCheck2 size={22} className="text-[#22c55e]" /> Candidate Document Master
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">Define which documents candidates must upload before &amp; after offer.</p>
        </div>
        <button
          onClick={() => { setForm({ ...emptyForm, bundle: bundleTab }); setShowCreate(true); }}
          className="btn btn-primary"
        >
          <Plus size={13} /> Add Document Type
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-100 flex items-center gap-2 flex-wrap">
          {(["PreOffer", "PostOffer"] as const).map((b) => (
            <button
              key={b}
              onClick={() => setBundleTab(b)}
              className={clsx("inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-semibold ring-1 transition",
                bundleTab === b ? "bg-green-600 text-white ring-[#22c55e] shadow-sm" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50")}>
              {b === "PreOffer" ? "Before Offer" : "After Offer"}
              <span className={clsx("ml-1 px-1.5 py-0.5 rounded-full text-[11px] font-semibold",
                bundleTab === b ? "bg-white/20" : "bg-slate-100 text-slate-500")}>
                {b === "PreOffer" ? preOffer.length : postOffer.length}
              </span>
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-slate-400 text-xs">Loading…</div>
        ) : list.length === 0 ? (
          <div className="p-12 text-center text-slate-500">
            <FileCheck2 size={36} className="mx-auto mb-2 text-slate-300" />
            <p className="text-[13px] font-semibold">No documents in this bundle</p>
            <p className="text-xs text-slate-400 mt-0.5">Click &quot;Add Document Type&quot; to create one.</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50/60 border-b border-slate-200">
                <th className="text-left px-4 py-2.5 text-table-head font-semibold text-slate-500 uppercase tracking-wide">Order</th>
                <th className="text-left px-4 py-2.5 text-table-head font-semibold text-slate-500 uppercase tracking-wide">Name</th>
                <th className="text-left px-4 py-2.5 text-table-head font-semibold text-slate-500 uppercase tracking-wide">Code</th>
                <th className="text-left px-4 py-2.5 text-table-head font-semibold text-slate-500 uppercase tracking-wide">Required</th>
                <th className="text-left px-4 py-2.5 text-table-head font-semibold text-slate-500 uppercase tracking-wide">Help Text</th>
                <th className="text-left px-4 py-2.5 text-table-head font-semibold text-slate-500 uppercase tracking-wide">Active</th>
                <th className="text-right px-4 py-2.5 text-table-head font-semibold text-slate-500 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.map((d) => (
                <tr key={d.id} className={clsx("border-b border-slate-100 hover:bg-slate-50/60", !d.isActive && "opacity-50")}>
                  <td className="px-4 py-2.5 text-[11px] text-slate-500 font-mono">{d.sortOrder}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium text-slate-900">{d.name}</span>
                      {d.isDefault && <span className="text-[11px] font-medium uppercase bg-green-50 text-green-700 ring-1 ring-green-200 px-1.5 py-0.5 rounded"><Sparkles size={8} className="inline -mt-0.5" /> Seeded</span>}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-[11px] text-slate-500 font-mono">{d.code}</td>
                  <td className="px-4 py-2.5">
                    {d.isRequired
                      ? <span className="text-[11px] font-medium uppercase bg-red-50 text-red-700 ring-1 ring-red-200 px-1.5 py-0.5 rounded">Required</span>
                      : <span className="text-[11px] font-medium uppercase bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">Optional</span>}
                  </td>
                  <td className="px-4 py-2.5 text-[11px] text-slate-500 max-w-xs truncate">{d.helpText ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    <button
                      onClick={() => updateMut.mutate({ id: d.id, isActive: !d.isActive })}
                      disabled={updateMut.isPending}
                      className={clsx("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ring-1",
                        d.isActive ? "bg-emerald-50 text-emerald-700 ring-emerald-200 hover:bg-emerald-100" : "bg-slate-100 text-slate-500 ring-slate-200 hover:bg-slate-200")}>
                      {d.isActive ? <><Power size={10} /> On</> : <><PowerOff size={10} /> Off</>}
                    </button>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="inline-flex gap-1">
                      <button
                        onClick={() => setEditing(d)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-normal bg-slate-50 text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100"
                      >
                        <Pencil size={12} /> Edit
                      </button>
                      {!d.isDefault && (
                        <button
                          onClick={() => { if (confirm(`Delete "${d.name}"?`)) deleteMut.mutate(d.id); }}
                          disabled={deleteMut.isPending}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-normal bg-red-50 text-red-700 ring-1 ring-red-200 hover:bg-red-100 disabled:opacity-50"
                        >
                          <Trash2 size={12} /> Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create Modal */}
      <Modal open={showCreate} onClose={() => !createMut.isPending && setShowCreate(false)} title="Add Document Type" size="md">
        <form onSubmit={(e) => { e.preventDefault(); if (!form.name.trim()) return toast.error("Name required"); createMut.mutate(); }} className="space-y-4">
          <FormFields form={form} onChange={setForm} />
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <button type="button" onClick={() => setShowCreate(false)} disabled={createMut.isPending}
              className="px-3 py-1.5 border border-[var(--border)] rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={createMut.isPending}
              className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-medium shadow-sm disabled:opacity-50">
              {createMut.isPending ? "Saving…" : "Add"}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Modal */}
      <Modal open={!!editing} onClose={() => !updateMut.isPending && setEditing(null)} title="Edit Document Type" size="md">
        {editing && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!editing.name.trim()) return toast.error("Name required");
              updateMut.mutate({
                id: editing.id,
                name: editing.name,
                bundle: editing.bundle,
                isRequired: editing.isRequired,
                helpText: editing.helpText,
                sortOrder: editing.sortOrder,
              });
            }}
            className="space-y-4"
          >
            <FormFields
              form={{
                name: editing.name,
                bundle: editing.bundle,
                isRequired: editing.isRequired,
                helpText: editing.helpText ?? "",
                sortOrder: editing.sortOrder,
              }}
              onChange={(patch) => setEditing({ ...editing, ...patch, helpText: patch.helpText ?? null })}
              lockBundle={editing.isDefault}
            />
            {editing.isDefault && <p className="text-[11px] text-green-600 bg-green-50 border border-green-200 rounded px-2 py-1.5">This is a seeded default. Bundle cannot be moved.</p>}
            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <button type="button" onClick={() => setEditing(null)} disabled={updateMut.isPending}
                className="px-3 py-1.5 border border-[var(--border)] rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">Cancel</button>
              <button type="submit" disabled={updateMut.isPending}
                className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-medium shadow-sm disabled:opacity-50">
                {updateMut.isPending ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}

function FormFields({ form, onChange, lockBundle }: {
  form: { name: string; bundle: Bundle; isRequired: boolean; helpText: string; sortOrder: number };
  onChange: (next: { name: string; bundle: Bundle; isRequired: boolean; helpText: string; sortOrder: number }) => void;
  lockBundle?: boolean;
}) {
  return (
    <>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Document Name *</label>
        <input
          required
          value={form.name}
          onChange={(e) => onChange({ ...form, name: e.target.value })}
          placeholder="e.g. Passport, Voter ID, Reference Letter"
          className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#166534]"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Bundle *</label>
          <Select
            className="w-full"
            disabled={lockBundle}
            value={form.bundle}
            onChange={(v) => onChange({ ...form, bundle: v as Bundle })}
            options={[
              { value: "PreOffer", label: "Before Offer" },
              { value: "PostOffer", label: "After Offer" },
            ]}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Sort Order</label>
          <NumberInput
            allowDecimal={false}
            min={0}
            value={form.sortOrder}
            onChange={(v) => onChange({ ...form, sortOrder: v ?? 0 })}
            className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#166534]"
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.isRequired}
          onChange={(e) => onChange({ ...form, isRequired: e.target.checked })}
        />
        Mark as required (must-have before stage gate passes)
      </label>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Help Text (shown to candidate)</label>
        <textarea
          rows={2}
          value={form.helpText}
          onChange={(e) => onChange({ ...form, helpText: e.target.value })}
          placeholder="e.g. Upload both sides as a single PDF"
          className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#166534]"
        />
      </div>
    </>
  );
}
