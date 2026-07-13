"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Combobox } from "@/components/ui/combobox";
import { useFormDraft } from "@/lib/hooks/use-form-draft";
import { useNextNumber } from "@/lib/hooks/use-next-number";
import { useCurrency } from "@/lib/currency";
import { todayISO } from "@/lib/utils/dates";

type Option = { id: string; label: string };
type Item = { id: string; name: string; sales_price: number };
type LineRow = { description: string; quantity: string; rate: string; discount: string; item_id: string };

const selectClass = "h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";
const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const emptyLine = (): LineRow => ({ description: "", quantity: "1", rate: "0", discount: "0", item_id: "" });
const CHALLAN_TYPES = [
  { value: "supply_on_approval", label: "Supply on Approval" },
  { value: "job_work", label: "Job Work" },
  { value: "supply_of_liquid_gas", label: "Supply of Liquid Gas" },
  { value: "lines_sales", label: "Line Sales" },
  { value: "others", label: "Others" }
];

async function fetchList(path: string): Promise<Array<Record<string, unknown>>> {
  const r = await fetch(path);
  if (!r.ok) return [];
  const payload = (await r.json()) as { data?: unknown };
  return Array.isArray(payload.data) ? (payload.data as Array<Record<string, unknown>>) : [];
}

export function DeliveryChallanForm({ challanId }: { challanId?: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { currency, format } = useCurrency();
  const isEdit = Boolean(challanId);

  const [contactId, setContactId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [challanNumber, setChallanNumber] = useState("");
  const [reference, setReference] = useState("");
  const [challanDate, setChallanDate] = useState(todayISO());
  const [challanType, setChallanType] = useState("");
  const [notes, setNotes] = useState("");
  const [adjustment, setAdjustment] = useState("0");
  const [lines, setLines] = useState<LineRow[]>([emptyLine()]);
  const [submitting, setSubmitting] = useState(false);

  const { data: customers = [] } = useQuery({ queryKey: ["dc-form-customers"], staleTime: 0, queryFn: async () => (await fetchList("/api/v1/customers?per_page=200")).map((r) => ({ id: String(r.id), label: String(r.display_name ?? "Customer") }) as Option) });
  const { data: warehouses = [] } = useQuery({ queryKey: ["dc-form-warehouses"], queryFn: async () => (await fetchList("/api/v1/warehouses?per_page=200")).map((r) => ({ id: String(r.id), label: String(r.name ?? "") }) as Option) });
  const { data: items = [] } = useQuery({ queryKey: ["dc-form-items"], staleTime: 0, queryFn: async () => (await fetchList("/api/v1/inventory?per_page=200")).map((r) => ({ id: String(r.id), name: String(r.name ?? ""), sales_price: Number(r.sales_price ?? 0) }) as Item) });
  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const { data: existing } = useQuery({
    queryKey: ["delivery-challan", challanId],
    queryFn: async () => {
      const r = await fetch(`/api/v1/delivery-challans/${challanId}`);
      if (!r.ok) return null;
      return ((await r.json()) as { data?: Record<string, unknown> }).data ?? null;
    },
    enabled: isEdit
  });

  useEffect(() => {
    if (!existing) return;
    setContactId(String(existing.contact_id ?? ""));
    setWarehouseId(existing.warehouse_id ? String(existing.warehouse_id) : "");
    setChallanNumber(String(existing.challan_number ?? ""));
    setReference(String(existing.reference ?? ""));
    setChallanDate(String(existing.challan_date ?? todayISO()).slice(0, 10));
    setChallanType(String(existing.challan_type ?? ""));
    setNotes(String(existing.notes ?? ""));
    setAdjustment(String(existing.adjustment ?? "0"));
    const rows = Array.isArray(existing.lines) ? (existing.lines as Array<Record<string, unknown>>) : [];
    if (rows.length) setLines(rows.map((l) => ({ description: String(l.description ?? ""), quantity: String(l.quantity ?? "1"), rate: String(l.rate ?? "0"), discount: String(l.discount ?? "0"), item_id: String(l.item_id ?? "") })));
  }, [existing]);

  // Prefill the next delivery challan number (Zoho-style) for new challans.
  const nextNum = useNextNumber("delivery-challan", !isEdit);
  useEffect(() => { if (!isEdit && nextNum.preview) setChallanNumber((cur) => cur || nextNum.preview || ""); }, [nextNum.preview, isEdit]);

  // Preserve in-progress data across a Combobox "+ New" round-trip (create only).
  const { clearDraft } = useFormDraft(
    "qf-draft:delivery-challan",
    { contactId, warehouseId, challanNumber, reference, challanDate, challanType, notes, adjustment, lines },
    (d) => {
      if (d.contactId !== undefined) setContactId(d.contactId);
      if (d.warehouseId !== undefined) setWarehouseId(d.warehouseId);
      if (d.challanNumber !== undefined) setChallanNumber(d.challanNumber);
      if (d.reference !== undefined) setReference(d.reference);
      if (d.challanDate !== undefined) setChallanDate(d.challanDate);
      if (d.challanType !== undefined) setChallanType(d.challanType);
      if (d.notes !== undefined) setNotes(d.notes);
      if (d.adjustment !== undefined) setAdjustment(d.adjustment);
      if (Array.isArray(d.lines) && d.lines.length) setLines(d.lines);
    },
    { enabled: !isEdit }
  );

  const totals = useMemo(() => {
    let subtotal = 0, discountTotal = 0;
    const computed = lines.map((line) => {
      const gross = round2(Number(line.quantity || 0) * Number(line.rate || 0));
      const discount = round2(Number(line.discount || 0));
      subtotal = round2(subtotal + gross); discountTotal = round2(discountTotal + discount);
      return round2(gross - discount);
    });
    return { computed, subtotal, discountTotal, total: round2(subtotal - discountTotal + Number(adjustment || 0)) };
  }, [lines, adjustment]);

  const updateLine = (i: number, patch: Partial<LineRow>) => setLines((c) => c.map((l, p) => (p === i ? { ...l, ...patch } : l)));
  const addLine = () => setLines((c) => [...c, emptyLine()]);
  const removeLine = (i: number) => setLines((c) => (c.length === 1 ? c : c.filter((_, p) => p !== i)));

  const save = async () => {
    if (!contactId) { toast.error("Select a customer."); return; }
    if (!challanType) { toast.error("Choose a challan type."); return; }
    const validLines = lines.filter((l) => (l.description.trim() !== "" || l.item_id) && Number(l.quantity) > 0);
    if (validLines.length === 0) { toast.error("Add at least one item."); return; }

    const payload = {
      contact_id: contactId,
      warehouse_id: warehouseId || null,
      challan_number: nextNum.numberToSubmit(challanNumber),
      reference: reference.trim() || null,
      challan_date: challanDate,
      challan_type: challanType,
      status: "draft",
      adjustment: Number(adjustment) || 0,
      notes: notes.trim() || null,
      lines: validLines.map((l) => ({ item_id: l.item_id || null, description: (l.description.trim() || itemsById.get(l.item_id)?.name) ?? "", quantity: Number(l.quantity), rate: Number(l.rate), discount: Number(l.discount || 0) }))
    };

    setSubmitting(true);
    try {
      const res = await fetch(isEdit ? `/api/v1/delivery-challans/${challanId}` : "/api/v1/delivery-challans", { method: isEdit ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        toast.error(body?.error?.message ?? "Could not save the delivery challan.");
        return;
      }
      const saved = (await res.json()) as { data?: { id?: string } };
      const id = saved?.data?.id ?? challanId;
      toast.success(isEdit ? "Delivery challan updated." : "Delivery challan saved as draft.");
      clearDraft();
      qc.invalidateQueries({ queryKey: ["delivery-challans"] });
      router.push(id ? `/delivery-challans/${id}` : "/delivery-challans");
    } finally { setSubmitting(false); }
  };

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{isEdit ? "Edit Delivery Challan" : "New Delivery Challan"}</h1>
        <Button asChild size="sm" variant="ghost"><a href="/delivery-challans" aria-label="Close"><X className="h-4 w-4" /></a></Button>
      </div>

      <Card><CardContent className="grid gap-5 pt-6 md:grid-cols-2">
        <div>
          <Label className="text-destructive">Customer Name*</Label>
          <div className="mt-1">
            <Combobox value={contactId} placeholder="Select or add a customer" searchPlaceholder="Search customers…" createHref="/customers/new" createLabel="New Customer"
              onChange={(val) => setContactId(val)} options={customers.map((c) => ({ value: c.id, label: c.label }))} />
          </div>
        </div>
        <div>
          <Label>Location</Label>
          <div className="mt-1">
            <Combobox value={warehouseId} placeholder="Select a location" searchPlaceholder="Search locations…"
              onChange={(val) => setWarehouseId(val)} options={warehouses.map((w) => ({ value: w.id, label: w.label }))} />
          </div>
        </div>
        <div><Label className="text-destructive">Delivery Challan#</Label><Input className="mt-1" value={challanNumber} onChange={(e) => setChallanNumber(e.target.value)} placeholder="Auto-generated (e.g. DC-00001)" /></div>
        <div><Label>Reference#</Label><Input className="mt-1" value={reference} onChange={(e) => setReference(e.target.value)} /></div>
        <div><Label className="text-destructive">Delivery Challan Date*</Label><Input type="date" className="mt-1" value={challanDate} onChange={(e) => setChallanDate(e.target.value)} /></div>
        <div>
          <Label className="text-destructive">Challan Type*</Label>
          <select className={`${selectClass} mt-1`} value={challanType} onChange={(e) => setChallanType(e.target.value)}>
            <option value="">Choose a proper challan type.</option>
            {CHALLAN_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
      </CardContent></Card>

      <Card><CardContent className="space-y-3 pt-6">
        <p className="text-sm font-semibold">Item Table</p>
        <div className="hidden gap-2 text-xs font-semibold uppercase text-muted-foreground md:grid md:grid-cols-[1fr_90px_110px_110px_110px_40px]">
          <span>Item Details</span><span className="text-right">Quantity</span><span className="text-right">Rate</span><span className="text-right">Discount</span><span className="text-right">Amount</span><span />
        </div>
        {lines.map((line, index) => (
          <div key={index} className="grid gap-2 md:grid-cols-[1fr_90px_110px_110px_110px_40px] md:items-start">
            <div className="space-y-1">
              <Combobox value={line.item_id} placeholder="Type or click to select an item." searchPlaceholder="Search items…" createHref="/inventory/new" createLabel="New Item"
                onChange={(val) => { const it = itemsById.get(val); updateLine(index, it ? { item_id: it.id, description: it.name, rate: String(it.sales_price) } : { item_id: "" }); }}
                options={items.map((it) => ({ value: it.id, label: it.name }))} />
              <Input placeholder="Add a description to your item" value={line.description} onChange={(e) => updateLine(index, { description: e.target.value })} />
            </div>
            <Input type="number" min="0" step="0.01" className="text-right" value={line.quantity} onChange={(e) => updateLine(index, { quantity: e.target.value })} />
            <Input type="number" min="0" step="0.01" className="text-right" value={line.rate} onChange={(e) => updateLine(index, { rate: e.target.value })} />
            <Input type="number" min="0" step="0.01" className="text-right" value={line.discount} onChange={(e) => updateLine(index, { discount: e.target.value })} />
            <span className="px-1 py-2 text-right text-sm tabular-nums">{format(totals.computed[index] ?? 0)}</span>
            <Button type="button" variant="ghost" size="sm" aria-label="Remove" onClick={() => removeLine(index)}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
        <Button type="button" variant="secondary" size="sm" onClick={addLine}><Plus className="mr-2 h-4 w-4" />Add New Row</Button>
      </CardContent></Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card><CardContent className="pt-6">
          <Label>Customer Notes</Label>
          <Textarea className="mt-1" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Enter any notes to be displayed in your transaction" />
        </CardContent></Card>
        <Card><CardContent className="space-y-2 pt-6 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Sub Total</span><span className="tabular-nums">{format(totals.subtotal)}</span></div>
          {totals.discountTotal ? <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span className="tabular-nums">−{format(totals.discountTotal)}</span></div> : null}
          <div className="flex items-center justify-between gap-2"><span className="text-muted-foreground">Adjustment</span><Input type="number" step="0.01" className="h-8 w-28 text-right" value={adjustment} onChange={(e) => setAdjustment(e.target.value)} /></div>
          <div className="flex justify-between border-t pt-2 text-base font-bold"><span>Total ( {currency} )</span><span className="tabular-nums">{format(totals.total)}</span></div>
        </CardContent></Card>
      </div>

      <div className="flex items-center gap-2">
        <Button type="button" onClick={save} disabled={submitting}>Save as Draft</Button>
        <Button type="button" variant="ghost" onClick={() => router.push("/delivery-challans")}>Cancel</Button>
      </div>
    </div>
  );
}
