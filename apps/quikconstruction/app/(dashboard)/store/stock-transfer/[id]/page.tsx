"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { DocDetailLayout, type LineCol } from "@/components/procurement/DocDetailLayout";

interface Line { id: string; item: { code: string; name: string }; uom: { code: string }; quantity: string; unitRate: string; amount: string; remarks: string | null }
interface Doc {
  id: string; transferNumber: string; status: string; transferDate: string; reason: string | null;
  receivedAt: string | null;
  project: { name: string } | null;
  fromLocation: { name: string } | null; toLocation: { name: string } | null;
  lines: Line[];
}

export default function StockTransferDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [doc, setDoc] = useState<Doc | null>(null);
  useEffect(() => {
    fetch(`/api/store/stock-transfer/${id}`).then(r => r.json()).then(j => j.success && setDoc(j.data));
  }, [id]);
  if (!doc) return <div className="p-6 text-sm text-gray-500">Loading…</div>;

  const columns: LineCol<Line>[] = [
    { key: "code", label: "Item", render: (l) => <><span className="font-mono text-xs">{l.item.code}</span><div className="text-xs text-gray-500">{l.item.name}</div></> },
    { key: "qty", label: "Qty", align: "right", render: (l) => `${l.quantity} ${l.uom.code}` },
    { key: "rate", label: "Rate", align: "right", render: (l) => `₹${l.unitRate}` },
    { key: "amount", label: "Amount", align: "right", render: (l) => `₹${l.amount}` },
    { key: "remarks", label: "Remarks", render: (l) => l.remarks ?? "—" },
  ];

  return (
    <DocDetailLayout
      backHref="/store/stock-transfer"
      backLabel="Stock Transfers"
      title={doc.transferNumber}
      subtitle={doc.reason ?? undefined}
      statusBadge={<span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded ${doc.status === "received" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>{doc.status}</span>}
      meta={[
        { label: "Project", value: doc.project?.name ?? "—" },
        { label: "From", value: doc.fromLocation?.name ?? "—" },
        { label: "To", value: doc.toLocation?.name ?? "—" },
        { label: "Transfer Date", value: new Date(doc.transferDate).toISOString().slice(0, 10) },
        { label: "Received At", value: doc.receivedAt ? new Date(doc.receivedAt).toLocaleString() : "—" },
      ]}
      lineColumns={columns}
      lines={doc.lines}
    />
  );
}
