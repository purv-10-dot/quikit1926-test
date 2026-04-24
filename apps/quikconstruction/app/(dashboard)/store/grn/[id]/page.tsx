"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { DocDetailLayout, type LineCol } from "@/components/procurement/DocDetailLayout";

interface GrnLine { id: string; item: { code: string; name: string }; uom: { code: string };
  receivedQty: string; acceptedQty: string; rejectedQty: string; unitRate: string; amount: string;
  qualityStatus: string; batchNo: string | null; remarks: string | null }
interface Grn {
  id: string; grnNumber: string; status: string; grnDate: string;
  supplierInvoiceNo: string | null; challanNo: string | null; remarks: string | null;
  postedAt: string | null;
  project: { name: string } | null; vendor: { name: string } | null; location: { name: string } | null;
  po: { id: string; poNumber: string } | null;
  lines: GrnLine[];
}

export default function GrnDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [grn, setGrn] = useState<Grn | null>(null);
  useEffect(() => {
    fetch(`/api/store/grn/${id}`).then(r => r.json()).then(j => j.success && setGrn(j.data));
  }, [id]);
  if (!grn) return <div className="p-6 text-sm text-gray-500">Loading…</div>;

  const columns: LineCol<GrnLine>[] = [
    { key: "code", label: "Item", render: (l) => <><span className="font-mono text-xs text-gray-900">{l.item.code}</span><div className="text-xs text-gray-500">{l.item.name}</div></> },
    { key: "recv", label: "Received", align: "right", render: (l) => `${l.receivedQty} ${l.uom.code}` },
    { key: "acc", label: "Accepted", align: "right", render: (l) => <span className="text-green-700 font-medium">{l.acceptedQty}</span> },
    { key: "rej", label: "Rejected", align: "right", render: (l) => Number(l.rejectedQty) > 0 ? <span className="text-red-700">{l.rejectedQty}</span> : "—" },
    { key: "quality", label: "Quality", render: (l) => <span className="text-[10px] font-semibold uppercase bg-accent-100 text-accent-700 px-1.5 py-0.5 rounded">{l.qualityStatus}</span> },
    { key: "rate", label: "Rate", align: "right", render: (l) => `₹${l.unitRate}` },
    { key: "amount", label: "Amount", align: "right", render: (l) => `₹${l.amount}` },
    { key: "batch", label: "Batch", render: (l) => l.batchNo ?? "—" },
  ];

  return (
    <DocDetailLayout
      backHref="/store/grn"
      backLabel="GRNs"
      title={grn.grnNumber}
      subtitle={grn.remarks ?? undefined}
      statusBadge={<span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded ${grn.status === "posted" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>{grn.status}</span>}
      meta={[
        { label: "PO", value: grn.po ? <a href={`/purchase/orders/${grn.po.id}`} className="font-mono text-accent-700 hover:underline">{grn.po.poNumber}</a> : "—" },
        { label: "Vendor", value: grn.vendor?.name ?? "—" },
        { label: "Project", value: grn.project?.name ?? "—" },
        { label: "Location", value: grn.location?.name ?? "—" },
        { label: "GRN Date", value: new Date(grn.grnDate).toISOString().slice(0, 10) },
        { label: "Invoice #", value: grn.supplierInvoiceNo ?? "—" },
        { label: "Challan #", value: grn.challanNo ?? "—" },
        { label: "Posted At", value: grn.postedAt ? new Date(grn.postedAt).toLocaleString() : "—" },
      ]}
      lineColumns={columns}
      lines={grn.lines}
    />
  );
}
