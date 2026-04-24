"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { DocDetailLayout, type LineCol } from "@/components/procurement/DocDetailLayout";
import { Button, useConfirm } from "@quikit/ui";
import { Lock, Plus, Trash2 } from "lucide-react";

interface DprLine { id: string; activity: string; quantityDone: string; labourCount: number | null; labourHours: string | null; machineryUsed: string | null; remarks: string | null; uom: { code: string } | null; boqItem: { code: string | null; description: string } | null }
interface Material { id: string; quantity: string; unitRate: string; amount: string; remarks: string | null; item: { id: string; code: string; name: string } | null; uom: { code: string } | null; itemId: string; uomId: string; }
interface Item { id: string; code: string; name: string; uomId: string }
interface Location { id: string; name: string; code: string }
interface Dpr {
  id: string; dprDate: string; status: string; weather: string | null; remarks: string | null; reportedById: string;
  consumptionLocationId: string | null;
  project: { id: string; name: string; code: string } | null;
  location: { id: string; name: string; code: string } | null;
  lines: DprLine[];
  materials: Material[];
}

type MatRow = { itemId: string; uomId: string; quantity: number; remarks: string };

export default function DprDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [dpr, setDpr] = useState<Dpr | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [editing, setEditing] = useState(false);
  const [locId, setLocId] = useState<string>("");
  const [rows, setRows] = useState<MatRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const confirm = useConfirm();

  const refresh = useCallback(() => {
    fetch(`/api/projects/dpr/${id}`).then(r => r.json()).then(j => {
      if (!j.success) return;
      setDpr(j.data);
      setLocId(j.data.consumptionLocationId ?? "");
      setRows(j.data.materials.map((m: Material) => ({ itemId: m.itemId, uomId: m.uomId, quantity: Number(m.quantity), remarks: m.remarks ?? "" })));
    });
  }, [id]);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    Promise.all([
      fetch("/api/masters/items").then(r => r.json()),
      fetch("/api/masters/locations").then(r => r.json()),
    ]).then(([it, lo]) => {
      if (it.success) setItems(it.data);
      if (lo.success) setLocations(lo.data);
    });
  }, []);
  if (!dpr) return <div className="p-6 text-sm text-gray-500">Loading…</div>;

  const columns: LineCol<DprLine>[] = [
    { key: "activity", label: "Activity", render: (l) => <>
      {l.boqItem && <div className="text-xs text-accent-700 font-mono">{l.boqItem.code ?? "—"} — {l.boqItem.description}</div>}
      <div className="text-gray-900">{l.activity}</div>
    </> },
    { key: "qty", label: "Qty Done", align: "right", render: (l) => <>{l.quantityDone} {l.uom?.code ?? ""}</> },
    { key: "labour", label: "Labour", align: "right", render: (l) => {
      const parts: string[] = [];
      if (l.labourCount) parts.push(`${l.labourCount} ppl`);
      if (l.labourHours) parts.push(`${l.labourHours}h`);
      return parts.join(" · ") || "—";
    } },
    { key: "machinery", label: "Machinery", render: (l) => l.machineryUsed ?? "—" },
    { key: "remarks", label: "Remarks", render: (l) => l.remarks ?? "—" },
  ];

  async function saveMaterials() {
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/projects/dpr/${id}/materials`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consumptionLocationId: locId || null, materials: rows.filter(r => r.itemId && r.quantity > 0) }),
      });
      const j = await r.json();
      if (!j.success) throw new Error(j.error ?? "Save failed");
      setEditing(false); refresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally { setBusy(false); }
  }

  async function post() {
    const ok = await confirm({ title: "Post DPR?", description: "Seals the DPR and writes stock ledger rows for materials. Irreversible.", confirmLabel: "Post", tone: "danger" });
    if (!ok) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/projects/dpr/${id}/post`, { method: "POST" });
      const j = await r.json();
      if (!j.success) throw new Error((j.details ? `${j.error}: ${JSON.stringify(j.details)}` : j.error) ?? "Post failed");
      refresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Post failed");
    } finally { setBusy(false); }
  }

  const isPosted = dpr.status === "posted";
  const canEdit = !isPosted;
  const materialsTotalAmount = dpr.materials.reduce((s, m) => s + Number(m.amount), 0);

  const footer = (
    <div className="space-y-4">
      {err && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{err}</div>}

      <section className="rounded-lg border border-gray-200 bg-white">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Materials Consumed</h2>
            <div className="text-[11px] text-gray-500">Source: {dpr.location?.name ?? "—"} · Total value: ₹{materialsTotalAmount.toFixed(2)}</div>
          </div>
          {canEdit && !editing && <Button variant="secondary" onClick={() => setEditing(true)}>Edit Materials</Button>}
          {canEdit && editing && <div className="flex gap-2"><Button variant="secondary" onClick={() => { setEditing(false); refresh(); }} disabled={busy}>Cancel</Button><Button onClick={saveMaterials} disabled={busy}>{busy ? "Saving…" : "Save"}</Button></div>}
        </div>
        <div className="p-4">
          {editing ? (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">Source Location</label>
                <select value={locId} onChange={e => setLocId(e.target.value)} className="w-full text-sm border border-gray-300 rounded px-2 py-1.5">
                  <option value="">— select —</option>
                  {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </div>
              <div className="space-y-1">
                {rows.map((r, idx) => (
                  <div key={idx} className="flex gap-2 text-xs">
                    <select value={r.itemId} onChange={e => {
                      const item = items.find(i => i.id === e.target.value);
                      setRows(prev => prev.map((x, i) => i === idx ? { ...x, itemId: e.target.value, uomId: item?.uomId ?? x.uomId } : x));
                    }} className="flex-1 border border-gray-300 rounded px-2 py-1">
                      <option value="">— item —</option>
                      {items.map(i => <option key={i.id} value={i.id}>{i.code} — {i.name}</option>)}
                    </select>
                    <input type="number" step="0.01" placeholder="Qty" value={r.quantity || ""} onChange={e => setRows(prev => prev.map((x, i) => i === idx ? { ...x, quantity: Number(e.target.value) } : x))} className="w-24 border border-gray-300 rounded px-2 py-1" />
                    <input type="text" placeholder="Remarks" value={r.remarks} onChange={e => setRows(prev => prev.map((x, i) => i === idx ? { ...x, remarks: e.target.value } : x))} className="flex-1 border border-gray-300 rounded px-2 py-1" />
                    <button onClick={() => setRows(prev => prev.filter((_, i) => i !== idx))} className="text-gray-400 hover:text-red-600 p-1"><Trash2 className="h-3 w-3" /></button>
                  </div>
                ))}
                <button onClick={() => setRows(prev => [...prev, { itemId: "", uomId: "", quantity: 0, remarks: "" }])} className="text-xs text-accent-700 hover:underline flex items-center gap-1"><Plus className="h-3 w-3" /> Add material</button>
              </div>
            </div>
          ) : dpr.materials.length === 0 ? (
            <div className="text-xs text-gray-500">No materials consumed.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-accent-50 text-xs text-gray-600"><tr>
                <th className="text-left px-2 py-1.5">Item</th>
                <th className="text-right px-2 py-1.5">Qty</th>
                <th className="text-left px-2 py-1.5">UOM</th>
                <th className="text-right px-2 py-1.5">Rate (snapshot)</th>
                <th className="text-right px-2 py-1.5">Amount</th>
                <th className="text-left px-2 py-1.5">Remarks</th>
              </tr></thead>
              <tbody>{dpr.materials.map(m => (
                <tr key={m.id} className="border-t border-gray-100">
                  <td className="px-2 py-1.5">{m.item ? `${m.item.code} — ${m.item.name}` : "—"}</td>
                  <td className="px-2 py-1.5 text-right">{m.quantity}</td>
                  <td className="px-2 py-1.5 text-xs">{m.uom?.code ?? "—"}</td>
                  <td className="px-2 py-1.5 text-right text-gray-500">{isPosted ? `₹${m.unitRate}` : "—"}</td>
                  <td className="px-2 py-1.5 text-right font-medium">{isPosted ? `₹${m.amount}` : "—"}</td>
                  <td className="px-2 py-1.5 text-xs text-gray-500">{m.remarks ?? "—"}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
        </div>
      </section>

      {!isPosted && !editing && (
        <div className="flex justify-end">
          <Button onClick={post} disabled={busy}>
            <Lock className="h-3.5 w-3.5 mr-1" /> Post DPR
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <DocDetailLayout
      backHref="/projects/dpr"
      backLabel="DPRs"
      title={`DPR — ${new Date(dpr.dprDate).toISOString().slice(0, 10)}`}
      subtitle={dpr.remarks ?? undefined}
      statusBadge={<span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded ${
        dpr.status === "posted" ? "bg-blue-100 text-blue-700" :
        dpr.status === "submitted" ? "bg-green-100 text-green-700" :
        "bg-gray-100 text-gray-600"
      }`}>{dpr.status}</span>}
      meta={[
        { label: "Project", value: dpr.project?.name ?? "—" },
        { label: "Weather", value: dpr.weather ?? "—" },
        { label: "Reported By", value: dpr.reportedById },
        { label: "Activities", value: dpr.lines.length },
        { label: "Materials", value: dpr.materials.length },
      ]}
      lineColumns={columns}
      lines={dpr.lines}
      footer={footer}
    />
  );
}
