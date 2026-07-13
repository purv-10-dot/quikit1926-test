"use client";

/**
 * RFQ form — bespoke because it has TWO repeating sections:
 *   - lines (item + qty + uom + spec)
 *   - vendors (multi-select of CnVendor)
 *
 * MultiLineDocForm only handles one `lines` array + scalar headers, so RFQ
 * gets its own slim form. The vendor multi-select is a checkbox grid for
 * speed and clarity.
 */
import { useEffect, useState } from "react";
import {
  SlidePanel, Button, Input, Select, Textarea, NumberInput, Checkbox,
  Field, FormRow, FormSection,
} from "@quikit/ui";
import { Plus, Trash2 } from "lucide-react";

interface Opt { id: string; name: string; code?: string }

interface LineRow {
  itemId: string;
  quantity: number | null;
  uomId: string;
  specification: string | null;
  // Carries the source indent line id so the PR → Indent → RFQ → PO
  // chain stays linked (the rollup that powers the PR's PO column walks
  // this). Null for lines added manually / on a blank RFQ.
  sourceIndentLineId: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

const blankLine = (): LineRow => ({ itemId: "", quantity: null, uomId: "", specification: null, sourceIndentLineId: null });

export function RfqFormPanel({ open, onClose, onSaved }: Props) {
  const [header, setHeader] = useState({
    rfqNumber: `RFQ-${Date.now().toString().slice(-6)}`,
    indentId: "",
    projectId: "",
    rfqDate: new Date().toISOString().slice(0, 10),
    closingDate: "",
    remarks: "",
  });
  const [lines, setLines] = useState<LineRow[]>([blankLine()]);
  const [vendorIds, setVendorIds] = useState<Set<string>>(new Set());
  const [projects, setProjects] = useState<Opt[]>([]);
  const [vendors, setVendors] = useState<Opt[]>([]);
  const [indents, setIndents] = useState<Opt[]>([]);
  const [items_, setItems_] = useState<Opt[]>([]);
  const [uoms, setUoms] = useState<Opt[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setHeader((h) => ({
      ...h,
      rfqNumber: `RFQ-${Date.now().toString().slice(-6)}`,
      rfqDate: new Date().toISOString().slice(0, 10),
    }));
    setLines([blankLine()]);
    setVendorIds(new Set());
    setErr(null);
    fetch("/api/masters/projects").then(r => r.json()).then(j => j.success && setProjects(j.data));
    fetch("/api/masters/vendors?status=active").then(r => r.json()).then(j => j.success && setVendors(j.data));
    fetch("/api/purchase/indents").then(r => r.json()).then(j => j.success && setIndents(j.data.map((i: { id: string; indentNumber: string }) => ({ id: i.id, name: i.indentNumber }))));
    fetch("/api/masters/items").then(r => r.json()).then(j => j.success && setItems_(j.data));
    fetch("/api/masters/uom").then(r => r.json()).then(j => j.success && setUoms(j.data.filter((u: { status?: string }) => u.status === "active")));
  }, [open]);

