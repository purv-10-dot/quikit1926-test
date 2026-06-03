"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AddButton, EmptyState, SlidePanel, Button, Input, Select, Field, FormRow, FormSection, useConfirm } from "@quikit/ui";
import { ListChecks, ArrowLeft, Trash2 } from "lucide-react";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { UserPicker } from "@/components/ui/UserPicker";
import { useToast } from "@/components/ui/Toast";

interface Rule { id: string; name: string; docType: string; minAmount: string | null; approverId: string; status: string; }

export default function RulesPage() {
  const [items, setItems] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", docType: "pr", minAmount: "", approverId: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const confirm = useConfirm();
  const toast = useToast();

  const refresh = useCallback(async () => {
    setLoading(true);
    const r = await fetch("/api/approvals/rules"); const j = await r.json();
    if (j.success) setItems(j.data); setLoading(false);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  async function save() {
    setBusy(true); setErr(null);
    try {
      const body = { ...form, minAmount: form.minAmount ? Number(form.minAmount) : null };
      const r = await fetch("/api/approvals/rules", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!j.success) throw new Error(j.error ?? "Save failed");
      setOpen(false); refresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally { setBusy(false); }
  }

  async function remove(r: Rule) {
    const ok = await confirm({ title: "Delete rule?", description: r.name, confirmLabel: "Delete", tone: "danger" });
    if (!ok) return;
    await fetch(`/api/approvals/rules/${r.id}`, { method: "DELETE" }); refresh();
  }

  return (
    <div className="p-6 max-w-5xl">
      <Link href="/approvals" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 mb-3"><ArrowLeft className="h-3 w-3" /> Approvals</Link>
      <div className="flex items-center justify-between mb-4">
        <div><h1 className="text-lg font-semibold text-gray-900">Approval Rules</h1><p className="text-xs text-gray-500">Map doc types + thresholds to approvers.</p></div>
        <AddButton onClick={() => { setForm({ name: "", docType: "pr", minAmount: "", approverId: "" }); setErr(null); setOpen(true); }}>Add Rule</AddButton>
      </div>
      {loading ? <TableSkeleton rows={5} cols={6} /> : items.length === 0 ? (
        <EmptyState icon={ListChecks} title="No rules yet" message="Create rules to route approvals to the right people." />
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-accent-50 text-xs text-gray-600"><tr>
              <th className="text-left px-3 py-2">Name</th><th className="text-left px-3 py-2">Doc Type</th>
              <th className="text-right px-3 py-2">Min Amount</th><th className="text-left px-3 py-2">Approver</th>
              <th style={{ width: 50 }}></th>
            </tr></thead>
            <tbody>{items.map(r => (
              <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-3 py-2">{r.name}</td>
                <td className="px-3 py-2 text-xs uppercase">{r.docType}</td>
                <td className="px-3 py-2 text-right">{r.minAmount ? `₹${r.minAmount}` : "always"}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.approverId}</td>
                <td className="px-3 py-2"><button onClick={() => remove(r)} className="text-gray-400 hover:text-red-600 p-1"><Trash2 className="h-3.5 w-3.5" /></button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      <SlidePanel size="lg" open={open} onClose={() => setOpen(false)} title="Add Approval Rule"
        footer={<><Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button><Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button></>}>
        <div className="space-y-5">
          {err && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{err}</div>}
          <FormSection title="Rule">
            <Field label="Name" required><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
            <FormRow cols={2}>
              <Field label="Doc Type" required>
                <Select value={form.docType} onChange={e => setForm({ ...form, docType: e.target.value })}
                  options={[{ value: "pr", label: "Purchase Requisition" }, { value: "po", label: "Purchase Order" }, { value: "rab", label: "RAB" }, { value: "vendor_bill", label: "Vendor Bill" }, { value: "payroll", label: "Payroll" }, { value: "other", label: "Other" }]} />
              </Field>
              <Field label="Min Amount (₹)"><Input type="number" value={form.minAmount} onChange={e => setForm({ ...form, minAmount: e.target.value })} /></Field>
            </FormRow>
            <Field label="Approver" required>
              <UserPicker value={form.approverId} onChange={(uid) => setForm({ ...form, approverId: uid })} />
            </Field>
          </FormSection>
        </div>
      </SlidePanel>
    </div>
  );
}
