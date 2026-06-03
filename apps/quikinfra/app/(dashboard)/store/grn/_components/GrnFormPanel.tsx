"use client";

/**
 * GRN create form — bespoke because its "item" line isn't freely chosen,
 * it's a PO line that cascades from the PO header. Each line shows:
 *   - PO Line selector (filtered to pending qty > 0 on chosen PO)
 *   - auto-populated itemId / uomId / unitRate (from PO line)
 *   - receivedQty (validated ≤ pendingQty)
 *   - acceptedQty / rejectedQty  (must sum ≤ received)
 *   - qualityStatus + batchNo + remarks
 *
 * MultiLineDocForm can't express this easily (per-row options cascade
 * from header). Hand-built, but still uses @quikit/ui primitives.
 */
import { useEffect, useMemo, useState } from "react";
import {
  SlidePanel, Button, Input, Select, Textarea, NumberInput,
  Field, FormRow, FormSection,
} from "@quikit/ui";
import { Plus, Trash2 } from "lucide-react";

interface Opt { id: string; name: string; code?: string }
interface PoLine { id: string; item: { id: string; code: string; name: string }; uom: { id: string; code: string }; orderedQty: string; receivedQty: string; pendingQty: string; unitRate: string }
interface PoRef { id: string; poNumber: string; projectId: string; vendorId: string; lines: PoLine[] }

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

interface LineRow {
  poLineId: string;
  itemId: string;
  uomId: string;
  receivedQty: number | null;
  acceptedQty: number | null;
  rejectedQty: number | null;
  unitRate: number | null;
  qualityStatus: "pending" | "accepted" | "rejected" | "conditional";
  batchNo: string | null;
  remarks: string | null;
  /** For display only: pending qty at the moment PO was loaded. */
  _pending: number;
}

const blankLine = (): LineRow => ({
  poLineId: "", itemId: "", uomId: "",
  receivedQty: null, acceptedQty: null, rejectedQty: 0,
  unitRate: null, qualityStatus: "accepted", batchNo: null, remarks: null,
  _pending: 0,
});

