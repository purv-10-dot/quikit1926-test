"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { DocDetailLayout, type LineCol } from "@/components/procurement/DocDetailLayout";

interface Line { id: string; description: string; quantity: string; rate: string; amount: string; gstRate: string | null; totalAmount: string;
  completedQty: string; remarks: string | null; item: { code: string; name: string } | null; uom: { code: string } | null }
interface Wo {
  id: string; woNumber: string; woDate: string; status: string;
  subtotal: string; taxAmount: string; totalAmount: string;
  startDate: string | null; endDate: string | null; completedAt: string | null;
  paymentTermsDays: number | null; remarks: string | null;
  project: { id: string; name: string; code: string } | null;
  contractor: { id: string; name: string; code: string } | null;
  workCategory: { name: string } | null;
  lines: Line[];
}

const BADGE: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600", sent: "bg-blue-100 text-blue-700",
  in_progress: "bg-amber-100 text-amber-700", completed: "bg-green-100 text-green-700",
  closed: "bg-gray-200 text-gray-700", cancelled: "bg-red-100 text-red-700",
};

export default function WoDetail() {
  const { id } = useParams<{ id: string }>();
  const [wo, setWo] = useState<Wo | null>(null);
  useEffect(() => {
    fetch(`/api/projects/work-orders/${id}`).then(r => r.json()).then(j => j.success && setWo(j.data));
  }, [id]);
  if (!wo) return <div className="p-6 text-sm text-gray-500">Loading…</div>;

  const columns: LineCol<Line>[] = [
    { key: "desc", label: "Scope", render: (l) => <>
      <div className="text-gray-900">{l.description}</div>
      {l.item && <div className="text-xs text-gray-500">{l.item.code} — {l.item.name}</div>}
    </> },
    { key: "qty", label: "Qty", align: "right", render: (l) => `${l.quantity} ${l.uom?.code ?? ""}` },
    { key: "done", label: "Completed", align: "right", render: (l) => l.completedQty ?? "—" },
    { key: "rate", label: "Rate", align: "right", render: (l) => `₹${l.rate}` },
    { key: "gst", label: "GST", align: "right", render: (l) => l.gstRate ? `${l.gstRate}%` : "—" },
    { key: "total", label: "Line Total", align: "right", render: (l) => <span className="font-medium">₹{l.totalAmount}</span> },
  ];

  return (
    <DocDetailLayout
      backHref="/projects/work-orders"
      backLabel="Work Orders"
      title={wo.woNumber}
      subtitle={wo.remarks ?? undefined}
      statusBadge={<span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded ${BADGE[wo.status] ?? "bg-gray-100 text-gray-600"}`}>{wo.status.replace(/_/g, " ")}</span>}
      meta={[
        { label: "Contractor", value: wo.contractor?.name ?? "—" },
        { label: "Project", value: wo.project?.name ?? "—" },
        { label: "Work Category", value: wo.workCategory?.name ?? "—" },
        { label: "WO Date", value: new Date(wo.woDate).toISOString().slice(0, 10) },
        { label: "Start", value: wo.startDate ? new Date(wo.startDate).toISOString().slice(0, 10) : "—" },
        { label: "End", value: wo.endDate ? new Date(wo.endDate).toISOString().slice(0, 10) : "—" },
        { label: "Subtotal", value: `₹${wo.subtotal}` },
        { label: "Total (incl. tax)", value: <strong>₹{wo.totalAmount}</strong> },
        { label: "Completed At", value: wo.completedAt ? new Date(wo.completedAt).toLocaleString() : "—" },
      ]}
      lineColumns={columns}
      lines={wo.lines}
    />
  );
}
