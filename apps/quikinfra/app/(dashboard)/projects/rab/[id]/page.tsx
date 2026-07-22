"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { DocDetailLayout, type LineCol } from "@/components/procurement/DocDetailLayout";
import { formatDateTimeIST } from "@/lib/format/datetime";

interface Line {
  id: string; cumulativeQtyDone: string; priorCumulativeQty: string; currentPeriodQty: string;
  rate: string; currentPeriodAmount: string; gstRate: string | null; taxAmount: string; remarks: string | null;
  boqItem: { code: string | null; description: string; quantity: string | null; uom: { code: string } | null } | null;
}
interface Rab {
  id: string; rabNumber: string; rabDate: string; billedTillDate: string; billSeqNo: number; status: string;
  priorBilledAmount: string; currentBillAmount: string; subtotal: string; taxAmount: string; total: string;
  remarks: string | null; approvedAt: string | null; approvedBy: string | null;
  project: { id: string; name: string; code: string } | null;
  boq: { id: string; boqNumber: string } | null;
  lines: Line[];
}

const BADGE: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600", submitted: "bg-amber-100 text-amber-700",
  approved: "bg-green-100 text-green-700", paid: "bg-blue-100 text-blue-700",
  rejected: "bg-red-100 text-red-700",
};

export default function RabDetail() {
  const { id } = useParams<{ id: string }>();
  const [rab, setRab] = useState<Rab | null>(null);
  useEffect(() => {
    fetch(`/api/projects/rab/${id}`).then(r => r.json()).then(j => j.success && setRab(j.data));
  }, [id]);
  if (!rab) return <div className="p-6 text-sm text-gray-500">Loading…</div>;

  const columns: LineCol<Line>[] = [
    { key: "desc", label: "Item", render: (l) => <>
      {l.boqItem?.code && <span className="text-xs text-gray-600 mr-2">{l.boqItem.code}</span>}
      <span className="text-gray-900">{l.boqItem?.description ?? "—"}</span>
    </> },
    { key: "boq", label: "BOQ Qty", align: "right", render: (l) => `${l.boqItem?.quantity ?? "—"} ${l.boqItem?.uom?.code ?? ""}` },
    { key: "rate", label: "Rate", align: "right", render: (l) => `₹${l.rate}` },
    { key: "prior", label: "Prior Cum.", align: "right", render: (l) => l.priorCumulativeQty },
    { key: "cum", label: "Cum. Done", align: "right", render: (l) => <strong>{l.cumulativeQtyDone}</strong> },
    { key: "period", label: "This Period", align: "right", render: (l) => <span className="text-slate-700 font-medium">{l.currentPeriodQty}</span> },
    { key: "amt", label: "Amount", align: "right", render: (l) => <span className="font-medium">₹{l.currentPeriodAmount}</span> },
  ];

  return (
    <DocDetailLayout
      backHref="/projects/rab"
      backLabel="RABs"
      title={`${rab.rabNumber} — Bill #${rab.billSeqNo}`}
      subtitle={rab.remarks ?? undefined}
      statusBadge={<span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded ${BADGE[rab.status] ?? "bg-gray-100 text-gray-600"}`}>{rab.status}</span>}
      meta={[
        { label: "Project", value: rab.project?.name ?? "—" },
        { label: "Source BOQ", value: rab.boq ? <a href={`/projects/boq/${rab.boq.id}`} className="text-slate-700 hover:underline">{rab.boq.boqNumber}</a> : "—" },
        { label: "RAB Date", value: new Date(rab.rabDate).toISOString().slice(0, 10) },
        { label: "Billed Till", value: new Date(rab.billedTillDate).toISOString().slice(0, 10) },
        { label: "Prior Billed", value: `₹${rab.priorBilledAmount}` },
        { label: "This Period", value: <strong className="text-slate-700">₹{rab.currentBillAmount}</strong> },
        { label: "Tax", value: `₹${rab.taxAmount}` },
        { label: "Total", value: <strong>₹{rab.total}</strong> },
      ]}
      lineColumns={columns}
      lines={rab.lines}
      footer={rab.approvedAt ? (
        <div className="text-xs text-gray-500">Approved by {rab.approvedBy} on {formatDateTimeIST(rab.approvedAt)}</div>
      ) : null}
    />
  );
}
