"use client";

/**
 * BOQ create form — supports simple 2-level hierarchy by toggling `kind`
 * (item | group). For an item, user can pick any earlier GROUP in the same
 * form as parent (via "Part of group" dropdown). Deeper nesting / later-
 * ordered parents = build via API for now.
 */
import { useEffect, useState } from "react";
import {
  SlidePanel, Button, Input, Select, Textarea, NumberInput,
  Field, FormRow, FormSection,
} from "@quikit/ui";
import { Plus, Trash2 } from "lucide-react";

interface Opt { id: string; name: string; code?: string }
interface Line {
  kind: "item" | "group";
  description: string;
  code: string | null;
  itemId: string | null;
  uomId: string | null;
  quantity: number | null;
  rate: number | null;
  gstRate: number | null;
  /** For items: which in-form group (index) they belong to, or null for top-level. */
  parentIdx: number | null;
}

const blankLine = (): Line => ({
  kind: "item", description: "", code: null, itemId: null, uomId: null,
  quantity: null, rate: null, gstRate: null, parentIdx: null,
});

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function EstimationFormPanel({ open, onClose, onSaved }: Props) {
  const [header, setHeader] = useState({
    estimationNumber: `EST-${Date.now().toString().slice(-6)}`,
    projectId: "",
    estimationDate: new Date().toISOString().slice(0, 10),
    currency: "INR",
    remarks: "",
  });
  const [lines, setLines] = useState<Line[]>([blankLine()]);
  const [projects, setProjects] = useState<Opt[]>([]);
  const [items, setItems] = useState<Opt[]>([]);
  const [uoms, setUoms] = useState<Opt[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setHeader((h) => ({
      ...h,
      estimationNumber: `EST-${Date.now().toString().slice(-6)}`,
      estimationDate: new Date().toISOString().slice(0, 10),
    }));
    setLines([blankLine()]);
    setErr(null);
    fetch("/api/masters/projects").then(r => r.json()).then(j => j.success && setProjects(j.data));
    fetch("/api/masters/items").then(r => r.json()).then(j => j.success && setItems(j.data));
    fetch("/api/masters/uom").then(r => r.json()).then(j => j.success && setUoms(j.data));
  }, [open]);

  function updateLine(idx: number, patch: Partial<Line>) {
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }
  function addLine(kind: "item" | "group") {
    setLines((ls) => [...ls, { ...blankLine(), kind }]);
  }
  function removeLine(idx: number) {
    setLines((ls) => (ls.length > 1 ? ls.filter((_, i) => i !== idx) : ls));
  }

  // Available parents (groups earlier in the array)
  function groupOptionsForLine(idx: number): Array<{ value: string; label: string }> {
    const opts: Array<{ value: string; label: string }> = [{ value: "", label: "— top level —" }];
    for (let i = 0; i < idx; i++) {
      if (lines[i].kind === "group" && lines[i].description) {
        opts.push({ value: String(i), label: lines[i].description });
      }
    }
    return opts;
  }

  async function save() {
    setBusy(true); setErr(null);
    try {
      const body = {
        estimationNumber: header.estimationNumber,
        projectId: header.projectId,
        estimationDate: header.estimationDate,
        currency: header.currency,
        remarks: header.remarks || null,
        items: lines.map((l, sortOrder) => ({
          sortOrder,
          kind: l.kind,
          description: l.description,
          code: l.code,
          itemId: l.kind === "item" ? l.itemId : null,
          uomId: l.kind === "item" ? l.uomId : null,
          quantity: l.kind === "item" ? l.quantity : null,
          rate: l.kind === "item" ? l.rate : null,
          gstRate: l.kind === "item" ? l.gstRate : null,
          parentId: l.parentIdx != null ? `idx:${l.parentIdx}` : null,
        })),
      };
      const res = await fetch("/api/projects/estimation", {
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

  const subtotal = lines.reduce((s, l) => s + (l.kind === "item" ? (l.quantity ?? 0) * (l.rate ?? 0) : 0), 0);
  const taxTotal = lines.reduce((s, l) => {
    if (l.kind !== "item" || !l.gstRate) return s;
    return s + (l.quantity ?? 0) * (l.rate ?? 0) * (l.gstRate / 100);
  }, 0);

  const headerValid = header.estimationNumber && header.projectId && header.estimationDate;
  const linesValid = lines.every((l) => l.description && (l.kind === "group" || (l.quantity && l.rate && l.uomId)));

  return (
    <SlidePanel
      open={open}
      onClose={onClose}
      title="Create Estimation"
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
            <Field label="Estimation #" required><Input value={header.estimationNumber} onChange={(e) => setHeader({ ...header, estimationNumber: e.target.value.toUpperCase() })} /></Field>
            <Field label="Estimation Date" required><Input value={header.estimationDate} onChange={(e) => setHeader({ ...header, estimationDate: e.target.value })} placeholder="YYYY-MM-DD" /></Field>
          </FormRow>
          <FormRow cols={2}>
            <Field label="Project" required>
              <Select size="compact" value={header.projectId} onChange={(e) => setHeader({ ...header, projectId: e.target.value })}
                options={projects.map(p => ({ value: p.id, label: p.name }))} placeholder="— select —" />
            </Field>
            <Field label="Currency"><Input value={header.currency} onChange={(e) => setHeader({ ...header, currency: e.target.value.toUpperCase() })} /></Field>
          </FormRow>
          <Field label="Remarks"><Textarea rows={2} value={header.remarks} onChange={(e) => setHeader({ ...header, remarks: e.target.value })} /></Field>
        </FormSection>

        <FormSection title="Items" description="Mix groups (headers) and items. Items can belong to a group created earlier in the list.">
          <div className="overflow-x-auto -mx-5 px-5">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-200">
                  <th className="py-2 pr-2 font-semibold" style={{ width: 80 }}>Kind</th>
                  <th className="py-2 pr-2 font-semibold" style={{ width: 260 }}>Description</th>
                  <th className="py-2 pr-2 font-semibold" style={{ width: 130 }}>Group</th>
                  <th className="py-2 pr-2 font-semibold" style={{ width: 180 }}>Item *</th>
                  <th className="py-2 pr-2 font-semibold" style={{ width: 80 }}>Qty</th>
                  <th className="py-2 pr-2 font-semibold" style={{ width: 80 }}>UOM</th>
                  <th className="py-2 pr-2 font-semibold" style={{ width: 90 }}>Rate</th>
                  <th className="py-2 pr-2 font-semibold" style={{ width: 70 }}>GST %</th>
                  <th className="py-2 pr-2 font-semibold text-right" style={{ width: 90 }}>Amount</th>
                  <th style={{ width: 30 }}></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, idx) => {
                  const amt = l.kind === "item" ? (l.quantity ?? 0) * (l.rate ?? 0) : 0;
                  const isGroup = l.kind === "group";
                  return (
                    <tr key={idx} className={`border-b border-gray-100 align-top ${isGroup ? "bg-accent-50/30" : ""}`}>
                      <td className="py-1.5 pr-2">
                        <Select size="compact" value={l.kind} onChange={(e) => updateLine(idx, { kind: e.target.value as "item" | "group" })}
                          options={[{ value: "item", label: "Item" }, { value: "group", label: "Group" }]} className="text-xs" />
                      </td>
                      <td className="py-1.5 pr-2">
                        <Input size="compact" value={l.description} onChange={(e) => updateLine(idx, { description: e.target.value })} className="text-xs" />
                      </td>
                      <td className="py-1.5 pr-2">
                        {isGroup ? "—" : (
                          <Select size="compact" value={l.parentIdx == null ? "" : String(l.parentIdx)}
                            onChange={(e) => updateLine(idx, { parentIdx: e.target.value === "" ? null : Number(e.target.value) })}
                            options={groupOptionsForLine(idx)} className="text-xs" />
                        )}
                      </td>
                      <td className="py-1.5 pr-2">
                        {isGroup ? "—" : (
                          <Select size="compact" value={l.itemId ?? ""}
                            onChange={(e) => {
                              const itemId = e.target.value || null;
                              const matched = items.find(i => i.id === itemId);
                              updateLine(idx, { itemId, description: matched ? `${matched.code ?? ""} ${matched.name}`.trim() : l.description });
                            }}
                            options={[{ value: "", label: "— custom —" }, ...items.map(i => ({ value: i.id, label: `${i.code} — ${i.name}` }))]} className="text-xs" />
                        )}
                      </td>
                      <td className="py-1.5 pr-2">
                        {isGroup ? "—" : <NumberInput size="compact" value={l.quantity} min={0} onChange={(v) => updateLine(idx, { quantity: v })} className="text-xs text-right" />}
                      </td>
                      <td className="py-1.5 pr-2">
                        {isGroup ? "—" : (
                          <Select size="compact" value={l.uomId ?? ""} onChange={(e) => updateLine(idx, { uomId: e.target.value || null })}
                            options={uoms.map(u => ({ value: u.id, label: u.code ?? u.name }))} className="text-xs" />
                        )}
                      </td>
                      <td className="py-1.5 pr-2">
                        {isGroup ? "—" : <NumberInput size="compact" value={l.rate} min={0} onChange={(v) => updateLine(idx, { rate: v })} className="text-xs text-right" />}
                      </td>
                      <td className="py-1.5 pr-2">
                        {isGroup ? "—" : <NumberInput size="compact" value={l.gstRate} min={0} max={100} onChange={(v) => updateLine(idx, { gstRate: v })} className="text-xs text-right" />}
                      </td>
                      <td className="py-1.5 pr-2 text-right text-gray-700 font-medium">{amt ? amt.toLocaleString() : "—"}</td>
                      <td className="py-1.5">
                        <button type="button" onClick={() => removeLine(idx)} disabled={lines.length === 1}
                          className="p-1 text-gray-400 hover:text-red-600 disabled:opacity-30">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-300">
                  <td colSpan={8} className="py-2 pr-2 text-right text-gray-600">Subtotal</td>
                  <td className="py-2 pr-2 text-right font-semibold text-gray-900">₹{subtotal.toLocaleString()}</td>
                  <td></td>
                </tr>
                <tr>
                  <td colSpan={8} className="py-1 pr-2 text-right text-gray-500">Tax</td>
                  <td className="py-1 pr-2 text-right text-gray-700">₹{taxTotal.toLocaleString()}</td>
                  <td></td>
                </tr>
                <tr>
                  <td colSpan={8} className="py-2 pr-2 text-right text-gray-600 font-semibold">Total</td>
                  <td className="py-2 pr-2 text-right font-semibold text-accent-700">₹{(subtotal + taxTotal).toLocaleString()}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="mt-2 flex gap-2">
            <button type="button" onClick={() => addLine("item")} className="flex items-center gap-1.5 text-xs text-accent-700 hover:text-accent-800 font-medium">
              <Plus className="h-3.5 w-3.5" /> Add Item
            </button>
            <button type="button" onClick={() => addLine("group")} className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-gray-800 font-medium">
              <Plus className="h-3.5 w-3.5" /> Add Group Header
            </button>
          </div>
        </FormSection>
      </div>
    </SlidePanel>
  );
}
