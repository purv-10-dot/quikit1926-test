"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AddButton, EmptyState, useConfirm } from "@quikit/ui";
import { PackageCheck, ArrowLeft, CheckCircle, Trash2, Eye } from "lucide-react";
import { GrnFormPanel } from "./_components/GrnFormPanel";

interface Grn {
  id: string;
  grnNumber: string;
  grnDate: string;
  status: string;
  po: { id: string; poNumber: string } | null;
  project: { id: string; name: string } | null;
  vendor: { id: string; name: string } | null;
  location: { id: string; name: string } | null;
}

const STATUS_BADGE: Record<string, string> = {
  draft:  "bg-gray-100 text-gray-600",
  posted: "bg-green-100 text-green-700",
};

export default function GrnListPage() {
  const [items, setItems] = useState<Grn[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const confirm = useConfirm();

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/store/grn");
      const j = await res.json();
      if (j.success) setItems(j.data);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  async function post(grn: Grn) {
    const ok = await confirm({
      title: "Post this GRN?",
      description: `"${grn.grnNumber}" will write rows to CnStockLedger and update PO pending qty. This cannot be undone.`,
      confirmLabel: "Post",
      tone: "default",
    });
    if (!ok) return;
    const res = await fetch(`/api/store/grn/${grn.id}/post`, { method: "POST" });
    const j = await res.json();
    if (!j.success) alert(`Posting failed: ${j.error}`);
    refresh();
  }

  async function remove(grn: Grn) {
    const ok = await confirm({ title: "Delete this draft GRN?", description: `"${grn.grnNumber}" will be archived.`, confirmLabel: "Delete", tone: "danger" });
    if (!ok) return;
    await fetch(`/api/store/grn/${grn.id}`, { method: "DELETE" });
    refresh();
  }

  return (
    <div className="p-6 max-w-6xl">
      <Link href="/store" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 mb-3">
        <ArrowLeft className="h-3 w-3" /> Store
      </Link>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">GRN — Goods Receipt</h1>
          <p className="text-xs text-gray-500">Draft → Posted. Posting writes to the stock ledger inside a DB transaction.</p>
        </div>
        <AddButton onClick={() => setFormOpen(true)}>Add GRN</AddButton>
      </div>

      {loading ? (
        <div className="text-sm text-gray-500">Loading…</div>
      ) : items.length === 0 ? (
        <EmptyState icon={PackageCheck} title="No GRNs yet" message="Create a GRN against an open PO to receive stock." />
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-accent-50 text-xs text-gray-600">
              <tr>
                <th className="text-left px-3 py-2">GRN #</th>
                <th className="text-left px-3 py-2">PO #</th>
                <th className="text-left px-3 py-2">Vendor</th>
                <th className="text-left px-3 py-2">Location</th>
                <th className="text-left px-3 py-2">Date</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="px-3 py-2" style={{ width: 100 }}></th>
              </tr>
            </thead>
            <tbody>
              {items.map((grn) => (
                <tr key={grn.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-2 font-mono text-xs text-gray-900">{grn.grnNumber}</td>
                  <td className="px-3 py-2 font-mono text-xs text-accent-700">{grn.po?.poNumber ?? "—"}</td>
                  <td className="px-3 py-2 text-gray-700">{grn.vendor?.name ?? "—"}</td>
                  <td className="px-3 py-2 text-gray-700">{grn.location?.name ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{new Date(grn.grnDate).toISOString().slice(0, 10)}</td>
                  <td className="px-3 py-2">
                    <span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${STATUS_BADGE[grn.status] ?? "bg-gray-100 text-gray-600"}`}>
                      {grn.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <Link href={`/store/grn/${grn.id}`} className="text-gray-400 hover:text-accent-600 p-1 inline-block" title="View"><Eye className="h-3.5 w-3.5" /></Link>
                    {grn.status === "draft" && <>
                      <button onClick={() => post(grn)} className="text-gray-400 hover:text-green-600 p-1" title="Post to stock ledger"><CheckCircle className="h-3.5 w-3.5" /></button>
                      <button onClick={() => remove(grn)} className="text-gray-400 hover:text-red-600 p-1" title="Delete draft"><Trash2 className="h-3.5 w-3.5" /></button>
                    </>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <GrnFormPanel open={formOpen} onClose={() => setFormOpen(false)} onSaved={refresh} />
    </div>
  );
}
