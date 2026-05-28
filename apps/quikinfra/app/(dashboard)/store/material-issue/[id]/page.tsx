"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { DocDetailLayout, type LineCol } from "@/components/procurement/DocDetailLayout";

interface MiLine { id: string; item: { code: string; name: string }; uom: { code: string };
  issuedQty: string; unitRate: string; amount: string; remarks: string | null }
interface Mi {
  id: string; issueNumber: string; status: string; issueDate: string; purpose: string | null;
  postedAt: string | null;
  project: { name: string } | null; location: { name: string } | null;
  lines: MiLine[];
}

export default function MiDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [mi, setMi] = useState<Mi | null>(null);
  useEffect(() => {
    fetch(`/api/store/material-issue/${id}`).then(r => r.json()).then(j => j.success && setMi(j.data));
  }, [id]);
  if (!mi) return <div className="p-6 text-sm text-gray-500">Loading…</div>;

  const columns: LineCol<MiLine>[] = [
    { key: "code", label: "Item", render: (l) => <><span className="font-mono text-xs text-gray-900">{l.item.code}</span><div className="text-xs text-gray-500">{l.item.name}</div></> },
    { key: "qty", label: "Issued Qty", align: "right", render: (l) => `${l.issuedQty} ${l.uom.code}` },
    { key: "rate", label: "Rate", align: "right", render: (l) => `₹${l.unitRate}` },
    { key: "amount", label: "Amount", align: "right", render: (l) => <span className="font-medium">₹{l.amount}</span> },
    { key: "remarks", label: "Remarks", render: (l) => l.remarks ?? "—" },
  ];

  return (
    <DocDetailLayout
      backHref="/store/material-issue"
      backLabel="Material Issue"
      title={mi.issueNumber}
      subtitle={mi.purpose ?? undefined}
      statusBadge={<span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded ${mi.status === "posted" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>{mi.status}</span>}
      meta={[
        { label: "Project", value: mi.project?.name ?? "—" },
        { label: "Location", value: mi.location?.name ?? "—" },
        { label: "Issue Date", value: new Date(mi.issueDate).toISOString().slice(0, 10) },
        { label: "Posted At", value: mi.postedAt ? new Date(mi.postedAt).toLocaleString() : "—" },
      ]}
      lineColumns={columns}
      lines={mi.lines}
    />
  );
}
