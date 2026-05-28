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
interface Boq {
  id: string; boqNumber: string; boqDate: string; status: string;
  subtotal: string; taxAmount: string; total: string; currency: string; remarks: string | null;
  lockedAt: string | null;
  project: { id: string; name: string; code: string } | null;
  items: Item[];
}

const BADGE: Record<string, string> = { draft: "bg-gray-100 text-gray-600", locked: "bg-green-100 text-green-700" };

export default function BoqDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [boq, setBoq] = useState<Boq | null>(null);
  useEffect(() => {
    fetch(`/api/projects/boq/${id}`).then(r => r.json()).then(j => j.success && setBoq(j.data));
  }, [id]);

  // Build a render list honoring parent → children order.
  const rendered = useMemo(() => {
    if (!boq) return [];
    const byParent = new Map<string | null, Item[]>();
    for (const it of boq.items) {
      const key = it.parentId;
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key)!.push(it);
    }
    for (const arr of byParent.values()) arr.sort((a, b) => a.sortOrder - b.sortOrder);
    const out: Array<{ item: Item; depth: number }> = [];
    function walk(parentId: string | null, depth: number) {
      const children = byParent.get(parentId) ?? [];
      for (const c of children) {
        out.push({ item: c, depth });
        walk(c.id, depth + 1);
      }
    }
    walk(null, 0);
    return out;
  }, [boq]);

  if (!boq) return <div className="p-6 text-sm text-gray-500">Loading…</div>;

  return (
    <div className="p-6 max-w-6xl">
      <Link href="/projects/boq" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 mb-3"><ArrowLeft className="h-3 w-3" /> BOQ</Link>
      <div className="flex items-center gap-3 mb-5">
        <h1 className="text-lg font-semibold text-gray-900">{boq.boqNumber}</h1>
        <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded ${BADGE[boq.status] ?? "bg-gray-100 text-gray-600"}`}>{boq.status}</span>
      </div>
      {boq.remarks && <p className="text-xs text-gray-600 mb-5">{boq.remarks}</p>}

      <section className="rounded-lg border border-gray-200 bg-white mb-5">
        <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y divide-gray-100">
          <Cell label="Project" value={boq.project?.name ?? "—"} />
          <Cell label="Date" value={new Date(boq.boqDate).toISOString().slice(0, 10)} />
          <Cell label="Currency" value={boq.currency} />
          <Cell label="Locked At" value={boq.lockedAt ? new Date(boq.lockedAt).toLocaleDateString() : "—"} />
          <Cell label="Subtotal" value={`₹${boq.subtotal}`} />
          <Cell label="Tax" value={`₹${boq.taxAmount}`} />
          <Cell label="Total" value={<strong className="text-accent-700">₹{boq.total}</strong>} />
          <Cell label="Line Items" value={boq.items.length} />
        </div>
      </section>

      <section>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Scope of Work</h2>
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-accent-50 text-xs text-gray-600">
              <tr>
                <th className="text-left px-3 py-2">#</th>
                <th className="text-left px-3 py-2">Description</th>
                <th className="text-right px-3 py-2">Qty</th>
                <th className="text-left px-3 py-2">UOM</th>
                <th className="text-right px-3 py-2">Rate</th>
                <th className="text-right px-3 py-2">GST</th>
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
                      <span className={isGroup ? "text-gray-900" : "text-gray-700"}>{item.description}</span>
                      {item.item && <span className="text-xs text-gray-400 ml-2">({item.item.code})</span>}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-700">{isGroup ? "—" : item.quantity}</td>
                    <td className="px-3 py-2 text-gray-500 text-xs">{isGroup ? "" : (item.uom?.code ?? "—")}</td>
                    <td className="px-3 py-2 text-right text-gray-700">{isGroup ? "" : `₹${item.rate}`}</td>
                    <td className="px-3 py-2 text-right text-gray-500 text-xs">{isGroup ? "" : item.gstRate ? `${item.gstRate}%` : "—"}</td>
                    <td className="px-3 py-2 text-right text-gray-900 font-medium">{isGroup ? "" : `₹${item.amount}`}</td>
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
