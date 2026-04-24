"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AddButton, EmptyState, SlidePanel, Button, Input, Field, FormRow, FormSection } from "@quikit/ui";
import { Wallet, ArrowLeft, Eye } from "lucide-react";
import { TableSkeleton } from "@/components/ui/Skeleton";

interface Run { id: string; runNumber: string; periodStart: string; periodEnd: string; status: string; totalNet: string; totalGross: string; _count: { lines: number } }

const BADGE: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  finalized: "bg-green-100 text-green-700",
  paid: "bg-blue-100 text-blue-700",
};

export default function PayrollPage() {
  const [items, setItems] = useState<Run[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ runNumber: "", periodStart: "", periodEnd: "", remarks: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const r = await fetch("/api/hrms/payroll"); const j = await r.json();
    if (j.success) setItems(j.data); setLoading(false);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  function openNew() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
    setForm({ runNumber: `PAY-${Date.now().toString().slice(-6)}`, periodStart: start, periodEnd: end, remarks: "" });
    setErr(null); setOpen(true);
  }

  async function run() {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/hrms/payroll", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const j = await r.json();
      if (!j.success) throw new Error(j.error ?? "Run failed");
      setOpen(false); refresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Run failed");
    } finally { setBusy(false); }
  }

  return (
    <div className="p-6 max-w-6xl">
      <Link href="/hrms" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 mb-3"><ArrowLeft className="h-3 w-3" /> HRMS</Link>
      <div className="flex items-center justify-between mb-4">
        <div><h1 className="text-lg font-semibold text-gray-900">Payroll Runs</h1><p className="text-xs text-gray-500">Each run locks an attendance window and computes net pay per employee.</p></div>
        <AddButton onClick={openNew}>Generate Run</AddButton>
      </div>
      {loading ? <TableSkeleton rows={5} cols={6} /> : items.length === 0 ? (
        <EmptyState icon={Wallet} title="No payroll runs yet" message="Generate one for the current period." />
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-accent-50 text-xs text-gray-600"><tr>
              <th className="text-left px-3 py-2">Run #</th><th className="text-left px-3 py-2">Period</th>
              <th className="text-right px-3 py-2"># Lines</th><th className="text-right px-3 py-2">Gross</th>
              <th className="text-right px-3 py-2">Net</th><th className="text-left px-3 py-2">Status</th>
              <th style={{ width: 50 }}></th>
            </tr></thead>
            <tbody>{items.map(r => (
              <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-3 py-2 font-mono text-xs">{r.runNumber}</td>
                <td className="px-3 py-2 text-xs text-gray-700">{new Date(r.periodStart).toISOString().slice(0, 10)} → {new Date(r.periodEnd).toISOString().slice(0, 10)}</td>
                <td className="px-3 py-2 text-right text-gray-500">{r._count.lines}</td>
                <td className="px-3 py-2 text-right text-gray-700">₹{r.totalGross}</td>
                <td className="px-3 py-2 text-right font-medium">₹{r.totalNet}</td>
                <td className="px-3 py-2"><span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${BADGE[r.status] ?? "bg-gray-100 text-gray-600"}`}>{r.status}</span></td>
                <td className="px-3 py-2"><Link href={`/hrms/payroll/${r.id}`} className="text-gray-400 hover:text-accent-600 p-1 inline-block"><Eye className="h-3.5 w-3.5" /></Link></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      <SlidePanel size="lg" open={open} onClose={() => setOpen(false)} title="Generate Payroll Run"
        footer={<><Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button><Button onClick={run} disabled={busy}>{busy ? "Running…" : "Run"}</Button></>}>
        <div className="space-y-5">
          {err && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{err}</div>}
          <FormSection title="Period">
            <Field label="Run #" required><Input value={form.runNumber} onChange={e => setForm({ ...form, runNumber: e.target.value.toUpperCase() })} /></Field>
            <FormRow cols={2}>
              <Field label="Period Start" required><Input type="date" value={form.periodStart} onChange={e => setForm({ ...form, periodStart: e.target.value })} /></Field>
              <Field label="Period End" required><Input type="date" value={form.periodEnd} onChange={e => setForm({ ...form, periodEnd: e.target.value })} /></Field>
            </FormRow>
            <Field label="Remarks"><Input value={form.remarks} onChange={e => setForm({ ...form, remarks: e.target.value })} /></Field>
          </FormSection>
          <div className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded p-3">
            Reads attendance in the window. Computes net per employee:<br />
            <span className="font-mono">monthly = wage × (days_present / total_days)</span><br />
            <span className="font-mono">daily   = days_present × daily_wage</span><br />
            <span className="font-mono">hourly  = hours_worked × hourly_wage</span>
          </div>
        </div>
      </SlidePanel>
    </div>
  );
}
