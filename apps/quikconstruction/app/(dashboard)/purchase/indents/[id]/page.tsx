"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { DocDetailLayout, type LineCol } from "@/components/procurement/DocDetailLayout";

interface Line { id: string; item: { code: string; name: string }; uom: { code: string }; quantity: string; estimatedRate: string | null; remarks: string | null }
interface Ind {
  id: string; indentNumber: string; status: string; requestDate: string; requiredDate: string | null; purpose: string | null;
  project: { name: string } | null;
  lines: Line[];
}

const BADGE: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600", submitted: "bg-amber-100 text-amber-700",
  approved: "bg-green-100 text-green-700", converted: "bg-blue-100 text-blue-700",
  cancelled: "bg-gray-100 text-gray-400",
};

export default function IndentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [ind, setInd] = useState<Ind | null>(null);
  useEffect(() => {
    fetch(`/api/purchase/indents/${id}`).then(r => r.json()).then(j => j.success && setInd(j.data));
  }, [id]);
  if (!ind) return <div className="p-6 text-sm text-gray-500">Loading…</div>;

  const columns: LineCol<Line>[] = [
    { key: "code", label: "Item", render: (l) => <><span className="font-mono text-xs">{l.item.code}</span><div className="text-xs text-gray-500">{l.item.name}</div></> },
    { key: "qty", label: "Qty", align: "right", render: (l) => `${l.quantity} ${l.uom.code}` },
    { key: "rate", label: "Est. Rate", align: "right", render: (l) => l.estimatedRate ?? "—" },
    { key: "remarks", label: "Remarks", render: (l) => l.remarks ?? "—" },
  ];

  return (
    <DocDetailLayout
      backHref="/purchase/indents"
      backLabel="Indents"
      title={ind.indentNumber}
      subtitle={ind.purpose ?? undefined}
      statusBadge={<span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded ${BADGE[ind.status] ?? "bg-gray-100 text-gray-600"}`}>{ind.status}</span>}
      meta={[
        { label: "Project", value: ind.project?.name ?? "—" },
        { label: "Request Date", value: new Date(ind.requestDate).toISOString().slice(0, 10) },
        { label: "Required By", value: ind.requiredDate ? new Date(ind.requiredDate).toISOString().slice(0, 10) : "—" },
        { label: "Lines", value: ind.lines.length },
      ]}
      lineColumns={columns}
      lines={ind.lines}
    />
  );
}
