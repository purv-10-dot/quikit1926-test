"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

interface Rab {
  id: string; rabNumber: string; rabDate: string; billedTillDate: string; billSeqNo: number;
  priorBilledAmount: string; currentBillAmount: string; subtotal: string; taxAmount: string; total: string;
  status: string; remarks: string | null;
  project: { name: string; code: string } | null;
  boq: { boqNumber: string } | null;
  lines: Array<{ id: string; cumulativeQtyDone: string; priorCumulativeQty: string; currentPeriodQty: string; rate: string; currentPeriodAmount: string; gstRate: string | null; taxAmount: string; boqItem: { description: string; code: string | null; uom: { code: string } | null } | null }>;
}

export default function PrintRab() {
  const { id } = useParams<{ id: string }>();
  const [rab, setRab] = useState<Rab | null>(null);
  useEffect(() => { fetch(`/api/projects/rab/${id}`).then(r => r.json()).then(j => j.success && setRab(j.data)); }, [id]);
  if (!rab) return <div style={{ padding: 40 }}>Loading…</div>;

  return (
    <>
      <div className="print-action"><button onClick={() => window.print()}>Print / Save PDF</button></div>
      <div className="doc-head">
        <div><div className="company">QuikInfra</div><div style={{ fontSize: 10, color: "#555" }}>Running Account Bill #{rab.billSeqNo}</div></div>
        <div className="doc-meta">
          <div style={{ fontSize: 16, fontWeight: 600 }}>{rab.rabNumber}</div>
          <div>Date: {new Date(rab.rabDate).toISOString().slice(0, 10)}</div>
          <div>Billed till: {new Date(rab.billedTillDate).toISOString().slice(0, 10)}</div>
          <div style={{ textTransform: "uppercase", fontWeight: 600, marginTop: 4 }}>{rab.status}</div>
        </div>
      </div>

      <div className="kv-grid">
        <div><div className="label">Project</div><div className="value">{rab.project?.name ?? "—"}</div></div>
        <div><div className="label">Source BOQ</div><div className="value">{rab.boq?.boqNumber ?? "—"}</div></div>
      </div>

      <h2>Work Done Summary</h2>
      <table>
        <thead><tr>
          <th>#</th><th>Description</th><th>UOM</th>
          <th className="num">Rate</th>
          <th className="num">Cumulative</th><th className="num">Prior</th><th className="num">This Period</th>
          <th className="num">Amount</th>
        </tr></thead>
        <tbody>{rab.lines.map((l, i) => (
          <tr key={l.id}>
            <td>{i + 1}</td>
            <td>{l.boqItem?.code ? `${l.boqItem.code} — ` : ""}{l.boqItem?.description ?? "—"}</td>
            <td>{l.boqItem?.uom?.code ?? "—"}</td>
            <td className="num">₹{l.rate}</td>
            <td className="num">{l.cumulativeQtyDone}</td>
            <td className="num">{l.priorCumulativeQty}</td>
            <td className="num" style={{ fontWeight: 600 }}>{l.currentPeriodQty}</td>
            <td className="num">₹{l.currentPeriodAmount}</td>
          </tr>
        ))}</tbody>
      </table>

      <div className="totals">
        <div><span>Prior billed</span><span>₹{rab.priorBilledAmount}</span></div>
        <div><span>This period</span><span>₹{rab.currentBillAmount}</span></div>
        <div><span>Tax</span><span>₹{rab.taxAmount}</span></div>
        <div className="grand"><span>Total (this bill)</span><span>₹{rab.total}</span></div>
      </div>

      {rab.remarks && <div style={{ marginTop: "4mm", fontSize: 11 }}><strong>Remarks:</strong> {rab.remarks}</div>}

      <div className="sig-block">
        <div className="sig">Client Engineer</div>
        <div className="sig">For QuikInfra</div>
      </div>
      <div className="footer"><div>System-generated RAB.</div><div>{new Date().toISOString().slice(0, 16).replace("T", " ")}</div></div>
    </>
  );
}