  function updateLine(idx: number, patch: Partial<LineRow>) {
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  // Picking a source Indent prefills the line grid from that indent's
  // open lines, stamping each with its `sourceIndentLineId`. That id is
  // what keeps the PR → Indent → RFQ → PO chain linked all the way to
  // the PR's "PO" column. Choosing "— blank RFQ —" resets to one empty
  // line (a standalone RFQ with no indent link).
  async function selectIndent(indentId: string) {
    setHeader((h) => ({ ...h, indentId }));
    if (!indentId) {
      setLines([blankLine()]);
      return;
    }
    try {
      const res = await fetch(`/api/purchase/indents/${indentId}`);
      const ind = await res.json();
      const indentLines: Array<Record<string, unknown>> = Array.isArray(ind?.lines) ? ind.lines : [];
      const seeded: LineRow[] = indentLines.map((l) => ({
        itemId: String(l.itemId ?? ""),
        quantity:
          Number(l.qtyOpen ?? l.qtyRequested ?? l.indentedQty ?? l.requiredQty ?? 0) || null,
        uomId: String(l.uomId ?? ""),
        specification: (l.qualitySpec as string) || (l.specification as string) || null,
        sourceIndentLineId: String(l.id ?? l.lineId ?? "") || null,
      }));
      setLines(seeded.length > 0 ? seeded : [blankLine()]);
      const projectId = ind?.projectId ? String(ind.projectId) : "";
      if (projectId) setHeader((h) => ({ ...h, projectId }));
    } catch {
      setErr("Failed to load indent lines");
    }
  }
  function toggleVendor(id: string) {
    setVendorIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function save() {
    setBusy(true);
    setErr(null);
    try {
      const body = {
        rfqNumber: header.rfqNumber,
        indentId: header.indentId || null,
        projectId: header.projectId,
        rfqDate: header.rfqDate,
        closingDate: header.closingDate || null,
        remarks: header.remarks || null,
        lines: lines.map((l) => ({
          itemId: l.itemId,
          quantity: l.quantity ?? 0,
          uomId: l.uomId,
          specification: l.specification,
          sourceIndentLineId: l.sourceIndentLineId,
        })),
        vendorIds: [...vendorIds],
      };
      const res = await fetch("/api/purchase/rfqs", {
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

  const headerValid = header.rfqNumber && header.projectId && header.rfqDate;
  const linesValid = lines.length > 0 && lines.every((l) => l.itemId && l.quantity && l.uomId);
  const vendorsValid = vendorIds.size > 0;

  return (
    <SlidePanel
      open={open}
      onClose={onClose}
      title="Create RFQ"
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={save} disabled={busy || !headerValid || !linesValid || !vendorsValid}>
            {busy ? "Saving…" : "Create Draft"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {err && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{err}</div>}

        <FormSection title="Header">
          <FormRow cols={2}>
            <Field label="RFQ #" required>
              <Input value={header.rfqNumber} onChange={(e) => setHeader({ ...header, rfqNumber: e.target.value.toUpperCase() })} />
            </Field>
            <Field label="RFQ Date" required>
              <Input value={header.rfqDate} onChange={(e) => setHeader({ ...header, rfqDate: e.target.value })} placeholder="YYYY-MM-DD" />
            </Field>
          </FormRow>
          <FormRow cols={2}>
            <Field label="Project" required>
              <Select size="compact" value={header.projectId} onChange={(e) => setHeader({ ...header, projectId: e.target.value })} options={projects.map(p => ({ value: p.id, label: p.name }))} />
            </Field>
            <Field label="Source Indent">
              <Select size="compact" value={header.indentId} onChange={(e) => selectIndent(e.target.value)} options={[{ value: "", label: "— blank RFQ —" }, ...indents.map(i => ({ value: i.id, label: i.name }))]} />
            </Field>
          </FormRow>
          <Field label="Closing Date">
            <Input value={header.closingDate} onChange={(e) => setHeader({ ...header, closingDate: e.target.value })} placeholder="YYYY-MM-DD" />
          </Field>
          <Field label="Remarks">
            <Textarea rows={2} value={header.remarks} onChange={(e) => setHeader({ ...header, remarks: e.target.value })} />
          </Field>
        </FormSection>

        <FormSection title="Line Items">
          <div className="overflow-x-auto -mx-5 px-5">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-200">
                  <th className="py-2 pr-2 font-semibold" style={{ width: 240 }}>Item *</th>
                  <th className="py-2 pr-2 font-semibold" style={{ width: 90 }}>Qty *</th>
                  <th className="py-2 pr-2 font-semibold" style={{ width: 100 }}>UOM *</th>
                  <th className="py-2 pr-2 font-semibold">Specification</th>
                  <th style={{ width: 30 }}></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, idx) => (
                  <tr key={idx} className="border-b border-gray-100">
                    <td className="py-1.5 pr-2">
                      <Select size="compact" value={l.itemId} onChange={(e) => updateLine(idx, { itemId: e.target.value })}
                        options={items_.map(i => ({ value: i.id, label: `${i.code} — ${i.name}` }))}
                        placeholder="— pick item —" className="text-xs" />
                    </td>
                    <td className="py-1.5 pr-2">
                      <NumberInput size="compact" value={l.quantity} min={0} onChange={(v) => updateLine(idx, { quantity: v })} className="text-xs text-right" />
                    </td>
                    <td className="py-1.5 pr-2">
                      <Select size="compact" value={l.uomId} onChange={(e) => updateLine(idx, { uomId: e.target.value })}
                        options={uoms.map(u => ({ value: u.id, label: u.code ?? u.name }))} className="text-xs" />
                    </td>
                    <td className="py-1.5 pr-2">
                      <Input size="compact" value={l.specification ?? ""} onChange={(e) => updateLine(idx, { specification: e.target.value || null })} className="text-xs" />
                    </td>
                    <td className="py-1.5">
                      <button type="button" onClick={() => lines.length > 1 && setLines(lines.filter((_, i) => i !== idx))}
                        disabled={lines.length === 1} className="p-1 text-gray-400 hover:text-red-600 disabled:opacity-30">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" onClick={() => setLines([...lines, blankLine()])}
            className="mt-2 flex items-center gap-1.5 text-xs text-accent-700 hover:text-accent-800 font-medium">
            <Plus className="h-3.5 w-3.5" /> Add Line
          </button>
        </FormSection>

        <FormSection title={`Vendors (${vendorIds.size} selected)`} description="Select vendors to solicit quotes from.">
          <div className="grid grid-cols-2 gap-1.5 max-h-60 overflow-y-auto border border-gray-200 rounded p-2">
            {vendors.map((v) => (
              <Checkbox
                key={v.id}
                checked={vendorIds.has(v.id)}
                onChange={() => toggleVendor(v.id)}
                label={<span className="text-xs">{v.name}</span>}
              />
            ))}
          </div>
          {vendors.length === 0 && <div className="text-xs text-gray-500 italic">No active vendors. Add vendors in Masters → Vendors first.</div>}
        </FormSection>
      </div>
    </SlidePanel>
  );
}
