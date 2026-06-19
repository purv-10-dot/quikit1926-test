"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { DocDetailLayout, type LineCol } from "@/components/procurement/DocDetailLayout";

interface Line { id: string; item: { code: string; name: string }; uom: { code: string }; systemQty: string; physicalQty: string; adjustmentQty: string; unitRate: string; amount: string; remarks: string | null }
interface Doc {
  id: string; reconciliationNumber: string; status: string; reconciliationDate: string; reason: string | null;
  postedAt: string | null;
  project: { name: string } | null; location: { name: string } | null;
  lines: Line[];
}

export default function ReconDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [doc, setDoc] = useState<Doc | null>(null);
  useEffect(() => {
    fetch(`/api/store/stock-reconciliation/${id}`).then(r => r.json()).then(j => j.success && setDoc(j.data));
  }, [id]);
  if (!doc) return <div className="p-6 text-sm text-gray-500">Loading…</div>;

  const columns: LineCol<Line>[] = [
    { key: "code", label: "Item", render: (l) => <><span className="font-mono text-xs">{l.item.code}</span><div className="text-xs text-gray-500">{l.item.name}</div></> },
    { key: "sys", label: "System", align: "right", render: (l) => `${l.systemQty} ${l.uom.code}` },
    { key: "phy", label: "Physical", align: "right", render: (l) => l.physicalQty },
    { key: "adj", label: "Adjustment", align: "right", render: (l) => {
      const v = Number(l.adjustmentQty);
      return <span className={`font-medium ${v > 0 ? "text-green-700" : v < 0 ? "text-red-700" : "text-gray-400"}`}>{v > 0 ? `+${l.adjustmentQty}` : l.adjustmentQty}</span>;
    } },
    { key: "rate", label: "Rate", align: "right", render: (l) => `₹${l.unitRate}` },
    { key: "amount", label: "Value", align: "right", render: (l) => `₹${l.amount}` },
  ];

  return (
    <DocDetailLayout
      backHref="/store/stock-reconciliation"
      backLabel="Reconciliations"
      title={doc.reconciliationNumber}
      subtitle={doc.reason ?? undefined}
      statusBadge={<span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded ${doc.status === "posted" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>{doc.status}</span>}
      meta={[
        { label: "Project", value: doc.project?.name ?? "—" },
        { label: "Location", value: doc.location?.name ?? "—" },
        { label: "Date", value: new Date(doc.reconciliationDate).toISOString().slice(0, 10) },
        { label: "Posted At", value: doc.postedAt ? new Date(doc.postedAt).toLocaleString() : "—" },
      ]}
      lineColumns={columns}
      lines={doc.lines}
    />
  );
}
