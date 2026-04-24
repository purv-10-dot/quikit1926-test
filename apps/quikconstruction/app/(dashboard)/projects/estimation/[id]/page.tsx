"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

interface Item {
  id: string; parentId: string | null; sortOrder: number;
  kind: "item" | "group"; code: string | null; description: string;
  quantity: string | null; rate: string | null; amount: string; gstRate: string | null;
  item: { code: string; name: string } | null; uom: { code: string } | null;
}
interface Est {
  id: string; estimationNumber: string; estimationDate: string; status: string;
  subtotal: string; taxAmount: string; total: string; currency: string; remarks: string | null;
  project: { id: string; name: string; code: string } | null;
  convertedBoq: { id: string; boqNumber: string } | null;
  items: Item[];
}

const BADGE: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600", submitted: "bg-amber-100 text-amber-700",
  approved: "bg-green-100 text-green-700", converted: "bg-blue-100 text-blue-700",
  rejected: "bg-red-100 text-red-700",
};

export default function EstimationDetail() {
  const { id } = useParams<{ id: string }>();
  const [est, setEst] = useState<Est | null>(null);
  useEffect(() => {
    fetch(`/api/projects/estimation/${id}`).then(r => r.json()).then(j => j.success && setEst(j.data));
  }, [id]);

  const rendered = useMemo(() => {
    if (!est) return [];
    const byParent = new Map<string | null, Item[]>();
    for (const it of est.items) {
      const k = it.parentId;
      if (!byParent.has(k)) byParent.set(k, []);
      byParent.get(k)!.push(it);
    }
    for (const arr of byParent.values()) arr.sort((a, b) => a.sortOrder - b.sortOrder);
    const out: Array<{ item: Item; depth: number }> = [];
    (function walk(parentId: string | null, depth: number) {
      const kids = byParent.get(parentId) ?? [];
      for (const c of kids) { out.push({ item: c, depth }); walk(c.id, depth + 1); }
    })(null, 0);
    return out;
  }, [est]);

  if (!est) return <div className="p-6 text-sm text-gray-500">Loading…</div>;

  return (
    <div className="p-6 max-w-6xl">
      <Link href="/projects/estimation" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 mb-3"><ArrowLeft className="h-3 w-3" /> Estimations</Link>
      <div className="flex items-center gap-3 mb-5">
        <h1 className="text-lg font-semibold text-gray-900">{est.estimationNumber}</h1>
        <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded ${BADGE[est.status] ?? "bg-gray-100 text-gray-600"}`}>{est.status}</span>
      </div>
      {est.remarks && <p className="text-xs text-gray-600 mb-5">{est.remarks}</p>}

      <section className="rounded-lg border border-gray-200 bg-white mb-5">
        <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y divide-gray-100">
          <Cell label="Project" value={est.project?.name ?? "—"} />
          <Cell label="Date" value={new Date(est.estimationDate).toISOString().slice(0, 10)} />
          <Cell label="Currency" value={est.currency} />
          <Cell label="Converted BOQ" value={est.convertedBoq ? <a className="text-accent-700 font-mono hover:underline" href={`/projects/boq/${est.convertedBoq.id}`}>{est.convertedBoq.boqNumber}</a> : "—"} />
          <Cell label="Subtotal" value={`₹${est.subtotal}`} />
          <Cell label="Tax" value={`₹${est.taxAmount}`} />
          <Cell label="Total" value={<strong className="text-accent-700">₹{est.total}</strong>} />
          <Cell label="Items" value={est.items.length} />
        </div>
      </section>

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Estimated Scope</h2>
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-accent-50 text-xs text-gray-600">
              <tr>
                <th className="text-left px-3 py-2">#</th>
                <th className="text-left px-3 py-2">Description</th>
                <th className="text-right px-3 py-2">Qty</th>
                <th className="text-left px-3 py-2">UOM</th>
                <th className="text-right px-3 py-2">Rate</th>
                <th className="text-right px-3 py-2">Amount</th>
              </tr>
            </thead>
            <tbody>
              {rendered.map(({ item, depth }, idx) => {
                const isGroup = item.kind === "group";
                return (
                  <tr key={item.id} className={`border-t border-gray-100 ${isGroup ? "bg-accent-50/30 font-semibold" : ""}`}>
                    <td className="px-3 py-2 text-xs text-gray-500">{idx + 1}</td>
                    <td className="px-3 py-2" style={{ paddingLeft: 12 + depth * 16 }}>
                      {item.code && <span className="font-mono text-xs text-gray-600 mr-2">{item.code}</span>}
                      {item.description}
                    </td>
                    <td className="px-3 py-2 text-right">{isGroup ? "—" : item.quantity}</td>
                    <td className="px-3 py-2 text-xs text-gray-500">{isGroup ? "" : item.uom?.code ?? "—"}</td>
                    <td className="px-3 py-2 text-right">{isGroup ? "" : `₹${item.rate}`}</td>
                    <td className="px-3 py-2 text-right font-medium">{isGroup ? "" : `₹${item.amount}`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Cell({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{label}</div>
      <div className="text-sm text-gray-900 mt-0.5">{value}</div>
    </div>
  );
}
