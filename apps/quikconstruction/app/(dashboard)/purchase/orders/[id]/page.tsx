"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { DocDetailLayout, type LineCol } from "@/components/procurement/DocDetailLayout";

interface PoLine { id: string; item: { code: string; name: string }; uom: { code: string };
  orderedQty: string; receivedQty: string; pendingQty: string; unitRate: string;
  gstRate: string | null; amount: string; totalAmount: string }
interface Po {
  id: string; poNumber: string; status: string; poDate: string; deliveryDate: string | null;
  subtotal: string; taxAmount: string; totalAmount: string; remarks: string | null;
  project: { name: string } | null; vendor: { name: string } | null;
  pr: { prNumber: string } | null;
  deliveryLocation: { name: string } | null;
  lines: PoLine[];
  grns?: Array<{ id: string; grnNumber: string; status: string; grnDate: string }>;
}

const BADGE: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600", sent: "bg-blue-100 text-blue-700",
  partially_received: "bg-amber-100 text-amber-700", fully_received: "bg-green-100 text-green-700",
  closed: "bg-gray-200 text-gray-700", cancelled: "bg-red-100 text-red-700",
};

export default function PoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [po, setPo] = useState<Po | null>(null);
  useEffect(() => {
    fetch(`/api/purchase/orders/${id}`).then(r => r.json()).then(j => j.success && setPo(j.data));
  }, [id]);
  if (!po) return <div className="p-6 text-sm text-gray-500">Loading…</div>;

  const columns: LineCol<PoLine>[] = [
    { key: "code", label: "Item", render: (l) => <><span className="font-mono text-xs text-gray-900">{l.item.code}</span><div className="text-xs text-gray-500">{l.item.name}</div></> },
    { key: "qty", label: "Ordered", align: "right", render: (l) => `${l.orderedQty} ${l.uom.code}` },
    { key: "received", label: "Received", align: "right", render: (l) => l.receivedQty },
    { key: "pending", label: "Pending", align: "right", render: (l) => <span className={Number(l.pendingQty) > 0 ? "text-amber-700 font-medium" : "text-gray-400"}>{l.pendingQty}</span> },
    { key: "rate", label: "Rate", align: "right", render: (l) => `₹${l.unitRate}` },
    { key: "gst", label: "GST", align: "right", render: (l) => l.gstRate ? `${l.gstRate}%` : "—" },
    { key: "total", label: "Line Total", align: "right", render: (l) => <span className="font-medium">₹{l.totalAmount}</span> },
  ];

  return (
    <DocDetailLayout
      backHref="/purchase/orders"
      backLabel="Purchase Orders"
      title={po.poNumber}
      subtitle={po.remarks ?? undefined}
      statusBadge={<span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded ${BADGE[po.status] ?? "bg-gray-100 text-gray-600"}`}>{po.status.replace(/_/g, " ")}</span>}
      meta={[
        { label: "Vendor", value: po.vendor?.name ?? "—" },
        { label: "Project", value: po.project?.name ?? "—" },
        { label: "Source PR", value: po.pr?.prNumber ?? "—" },
        { label: "Delivery To", value: po.deliveryLocation?.name ?? "—" },
        { label: "PO Date", value: new Date(po.poDate).toISOString().slice(0, 10) },
        { label: "Delivery Date", value: po.deliveryDate ? new Date(po.deliveryDate).toISOString().slice(0, 10) : "—" },
        { label: "Subtotal", value: `₹${po.subtotal}` },
        { label: "Total (incl. tax)", value: <strong>₹{po.totalAmount}</strong> },
      ]}
      lineColumns={columns}
      lines={po.lines}
      footer={po.grns && po.grns.length > 0 ? (
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">Receipts (GRNs)</h2>
          <ul className="text-sm text-gray-700 list-disc ml-5">
            {po.grns.map(g => (
              <li key={g.id}><a className="text-accent-700 font-mono text-xs hover:underline" href={`/store/grn/${g.id}`}>{g.grnNumber}</a> <span className="text-xs text-gray-500">({g.status}, {new Date(g.grnDate).toISOString().slice(0, 10)})</span></li>
            ))}
          </ul>
        </div>
      ) : null}
    />
  );
}
