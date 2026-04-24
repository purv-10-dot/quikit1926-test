"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AddButton, EmptyState, useConfirm } from "@quikit/ui";
import { ListTree, ArrowLeft, Lock, Unlock, Trash2, Eye, Upload } from "lucide-react";
import { TableSkeleton } from "@/components/ui/Skeleton";
import { BoqFormPanel } from "./_components/BoqFormPanel";
import { BoqImportPanel } from "./_components/BoqImportPanel";

interface Boq {
  id: string; boqNumber: string; boqDate: string; status: string;
  total: string; subtotal: string;
  project: { id: string; name: string; code: string } | null;
  _count: { items: number };
}

const BADGE: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  locked: "bg-green-100 text-green-700",
};

export default function BoqListPage() {
  const [items, setItems] = useState<Boq[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const confirm = useConfirm();

  const refresh = useCallback(async () => {
    setLoading(true);
    const r = await fetch("/api/projects/boq"); const j = await r.json();
    if (j.success) setItems(j.data); setLoading(false);
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  async function lock(b: Boq) {
    const ok = await confirm({ title: "Lock this BOQ?", description: `"${b.boqNumber}" will become immutable. Unlock is possible.`, confirmLabel: "Lock", tone: "default" });
    if (!ok) return;
    await fetch(`/api/projects/boq/${b.id}/lock`, { method: "POST" }); refresh();
  }
  async function unlock(b: Boq) {
    const ok = await confirm({ title: "Unlock this BOQ?", description: `"${b.boqNumber}" will become editable again.`, confirmLabel: "Unlock", tone: "default" });
    if (!ok) return;
    await fetch(`/api/projects/boq/${b.id}/unlock`, { method: "POST" }); refresh();
  }
  async function remove(b: Boq) {
    const ok = await confirm({ title: "Delete this BOQ?", description: `"${b.boqNumber}" will be archived.`, confirmLabel: "Delete", tone: "danger" });
    if (!ok) return;
    await fetch(`/api/projects/boq/${b.id}`, { method: "DELETE" }); refresh();
  }

  return (
    <div className="p-6 max-w-6xl">
      <Link href="/projects" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 mb-3"><ArrowLeft className="h-3 w-3" /> Projects</Link>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Bill of Quantities</h1>
          <p className="text-xs text-gray-500">The scope of work per project. Lock to freeze it for downstream docs.</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setImportOpen(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-accent-700 border border-accent-200 hover:bg-accent-50 rounded-lg"><Upload className="h-3.5 w-3.5" /> Import</button>
          <AddButton onClick={() => setFormOpen(true)}>Add BOQ</AddButton>
        </div>
      </div>
      {loading ? <TableSkeleton rows={5} cols={6} /> : items.length === 0 ? (
        <EmptyState icon={ListTree} title="No BOQs yet" message="Create the scope of work for a project." />
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-accent-50 text-xs text-gray-600"><tr>
              <th className="text-left px-3 py-2">BOQ #</th><th className="text-left px-3 py-2">Project</th>
              <th className="text-left px-3 py-2">Date</th><th className="text-right px-3 py-2">Items</th>
              <th className="text-right px-3 py-2">Total</th><th className="text-left px-3 py-2">Status</th>
              <th style={{ width: 110 }}></th>
            </tr></thead>
            <tbody>{items.map(b => (
              <tr key={b.id} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="px-3 py-2 font-mono text-xs">{b.boqNumber}</td>
                <td className="px-3 py-2 text-gray-700">{b.project?.name ?? "—"}</td>
                <td className="px-3 py-2 text-xs text-gray-500">{new Date(b.boqDate).toISOString().slice(0, 10)}</td>
                <td className="px-3 py-2 text-right">{b._count.items}</td>
                <td className="px-3 py-2 text-right text-gray-700">₹{b.total}</td>
                <td className="px-3 py-2"><span className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded ${BADGE[b.status] ?? "bg-gray-100 text-gray-600"}`}>{b.status}</span></td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  <Link href={`/projects/boq/${b.id}`} className="text-gray-400 hover:text-accent-600 p-1 inline-block"><Eye className="h-3.5 w-3.5" /></Link>
                  {b.status === "draft" && <button onClick={() => lock(b)} className="text-gray-400 hover:text-accent-600 p-1" title="Lock"><Lock className="h-3.5 w-3.5" /></button>}
                  {b.status === "locked" && <button onClick={() => unlock(b)} className="text-gray-400 hover:text-amber-600 p-1" title="Unlock"><Unlock className="h-3.5 w-3.5" /></button>}
                  {b.status === "draft" && <button onClick={() => remove(b)} className="text-gray-400 hover:text-red-600 p-1" title="Delete"><Trash2 className="h-3.5 w-3.5" /></button>}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <BoqFormPanel open={formOpen} onClose={() => setFormOpen(false)} onSaved={refresh} />
      <BoqImportPanel open={importOpen} onClose={() => setImportOpen(false)} onSaved={refresh} />
    </div>
  );
}