export function GrnFormPanel({ open, onClose, onSaved }: Props) {
  const [header, setHeader] = useState({
    grnNumber: `GRN-${Date.now().toString().slice(-6)}`,
    poId: "",
    projectId: "",
    vendorId: "",
    grnDate: new Date().toISOString().slice(0, 10),
    locationId: "",
    supplierInvoiceNo: "",
    challanNo: "",
    receivedById: "",
    inspectedById: "",
    remarks: "",
  });
  const [lines, setLines] = useState<LineRow[]>([blankLine()]);
  const [openPOs, setOpenPOs] = useState<PoRef[]>([]);
  const [locations, setLocations] = useState<Opt[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setHeader((h) => ({
      ...h,
      grnNumber: `GRN-${Date.now().toString().slice(-6)}`,
      grnDate: new Date().toISOString().slice(0, 10),
    }));
    setLines([blankLine()]);
    setErr(null);
    // Load open POs (status sent or partially_received) + locations
    fetch("/api/purchase/orders?status=sent").then(r => r.json()).then(j => {
      if (j.success) return j.data;
      return [];
    }).then(async (sent) => {
      const pr = await fetch("/api/purchase/orders?status=partially_received").then(r => r.json());
      const combined = [...(sent ?? []), ...(pr.success ? pr.data : [])];
      // Fetch line details for each open PO (in parallel)
      const withLines = await Promise.all(combined.map(async (po: { id: string }) => {
        const d = await fetch(`/api/purchase/orders/${po.id}`).then(r => r.json());
        return d.success ? d.data : null;
      }));
      setOpenPOs(withLines.filter(Boolean));
    });
    fetch("/api/masters/locations").then(r => r.json()).then(j => j.success && setLocations(j.data));
  }, [open]);

  const selectedPO = useMemo(() => openPOs.find(p => p.id === header.poId) ?? null, [openPOs, header.poId]);

  // When PO changes, auto-fill project + vendor from the PO
  useEffect(() => {
    if (!selectedPO) return;
    setHeader((h) => ({ ...h, projectId: selectedPO.projectId, vendorId: selectedPO.vendorId }));
    // Reset lines (fresh receipts against the new PO)
    setLines([blankLine()]);
  }, [selectedPO]);

  function updateLine(idx: number, patch: Partial<LineRow>) {
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }
  function onPickPoLine(idx: number, poLineId: string) {
    const poLine = selectedPO?.lines.find(l => l.id === poLineId);
    if (!poLine) return updateLine(idx, { poLineId: "" });
    updateLine(idx, {
      poLineId,
      itemId: poLine.item.id,
      uomId: poLine.uom.id,
      unitRate: Number(poLine.unitRate),
      _pending: Number(poLine.pendingQty),
      receivedQty: null,
      acceptedQty: null,
    });
  }

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const body = {
        grnNumber: header.grnNumber,
        poId: header.poId,
        projectId: header.projectId,
        vendorId: header.vendorId,
        grnDate: header.grnDate,
        locationId: header.locationId,
        supplierInvoiceNo: header.supplierInvoiceNo || null,
        challanNo: header.challanNo || null,
        receivedById: header.receivedById,
        inspectedById: header.inspectedById || null,
        remarks: header.remarks || null,
        lines: lines.map((l) => ({
          poLineId: l.poLineId || null,
          itemId: l.itemId,
          receivedQty: l.receivedQty ?? 0,
          acceptedQty: l.acceptedQty ?? 0,
          rejectedQty: l.rejectedQty ?? 0,
          uomId: l.uomId,
          unitRate: l.unitRate ?? 0,
          qualityStatus: l.qualityStatus,
          batchNo: l.batchNo,
          remarks: l.remarks,
        })),
      };
      const res = await fetch("/api/store/grn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!j.success) throw new Error(j.error ?? "Save failed");
      onSaved();
      onClose();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  const headerValid = header.poId && header.locationId && header.receivedById;
  const linesValid = lines.length > 0 && lines.every((l) => {
    if (!l.poLineId || !l.receivedQty || !l.acceptedQty) return false;
    if (l.receivedQty > l._pending) return false;
    if ((l.acceptedQty ?? 0) + (l.rejectedQty ?? 0) > (l.receivedQty ?? 0)) return false;
    return true;
  });

  return (
    <SlidePanel
      open={open}
      onClose={onClose}
      title="Create GRN"
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={busy || !headerValid || !linesValid}>
            {busy ? "Saving…" : "Create Draft"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {err && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{err}</div>}

        <FormSection title="Header">
          <FormRow cols={2}>
            <Field label="GRN #" required>
              <Input value={header.grnNumber} onChange={(e) => setHeader({ ...header, grnNumber: e.target.value.toUpperCase() })} />
            </Field>
            <Field label="GRN Date" required>
              <Input value={header.grnDate} onChange={(e) => setHeader({ ...header, grnDate: e.target.value })} placeholder="YYYY-MM-DD" />
            </Field>
          </FormRow>
          <FormRow cols={2}>
            <Field label="Source PO" required hint="Only open POs (sent / partially received)">
              <Select
                value={header.poId}
                onChange={(e) => setHeader({ ...header, poId: e.target.value })}
                options={openPOs.map((p) => ({ value: p.id, label: p.poNumber }))}
                placeholder="— select a PO —"
              />
            </Field>
            <Field label="Receiving Location" required>
              <Select
                value={header.locationId}
                onChange={(e) => setHeader({ ...header, locationId: e.target.value })}
                options={locations.map((l) => ({ value: l.id, label: l.name }))}
              />
            </Field>
          </FormRow>
          <FormRow cols={2}>
            <Field label="Supplier Invoice #">
              <Input value={header.supplierInvoiceNo} onChange={(e) => setHeader({ ...header, supplierInvoiceNo: e.target.value })} />
            </Field>
            <Field label="Challan #">
              <Input value={header.challanNo} onChange={(e) => setHeader({ ...header, challanNo: e.target.value })} />
            </Field>
          </FormRow>
          <FormRow cols={2}>
            <Field label="Received By (user id)" required>
              <Input value={header.receivedById} onChange={(e) => setHeader({ ...header, receivedById: e.target.value })} />
            </Field>
            <Field label="Inspected By (user id)">
              <Input value={header.inspectedById} onChange={(e) => setHeader({ ...header, inspectedById: e.target.value })} />
            </Field>
          </FormRow>
          <Field label="Remarks">
            <Textarea rows={2} value={header.remarks} onChange={(e) => setHeader({ ...header, remarks: e.target.value })} />
          </Field>
        </FormSection>

        <FormSection title="Lines" description={selectedPO ? `${selectedPO.lines.filter(l => Number(l.pendingQty) > 0).length} line(s) pending on this PO` : "Pick a PO first"}>
          {!selectedPO ? (
            <div className="text-xs text-gray-500 italic">Select a PO in the header to pick lines.</div>
          ) : (
            <>
              <div className="overflow-x-auto -mx-5 px-5">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-gray-500 border-b border-gray-200">
                      <th className="py-2 pr-2 font-semibold" style={{ width: 260 }}>PO Line (pending qty)</th>
                      <th className="py-2 pr-2 font-semibold" style={{ width: 90 }}>Received</th>
                      <th className="py-2 pr-2 font-semibold" style={{ width: 90 }}>Accepted</th>
                      <th className="py-2 pr-2 font-semibold" style={{ width: 80 }}>Rejected</th>
                      <th className="py-2 pr-2 font-semibold" style={{ width: 110 }}>Quality</th>
                      <th className="py-2 pr-2 font-semibold" style={{ width: 90 }}>Batch</th>
                      <th className="py-2 pr-2 font-semibold" style={{ width: 120 }}>Remarks</th>
                      <th style={{ width: 30 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line, idx) => {
                      const overReceived = line.receivedQty != null && line.receivedQty > line._pending;
                      const sumOff = (line.acceptedQty ?? 0) + (line.rejectedQty ?? 0) > (line.receivedQty ?? 0);
                      const availablePoLines = selectedPO.lines.filter(l =>
                        Number(l.pendingQty) > 0 || l.id === line.poLineId
                      );
                      return (
                        <tr key={idx} className="border-b border-gray-100 align-top">
                          <td className="py-1.5 pr-2">
                            <Select
                              value={line.poLineId}
                              onChange={(e) => onPickPoLine(idx, e.target.value)}
                              options={availablePoLines.map(pl => ({
                                value: pl.id,
                                label: `${pl.item.code} — pending ${pl.pendingQty} ${pl.uom.code}`,
                              }))}
                              placeholder="— pick line —"
                              className="text-xs"
                            />
                          </td>
                          <td className="py-1.5 pr-2">
                            <NumberInput
                              value={line.receivedQty}
                              min={0}
                              max={line._pending}
                              onChange={(v) => updateLine(idx, { receivedQty: v, acceptedQty: v ?? null })}
                              className={`text-xs text-right ${overReceived ? "border-red-300" : ""}`}
                            />
                            {overReceived && <div className="text-[10px] text-red-600 mt-0.5">&gt; pending ({line._pending})</div>}
                          </td>
                          <td className="py-1.5 pr-2">
                            <NumberInput
                              value={line.acceptedQty}
                              min={0}
                              onChange={(v) => updateLine(idx, { acceptedQty: v })}
                              className={`text-xs text-right ${sumOff ? "border-red-300" : ""}`}
                            />
                          </td>
                          <td className="py-1.5 pr-2">
                            <NumberInput
                              value={line.rejectedQty}
                              min={0}
                              onChange={(v) => updateLine(idx, { rejectedQty: v ?? 0 })}
                              className="text-xs text-right"
                            />
                          </td>
                          <td className="py-1.5 pr-2">
                            <Select
                              value={line.qualityStatus}
                              onChange={(e) => updateLine(idx, { qualityStatus: e.target.value as LineRow["qualityStatus"] })}
                              options={[
                                { value: "accepted", label: "Accepted" },
                                { value: "pending", label: "Pending" },
                                { value: "rejected", label: "Rejected" },
                                { value: "conditional", label: "Conditional" },
                              ]}
                              className="text-xs"
                            />
                          </td>
                          <td className="py-1.5 pr-2">
                            <Input
                              value={line.batchNo ?? ""}
                              onChange={(e) => updateLine(idx, { batchNo: e.target.value || null })}
                              className="text-xs"
                            />
                          </td>
                          <td className="py-1.5 pr-2">
                            <Input
                              value={line.remarks ?? ""}
                              onChange={(e) => updateLine(idx, { remarks: e.target.value || null })}
                              className="text-xs"
                            />
                          </td>
                          <td className="py-1.5">
                            <button
                              type="button"
                              onClick={() => lines.length > 1 && setLines(lines.filter((_, i) => i !== idx))}
                              disabled={lines.length === 1}
                              className="p-1 text-gray-400 hover:text-red-600 disabled:opacity-30"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <button
                type="button"
                onClick={() => setLines([...lines, blankLine()])}
                className="mt-2 flex items-center gap-1.5 text-xs text-accent-700 hover:text-accent-800 font-medium"
              >
                <Plus className="h-3.5 w-3.5" /> Add Line
              </button>
            </>
          )}
        </FormSection>
      </div>
    </SlidePanel>
  );
}
