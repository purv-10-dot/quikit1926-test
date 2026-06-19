"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { Modal } from "@/components/hrms/modal";
import { Select } from "@/components/hrms/ui/select";
import { PenLine, Plus, Send, CheckCircle, XCircle, Clock, X } from "lucide-react";
import { EmptyState } from "@/components/hrms/empty-state";
import { clsx } from "clsx";

interface Signer { name: string; email: string; role?: string; order: number; status?: string; }
interface ESign {
  id: string; title: string; provider: string; status: string;
  signers: Signer[]; message: string | null; sentAt: string | null; completedAt: string | null; expiresAt: string | null;
}

const PROVIDERS = ["Internal", "DocuSign", "AdobeSign", "LeegalityProvider"] as const;

export default function ESignPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    title: "", provider: "Internal" as typeof PROVIDERS[number], message: "", expiresAt: "",
    signers: [{ name: "", email: "", role: "", order: 1 }] as Signer[],
  });

  const { data } = useQuery({
    queryKey: ["esign"],
    queryFn: () => api.get<ESign[]>("/api/v1/hrms/esign?limit=100"),
  });

  const createMut = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post("/api/v1/hrms/esign", body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["esign"] }); setShowCreate(false); },
  });

  const sendMut = useMutation({
    mutationFn: (id: string) => api.post(`/api/v1/hrms/esign/${id}/send`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["esign"] }),
  });

  const addSigner = () => setForm({ ...form, signers: [...form.signers, { name: "", email: "", role: "", order: form.signers.length + 1 }] });
  const removeSigner = (i: number) => setForm({ ...form, signers: form.signers.filter((_, idx) => idx !== i) });
  const updateSigner = (i: number, patch: Partial<Signer>) =>
    setForm({ ...form, signers: form.signers.map((s, idx) => idx === i ? { ...s, ...patch } : s) });

  const items = data?.data ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <PenLine className="text-[#3b82f6]" />
          <h1 className="font-serif-display text-3xl md:text-4xl font-bold text-gray-900">E-Signature Requests</h1>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 btn btn-primary">
          <Plus size={16} /> New E-Sign
        </button>
      </div>

      {items.length === 0 ? (
        <div className="p-1"><EmptyState variant="bot" title="No Data Found" className="border border-gray-200 shadow-sm" /></div>
      ) : (
        <div className="space-y-3">
          {items.map((e) => (
            <div key={e.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-gray-900">{e.title}</h3>
                    <span className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded-full text-xs">{e.provider}</span>
                    <span className={clsx("px-2 py-0.5 rounded-full text-xs font-medium inline-flex items-center gap-1",
                      e.status === "ESignCompleted" ? "bg-green-100 text-green-700" :
                      e.status === "ESignDeclined" ? "bg-red-100 text-red-700" :
                      e.status === "ESignSent" || e.status === "ESignPartiallySigned" ? "bg-[#dbeafe] text-[#2563eb]" : "bg-gray-100 text-gray-600")}>
                      {e.status === "ESignCompleted" ? <CheckCircle size={10} /> : e.status === "ESignDeclined" ? <XCircle size={10} /> : <Clock size={10} />}
                      {e.status.replace("ESign", "")}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500">
                    {e.signers.length} signer{e.signers.length > 1 ? "s" : ""}
                    {e.sentAt && <> • Sent {new Date(e.sentAt).toLocaleDateString("en-IN")}</>}
                    {e.completedAt && <> • Completed {new Date(e.completedAt).toLocaleDateString("en-IN")}</>}
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {e.signers.map((s, i) => (
                      <span key={i} className={clsx("px-2 py-0.5 rounded text-xs",
                        s.status === "Signed" ? "bg-green-50 text-green-700" :
                        s.status === "Declined" ? "bg-red-50 text-red-600" : "bg-gray-100 text-gray-600")}>
                        {s.name} ({s.email})
                      </span>
                    ))}
                  </div>
                </div>
                {e.status === "ESignDraft" && (
                  <button onClick={() => sendMut.mutate(e.id)} className="flex items-center gap-1 bg-[#16243A] text-white px-3 py-1.5 rounded-lg text-xs hover:bg-[#2563eb]">
                    <Send size={12} /> Send
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="New E-Sign Request">
        <form onSubmit={(e) => { e.preventDefault(); createMut.mutate({ ...form, expiresAt: form.expiresAt || undefined }); }} className="space-y-4 max-h-[80vh] overflow-y-auto pr-2">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
              <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Provider</label>
              <Select
                value={form.provider}
                onChange={(v) => setForm({ ...form, provider: v as typeof PROVIDERS[number] })}
                options={PROVIDERS.map((p) => ({ value: p, label: p }))}
              /></div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">Signers</label>
              <button type="button" onClick={addSigner} className="text-xs text-[#3b82f6] hover:underline">+ Add signer</button>
            </div>
            <div className="space-y-2">
              {form.signers.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input required placeholder="Name" value={s.name} onChange={(ev) => updateSigner(i, { name: ev.target.value })}
                    className="flex-1 border border-[var(--border)] rounded px-2 py-1.5 text-sm" />
                  <input required type="email" placeholder="email@example.com" value={s.email} onChange={(ev) => updateSigner(i, { email: ev.target.value })}
                    className="flex-1 border border-[var(--border)] rounded px-2 py-1.5 text-sm" />
                  <input placeholder="Role" value={s.role ?? ""} onChange={(ev) => updateSigner(i, { role: ev.target.value })}
                    className="w-24 border border-[var(--border)] rounded px-2 py-1.5 text-sm" />
                  {form.signers.length > 1 && <button type="button" onClick={() => removeSigner(i)} className="text-red-500"><X size={14} /></button>}
                </div>
              ))}
            </div>
          </div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
            <textarea value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })}
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" rows={2} /></div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Expires At (optional)</label>
            <input type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm" /></div>
          <div className="flex justify-end gap-2 pt-2 sticky bottom-0 bg-white">
            <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2 border border-[var(--border)] rounded-lg text-sm">Cancel</button>
            <button type="submit" className="px-4 py-2 bg-[#16243A] text-white rounded-lg text-sm font-medium hover:bg-[#2563eb]">Create Draft</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
