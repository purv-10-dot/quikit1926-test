"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AddButton, EmptyState, useConfirm } from "@quikit/ui";
import { FileQuestion, ArrowLeft, Trash2, Eye } from "lucide-react";
import { RfqFormPanel } from "./_components/RfqFormPanel";

interface Rfq { id: string; rfqNumber: string; rfqDate: string; status: string;
  project: { name: string } | null;
  lines: Array<{ id: string }>;
  vendors: Array<{ vendor: { id: string; name: string }; isAwarded: boolean }>;
}

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600", sent: "bg-blue-100 text-blue-700",
  quotations_received: "bg-amber-100 text-amber-700", awarded: "bg-green-100 text-green-700",
  cancelled: "bg-gray-100 text-gray-400 line-through",
};

export default function RfqListPage() {
  const [items, setItems] = useState<Rfq[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const confirm = useConfirm();

  const refresh = useCallback(async () => {
    setLoading(true);
    const r = await fetch("/api/purchase/rfqs"); const j = await r.json();
    if (j.success) setItems(j.data); setLoading(false);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  async function remove(r: Rfq) {
    const ok = await confirm({ title: "Delete this RFQ?", description: r.rfqNumber, confirmLabel: "Delete", tone: "danger" });
    if (!ok) return;
    await fetch(`/api/purchase/rfqs/${r.id}`, { method: "DELETE" }); refresh();
  }

  return (
    <div className="p-6 max-w-6xl">
      <Link href="/purchase" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 mb-3"><ArrowLeft className="h-3 w-3" /> Purchase</Link>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">RFQs</h1>
          <p className="text-xs text-gray-500">Multi-vendor quote form arrives in Phase 3c. POST via <code className="bg-gray-100 px-1 rounded">/api/purchase/rfqs</code> today (pass <code className="bg-gray-100 px-1 rounded">vendorIds[]</code>).</p>
        </div>
        <AddButton onClick={() => setFormOpen(true)}>Add RFQ</AddButton>
      </div>
      {loading ? <div className="text-sm text-gray-500">Loading…</div> : items.length === 0 ? (
        <EmptyState icon={FileQuestion} title="No RFQs yet" message="Solicit quotes from vendors by raising an RFQ." />
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-accent-50 text-xs text-gray-600"><tr>
              <th className="text-left px-3 py-2">RFQ #</th><th className="text-left px-3 py-2">Project</th>
              <th className="text-left px-3 py-2">Date</th><th className="text-left px-3 py-2">Lines</th>
              <th className="text-left px-3 py-2">Vendors</th><th className="text-left px-3 py-2">Status</th>
              <th style={{ width: 80 }}></th></tr></thead>
            <tbody>{items.map(r => (
              <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-3 py-2 font-mono text-xs">{r.rfqNumber}</td>
                <td className="px-3 py-2 text-gray-700">{r.project?.name ?? "—"}</td>
                <td className="px-3 py-2 text-xs text-gray-500">{new Date(r.rfqDate).toISOString().slice(0, 10)}</td>
                <td className="px-3 py-2">{r.lines.length}</td>
                <td className="px-3 py-2 text-xs text-gray-600">{r.vendors.map(v => v.vendor.name).join(", ") || "—"}</td>
                <td className="px-3 py-2"><span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${STATUS_BADGE[r.status] ?? "bg-gray-100 text-gray-600"}`}>{r.status.replace(/_/g, " ")}</span></td>
                <td className="px-3 py-2 text-right whitespace-nowrap"><Link href={`/purchase/rfqs/${r.id}`} className="text-gray-400 hover:text-accent-600 p-1 inline-block"><Eye className="h-3.5 w-3.5" /></Link>{r.status !== "awarded" && <button onClick={() => remove(r)} className="text-gray-400 hover:text-red-600 p-1"><Trash2 className="h-3.5 w-3.5" /></button>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      <RfqFormPanel open={formOpen} onClose={() => setFormOpen(false)} onSaved={refresh} />
    </div>
  );
}
