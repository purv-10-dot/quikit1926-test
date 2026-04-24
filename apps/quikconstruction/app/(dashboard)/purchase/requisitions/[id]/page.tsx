"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { DocDetailLayout, type LineCol } from "@/components/procurement/DocDetailLayout";

interface PrLine { id: string; item: { code: string; name: string }; uom: { code: string }; quantity: string; estimatedRate: string | null }
interface Pr {
  id: string; prNumber: string; status: string; requestDate: string; requiredDate: string | null; purpose: string | null;
  project: { name: string } | null;
  lines: PrLine[];
  pos?: Array<{ id: string; poNumber: string; status: string }>;
}

const BADGE: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600", submitted: "bg-amber-100 text-amber-700",
  approved: "bg-green-100 text-green-700", converted: "bg-blue-100 text-blue-700",
  rejected: "bg-red-100 text-red-700", cancelled: "bg-gray-100 text-gray-400",
};

export default function PrDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [pr, setPr] = useState<Pr | null>(null);
  useEffect(() => {
    fetch(`/api/purchase/requisitions/${id}`).then(r => r.json()).then(j => j.success && setPr(j.data));
  }, [id]);
  if (!pr) return <div className="p-6 text-sm text-gray-500">Loading…</div>;

  const columns: LineCol<PrLine>[] = [
    { key: "code", label: "Item Code", render: (l) => <span className="font-mono text-xs text-gray-900">{l.item.code}</span> },
    { key: "name", label: "Item", render: (l) => l.item.name },
    { key: "qty", label: "Qty", align: "right", render: (l) => `${l.quantity} ${l.uom.code}` },
    { key: "rate", label: "Est. Rate", align: "right", render: (l) => l.estimatedRate ?? "—" },
  ];

  return (
    <DocDetailLayout
      backHref="/purchase/requisitions"
      backLabel="Purchase Requisitions"
      title={pr.prNumber}
      subtitle={pr.purpose ?? undefined}
      statusBadge={<span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded ${BADGE[pr.status] ?? "bg-gray-100 text-gray-600"}`}>{pr.status}</span>}
      meta={[
        { label: "Project", value: pr.project?.name ?? "—" },
        { label: "Request Date", value: new Date(pr.requestDate).toISOString().slice(0, 10) },
        { label: "Required By", value: pr.requiredDate ? new Date(pr.requiredDate).toISOString().slice(0, 10) : "—" },
        { label: "Lines", value: pr.lines.length },
      ]}
      lineColumns={columns}
      lines={pr.lines}
      footer={pr.pos && pr.pos.length > 0 ? (
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Derived POs</h2>
          <ul className="text-sm text-gray-700 list-disc ml-5">
            {pr.pos.map(p => (
              <li key={p.id}><a className="text-accent-700 font-mono text-xs hover:underline" href={`/purchase/orders/${p.id}`}>{p.poNumber}</a> <span className="text-xs text-gray-500">({p.status.replace(/_/g, " ")})</span></li>
            ))}
          </ul>
        </div>
      ) : null}
    />
  );
}
