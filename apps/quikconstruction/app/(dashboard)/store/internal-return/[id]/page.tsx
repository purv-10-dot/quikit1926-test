"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { DocDetailLayout, type LineCol } from "@/components/procurement/DocDetailLayout";

interface Line { id: string; item: { code: string; name: string }; uom: { code: string }; returnQty: string; unitRate: string; amount: string; remarks: string | null }
interface Doc {
  id: string; returnNumber: string; status: string; returnDate: string; reason: string | null;
  postedAt: string | null;
  issue: { id: string; issueNumber: string } | null;
  project: { name: string } | null; location: { name: string } | null;
  lines: Line[];
}

export default function InternalReturnDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [doc, setDoc] = useState<Doc | null>(null);
  useEffect(() => {
    fetch(`/api/store/internal-return/${id}`).then(r => r.json()).then(j => j.success && setDoc(j.data));
  }, [id]);
  if (!doc) return <div className="p-6 text-sm text-gray-500">Loading…</div>;

  const columns: LineCol<Line>[] = [
    { key: "code", label: "Item", render: (l) => <><span className="font-mono text-xs">{l.item.code}</span><div className="text-xs text-gray-500">{l.item.name}</div></> },
    { key: "qty", label: "Return Qty", align: "right", render: (l) => `${l.returnQty} ${l.uom.code}` },
    { key: "rate", label: "Rate", align: "right", render: (l) => `₹${l.unitRate}` },
    { key: "amount", label: "Amount", align: "right", render: (l) => <span className="font-medium">₹{l.amount}</span> },
    { key: "remarks", label: "Remarks", render: (l) => l.remarks ?? "—" },
  ];

  return (
    <DocDetailLayout
      backHref="/store/internal-return"
      backLabel="Internal Returns"
      title={doc.returnNumber}
      subtitle={doc.reason ?? undefined}
      statusBadge={<span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded ${doc.status === "posted" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>{doc.status}</span>}
      meta={[
        { label: "Source Issue", value: doc.issue ? <a href={`/store/material-issue/${doc.issue.id}`} className="font-mono text-accent-700 hover:underline">{doc.issue.issueNumber}</a> : "—" },
        { label: "Project", value: doc.project?.name ?? "—" },
        { label: "Location", value: doc.location?.name ?? "—" },
        { label: "Return Date", value: new Date(doc.returnDate).toISOString().slice(0, 10) },
        { label: "Posted At", value: doc.postedAt ? new Date(doc.postedAt).toLocaleString() : "—" },
      ]}
      lineColumns={columns}
      lines={doc.lines}
    />
  );
}
