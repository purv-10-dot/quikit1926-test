"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AddButton, EmptyState, useConfirm } from "@quikit/ui";
import { Receipt, ArrowLeft, CheckCircle, Trash2, Eye } from "lucide-react";
import { RabFormPanel } from "./_components/RabFormPanel";
import { RequestApprovalButton } from "@/components/approvals/RequestApprovalButton";
import { TableSkeleton } from "@/components/ui/Skeleton";

interface Rab {
  id: string; rabNumber: string; rabDate: string; billSeqNo: number; status: string;
  total: string; currentBillAmount: string;
  project: { name: string; code: string } | null;
  boq: { boqNumber: string } | null;
  _count: { lines: number };
}

const BADGE: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600", submitted: "bg-amber-100 text-amber-700",
  approved: "bg-green-100 text-green-700", paid: "bg-blue-100 text-blue-700",
  rejected: "bg-red-100 text-red-700",
};

export default function RabListPage() {
  const [items, setItems] = useState<Rab[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const confirm = useConfirm();

  const refresh = useCallback(async () => {
    setLoading(true);
    const r = await fetch("/api/projects/rab"); const j = await r.json();
    if (j.success) setItems(j.data); setLoading(false);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  async function approve(r: Rab) {
    const ok = await confirm({ title: "Approve this RAB?", description: `"${r.rabNumber}" will be sealed. Future RABs on this project account for it.`, confirmLabel: "Approve", tone: "default" });
    if (!ok) return;
    await fetch(`/api/projects/rab/${r.id}/approve`, { method: "POST" }); refresh();
  }
  async function remove(r: Rab) {
    const ok = await confirm({ title: "Delete this RAB?", description: r.rabNumber, confirmLabel: "Delete", tone: "danger" });
    if (!ok) return;
    await fetch(`/api/projects/rab/${r.id}`, { method: "DELETE" }); refresh();
  }

  return (
    <div className="p-6 max-w-6xl">
      <Link href="/projects" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 mb-3"><ArrowLeft className="h-3 w-3" /> Projects</Link>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Running Account Bills</h1>
          <p className="text-xs text-gray-500">Progressive billing to the client against a locked BOQ.</p>
        </div>
        <AddButton onClick={() => setFormOpen(true)}>Add RAB</AddButton>
      </div>
      {loading ? <TableSkeleton rows={5} cols={6} /> : items.length === 0 ? (
        <EmptyState icon={Receipt} title="No RABs yet" message="Bill the client against work done so far." />
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-accent-50 text-xs text-gray-600"><tr>
              <th className="text-left px-3 py-2">RAB #</th><th className="text-left px-3 py-2">Project</th>
              <th className="text-left px-3 py-2">Source BOQ</th>
              <th className="text-right px-3 py-2">Bill #</th><th className="text-left px-3 py-2">Date</th>
              <th className="text-right px-3 py-2">This Period</th><th className="text-right px-3 py-2">Total</th>
              <th className="text-left px-3 py-2">Status</th><th style={{ width: 100 }}></th>
            </tr></thead>
            <tbody>{items.map(r => (
              <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-3 py-2 font-mono text-xs">{r.rabNumber}</td>
                <td className="px-3 py-2 text-gray-700">{r.project?.name ?? "—"}</td>
                <td className="px-3 py-2 font-mono text-xs text-accent-700">{r.boq?.boqNumber ?? "—"}</td>
                <td className="px-3 py-2 text-right">{r.billSeqNo}</td>
                <td className="px-3 py-2 text-xs text-gray-500">{new Date(r.rabDate).toISOString().slice(0, 10)}</td>
                <td className="px-3 py-2 text-right text-gray-700">₹{r.currentBillAmount}</td>
                <td className="px-3 py-2 text-right font-medium">₹{r.total}</td>
                <td className="px-3 py-2"><span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${BADGE[r.status] ?? "bg-gray-100 text-gray-600"}`}>{r.status}</span></td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  {(r.status === "draft" || r.status === "submitted") && (
                    <div className="inline-block mr-1 align-middle">
                      <RequestApprovalButton docType="rab" docId={r.id} docRef={r.rabNumber} amount={Number(r.total)} />
                    </div>
                  )}
                  <Link href={`/projects/rab/${r.id}`} className="text-gray-400 hover:text-accent-600 p-1 inline-block"><Eye className="h-3.5 w-3.5" /></Link>
                  {(r.status === "draft" || r.status === "submitted") && <button onClick={() => approve(r)} className="text-gray-400 hover:text-green-600 p-1" title="Approve"><CheckCircle className="h-3.5 w-3.5" /></button>}
                  {r.status === "draft" && <button onClick={() => remove(r)} className="text-gray-400 hover:text-red-600 p-1" title="Delete"><Trash2 className="h-3.5 w-3.5" /></button>}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <RabFormPanel open={formOpen} onClose={() => setFormOpen(false)} onSaved={refresh} />
    </div>
  );
}
