"use client";

/**
 * RAB create form — bespoke because lines come from a chosen LOCKED BOQ.
 * User picks project → picks locked BOQ → form shows every non-group BOQ item
 * as a row. User fills in `cumulativeQtyDone` per item (total done till date).
 * Server computes priorCumulative + currentPeriodQty + amounts.
 */
import { useEffect, useMemo, useState } from "react";
import {
  SlidePanel, Button, Input, Select, Textarea, NumberInput,
  Field, FormRow, FormSection,
} from "@quikit/ui";

interface Opt { id: string; name: string }
interface BoqItem { id: string; description: string; code: string | null; quantity: string | null; rate: string | null; gstRate: string | null; uom: { code: string } | null; kind: "item" | "group" }

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function RabFormPanel({ open, onClose, onSaved }: Props) {
  const [header, setHeader] = useState({
    rabNumber: `RAB-${Date.now().toString().slice(-6)}`,
    projectId: "",
    boqId: "",
    rabDate: new Date().toISOString().slice(0, 10),
    billedTillDate: new Date().toISOString().slice(0, 10),
    remarks: "",
  });
  const [projects, setProjects] = useState<Opt[]>([]);
  const [boqs, setBoqs] = useState<Array<{ id: string; boqNumber: string; projectId: string }>>([]);
  const [boqItems, setBoqItems] = useState<BoqItem[]>([]);
  const [lines, setLines] = useState<Record<string, { cumulativeQtyDone: number | null; gstRate: number | null; remarks: string }>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setHeader((h) => ({
      ...h,
      rabNumber: `RAB-${Date.now().toString().slice(-6)}`,
      rabDate: new Date().toISOString().slice(0, 10),
      billedTillDate: new Date().toISOString().slice(0, 10),
    }));
    setBoqItems([]); setLines({}); setErr(null);
    fetch("/api/masters/projects").then(r => r.json()).then(j => j.success && setProjects(j.data));
    fetch("/api/projects/boq").then(r => r.json()).then(j => {
      if (j.success) setBoqs(j.data.filter((b: { status: string }) => b.status === "locked").map((b: { id: string; boqNumber: string; project: { id: string } | null }) => ({
        id: b.id, boqNumber: b.boqNumber, projectId: b.project?.id ?? "",
      })));
    });
  }, [open]);

  // When BOQ chosen, load its items
  useEffect(() => {
    if (!header.boqId) { setBoqItems([]); setLines({}); return; }
    fetch(`/api/projects/boq/${header.boqId}`).then(r => r.json()).then(j => {
      if (!j.success) return;
      const its: BoqItem[] = j.data.items.filter((i: BoqItem) => i.kind === "item");
      setBoqItems(its);
      setLines(Object.fromEntries(its.map(i => [i.id, { cumulativeQtyDone: null, gstRate: i.gstRate ? Number(i.gstRate) : null, remarks: "" }])));
    });
  }, [header.boqId]);

  // Filter BOQs by project
  const filteredBoqs = useMemo(() => {
    if (!header.projectId) return boqs;
    return boqs.filter(b => b.projectId === header.projectId);
  }, [boqs, header.projectId]);

  async function save() {
    setBusy(true); setErr(null);
    try {
      const linesToSend = boqItems
        .filter((i) => {
          const v = lines[i.id]?.cumulativeQtyDone;
          return v != null && v > 0;
        })
        .map((i) => ({
          boqItemId: i.id,
          cumulativeQtyDone: lines[i.id].cumulativeQtyDone!,
          gstRate: lines[i.id].gstRate,
          remarks: lines[i.id].remarks || null,
        }));
      if (linesToSend.length === 0) throw new Error("Enter cumulative qty > 0 for at least one item");

      const res = await fetch("/api/projects/rab", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...header, lines: linesToSend, remarks: header.remarks || null }),
      });
      const j = await res.json();
      if (!j.success) throw new Error(j.error ?? "Save failed");
      onSaved(); onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally { setBusy(false); }
  }

  const canSave = header.projectId && header.boqId && header.rabNumber && boqItems.length > 0 &&
    Object.values(lines).some(l => l.cumulativeQtyDone != null && l.cumulativeQtyDone > 0);

  return (
    <SlidePanel open={open} onClose={onClose} title="Create RAB" size="xl"
      footer={<>
        <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button onClick={save} disabled={busy || !canSave}>{busy ? "Saving…" : "Create Draft"}</Button>
      </>}>
      <div className="space-y-5">
        {err && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{err}</div>}

        <FormSection title="Header">
          <FormRow cols={2}>
            <Field label="RAB #" required><Input value={header.rabNumber} onChange={(e) => setHeader({ ...header, rabNumber: e.target.value.toUpperCase() })} /></Field>
            <Field label="RAB Date" required><Input value={header.rabDate} onChange={(e) => setHeader({ ...header, rabDate: e.target.value })} placeholder="YYYY-MM-DD" /></Field>
          </FormRow>
          <FormRow cols={2}>
            <Field label="Project" required>
              <Select size="compact" value={header.projectId} onChange={(e) => setHeader({ ...header, projectId: e.target.value, boqId: "" })}
                options={projects.map(p => ({ value: p.id, label: p.name }))} placeholder="— select —" />
            </Field>
            <Field label="Source BOQ (locked)" required>
              <Select size="compact" value={header.boqId} onChange={(e) => setHeader({ ...header, boqId: e.target.value })}
                options={filteredBoqs.map(b => ({ value: b.id, label: b.boqNumber }))} placeholder={header.projectId ? "— select BOQ —" : "Pick project first"} />
            </Field>
          </FormRow>
          <Field label="Billed Till Date" required hint="Period covered by this bill">
            <Input value={header.billedTillDate} onChange={(e) => setHeader({ ...header, billedTillDate: e.target.value })} placeholder="YYYY-MM-DD" />
          </Field>
          <Field label="Remarks"><Textarea rows={2} value={header.remarks} onChange={(e) => setHeader({ ...header, remarks: e.target.value })} /></Field>
        </FormSection>

        <FormSection title={boqItems.length > 0 ? `BOQ Items (${boqItems.length})` : "BOQ Items"}
          description="Enter the cumulative qty done till date per item. Server computes the incremental bill.">
          {boqItems.length === 0 ? (
            <div className="text-xs text-gray-500 italic">Pick a locked BOQ to see its items.</div>
          ) : (
            <div className="overflow-x-auto -mx-5 px-5">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-gray-500 border-b border-gray-200">
                    <th className="py-2 pr-2 font-semibold">Item</th>
                    <th className="py-2 pr-2 font-semibold text-right" style={{ width: 90 }}>BOQ Qty</th>
                    <th className="py-2 pr-2 font-semibold text-right" style={{ width: 90 }}>Rate</th>
                    <th className="py-2 pr-2 font-semibold" style={{ width: 120 }}>Cum. Qty Done</th>
                    <th className="py-2 pr-2 font-semibold" style={{ width: 70 }}>GST %</th>
                    <th className="py-2 pr-2 font-semibold" style={{ width: 140 }}>Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {boqItems.map((i) => (
                    <tr key={i.id} className="border-b border-gray-100">
                      <td className="py-1.5 pr-2">
                        {i.code && <span className="font-mono text-xs text-gray-600 mr-2">{i.code}</span>}
                        {i.description}
                      </td>
                      <td className="py-1.5 pr-2 text-right text-gray-600">{i.quantity ?? "—"} {i.uom?.code ?? ""}</td>
                      <td className="py-1.5 pr-2 text-right text-gray-600">₹{i.rate ?? "—"}</td>
                      <td className="py-1.5 pr-2">
                        <NumberInput size="compact" value={lines[i.id]?.cumulativeQtyDone ?? null} min={0}
                          onChange={(v) => setLines({ ...lines, [i.id]: { ...lines[i.id], cumulativeQtyDone: v } })}
                          className="text-xs text-right" />
                      </td>
                      <td className="py-1.5 pr-2">
                        <NumberInput size="compact" value={lines[i.id]?.gstRate ?? null} min={0} max={100}
                          onChange={(v) => setLines({ ...lines, [i.id]: { ...lines[i.id], gstRate: v } })}
                          className="text-xs text-right" />
                      </td>
                      <td className="py-1.5 pr-2">
                        <Input value={lines[i.id]?.remarks ?? ""}
                          onChange={(e) => setLines({ ...lines, [i.id]: { ...lines[i.id], remarks: e.target.value } })}
                          className="text-xs" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </FormSection>
      </div>
    </SlidePanel>
  );
}
