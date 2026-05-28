"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { EmptyState, Button, useConfirm } from "@quikit/ui";
import { Inbox, ArrowLeft, Check, X } from "lucide-react";
import { TableSkeleton } from "@/components/ui/Skeleton";

interface Req {
  id: string; docType: string; docId: string; docRef: string; amount: string | null;
  requestedBy: string; status: string; createdAt: string; comment: string | null; decisionAt: string | null;
}

const BADGE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};

export default function InboxPage() {
  const [items, setItems] = useState<Req[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const confirm = useConfirm();

  const refresh = useCallback(async () => {
    setLoading(true);
    const url = showAll ? "/api/approvals/requests?inbox=true" : "/api/approvals/requests?inbox=true&status=pending";
    const r = await fetch(url); const j = await r.json();
    if (j.success) setItems(j.data); setLoading(false);
  }, [showAll]);
  useEffect(() => { refresh(); }, [refresh]);

  async function decide(r: Req, decision: "approved" | "rejected") {
    const ok = await confirm({ title: `${decision === "approved" ? "Approve" : "Reject"} request?`, description: `${r.docType.toUpperCase()} ${r.docRef}`, confirmLabel: decision === "approved" ? "Approve" : "Reject", tone: decision === "rejected" ? "danger" : "default" });
    if (!ok) return;
    await fetch(`/api/approvals/requests/${r.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision }) });
    refresh();
  }

  return (
    <div className="p-6 max-w-5xl">
      <Link href="/approvals" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 mb-3"><ArrowLeft className="h-3 w-3" /> Approvals</Link>
      <div className="flex items-center justify-between mb-4">
        <div><h1 className="text-lg font-semibold text-gray-900">My Inbox</h1><p className="text-xs text-gray-500">Requests where you are the designated approver.</p></div>
        <label className="text-xs flex items-center gap-1"><input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} /> Show decided</label>
      </div>
      {loading ? <TableSkeleton rows={5} cols={6} /> : items.length === 0 ? (
        <EmptyState icon={Inbox} title="Inbox empty" message="Nothing waiting on you." />
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-accent-50 text-xs text-gray-600"><tr>
              <th className="text-left px-3 py-2">Doc</th><th className="text-left px-3 py-2">Ref</th>
              <th className="text-right px-3 py-2">Amount</th><th className="text-left px-3 py-2">Requested</th>
              <th className="text-left px-3 py-2">Status</th><th style={{ width: 130 }}></th>
            </tr></thead>
            <tbody>{items.map(r => (
              <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-3 py-2 text-xs font-semibold uppercase">{r.docType}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.docRef}</td>
                <td className="px-3 py-2 text-right">{r.amount ? `₹${r.amount}` : "—"}</td>
                <td className="px-3 py-2 text-xs text-gray-500">{new Date(r.createdAt).toISOString().slice(0, 10)}</td>
                <td className="px-3 py-2"><span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${BADGE[r.status] ?? "bg-gray-100 text-gray-600"}`}>{r.status}</span></td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  {r.status === "pending" && (
                    <>
                      <button onClick={() => decide(r, "approved")} className="text-gray-400 hover:text-green-600 p-1" title="Approve"><Check className="h-3.5 w-3.5" /></button>
                      <button onClick={() => decide(r, "rejected")} className="text-gray-400 hover:text-red-600 p-1" title="Reject"><X className="h-3.5 w-3.5" /></button>
                    </>
                  )}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
