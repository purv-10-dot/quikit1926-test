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
const PAYMENT_TERMS = ["Due on Receipt", "Net 15", "Net 30", "Net 45", "Net 60"];

async function fetchList(path: string): Promise<Array<Record<string, unknown>>> {
  const r = await fetch(path);
  if (!r.ok) return [];
  const payload = (await r.json()) as { data?: unknown };
  return Array.isArray(payload.data) ? (payload.data as Array<Record<string, unknown>>) : [];
}

export function SalesOrderForm({ salesOrderId }: { salesOrderId?: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { currency, format } = useCurrency();
  const isEdit = Boolean(salesOrderId);

  const [contactId, setContactId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [soNumber, setSoNumber] = useState("");
  const [reference, setReference] = useState("");
  const [issueDate, setIssueDate] = useState(todayISO());
  const [shipDate, setShipDate] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("Due on Receipt");
  const [deliveryMethod, setDeliveryMethod] = useState("");
  const [salesperson, setSalesperson] = useState("");
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState("");
  const [adjustment, setAdjustment] = useState("0");
  const [lines, setLines] = useState<LineRow[]>([emptyLine()]);
  const [submitting, setSubmitting] = useState(false);

  const { data: customers = [] } = useQuery({ queryKey: ["so-form-customers"], staleTime: 0, queryFn: async () => (await fetchList("/api/v1/customers?per_page=200")).map((r) => ({ id: String(r.id), label: String(r.display_name ?? "Customer") }) as Option) });
  const { data: warehouses = [] } = useQuery({ queryKey: ["so-form-warehouses"], queryFn: async () => (await fetchList("/api/v1/warehouses?per_page=200")).map((r) => ({ id: String(r.id), label: String(r.name ?? "") }) as Option) });
  const { data: items = [] } = useQuery({ queryKey: ["so-form-items"], staleTime: 0, queryFn: async () => (await fetchList("/api/v1/inventory?per_page=200")).map((r) => ({ id: String(r.id), name: String(r.name ?? ""), sales_price: Number(r.sales_price ?? 0) }) as Item) });
  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const { data: existing } = useQuery({
    queryKey: ["sales-order", salesOrderId],
    queryFn: async () => {
      const r = await fetch(`/api/v1/sales-orders/${salesOrderId}`);
      if (!r.ok) return null;
      return ((await r.json()) as { data?: Record<string, unknown> }).data ?? null;
    },
    enabled: isEdit
  });

  useEffect(() => {
    if (!existing) return;
    setContactId(String(existing.contact_id ?? ""));
    setWarehouseId(existing.warehouse_id ? String(existing.warehouse_id) : "");
    setSoNumber(String(existing.sales_order_number ?? ""));
    setReference(String(existing.reference_number ?? ""));
    setIssueDate(String(existing.issue_date ?? todayISO()).slice(0, 10));
    setShipDate(existing.expected_shipment_date ? String(existing.expected_shipment_date).slice(0, 10) : "");
    setPaymentTerms(String(existing.payment_terms ?? "Due on Receipt"));
    setDeliveryMethod(String(existing.delivery_method ?? ""));
    setSalesperson(String(existing.salesperson ?? ""));
    setNotes(String(existing.notes ?? ""));
    setTerms(String(existing.terms ?? ""));
    setAdjustment(String(existing.adjustment ?? "0"));
    const rows = Array.isArray(existing.line_items) ? (existing.line_items as Array<Record<string, unknown>>) : [];
    if (rows.length) setLines(rows.map((l) => ({ description: String(l.description ?? ""), quantity: String(l.quantity ?? "1"), rate: String(l.rate ?? "0"), discount: String(l.discount ?? "0"), item_id: String(l.item_id ?? "") })));
  }, [existing]);

  // Prefill the next sales order number (Zoho-style) for new sales orders.
  const nextNum = useNextNumber("sales-order", !isEdit);
  useEffect(() => { if (!isEdit && nextNum.preview) setSoNumber((cur) => cur || nextNum.preview || ""); }, [nextNum.preview, isEdit]);

  // Preserve in-progress data across a Combobox "+ New" round-trip (create only).
  const { clearDraft } = useFormDraft(
    "qf-draft:sales-order",
    { contactId, warehouseId, soNumber, reference, issueDate, shipDate, paymentTerms, deliveryMethod, salesperson, notes, terms, adjustment, lines },
    (d) => {
      if (d.contactId !== undefined) setContactId(d.contactId);
      if (d.warehouseId !== undefined) setWarehouseId(d.warehouseId);
      if (d.soNumber !== undefined) setSoNumber(d.soNumber);
      if (d.reference !== undefined) setReference(d.reference);
      if (d.issueDate !== undefined) setIssueDate(d.issueDate);
      if (d.shipDate !== undefined) setShipDate(d.shipDate);
      if (d.paymentTerms !== undefined) setPaymentTerms(d.paymentTerms);
      if (d.deliveryMethod !== undefined) setDeliveryMethod(d.deliveryMethod);
      if (d.salesperson !== undefined) setSalesperson(d.salesperson);
      if (d.notes !== undefined) setNotes(d.notes);
      if (d.terms !== undefined) setTerms(d.terms);
      if (d.adjustment !== undefined) setAdjustment(d.adjustment);
      if (Array.isArray(d.lines) && d.lines.length) setLines(d.lines);
    },
    { enabled: !isEdit }
  );

  const totals = useMemo(() => {
    let subtotal = 0;
    let discountTotal = 0;
    const computed = lines.map((line) => {
      const gross = round2(Number(line.quantity || 0) * Number(line.rate || 0));
      const discount = round2(Number(line.discount || 0));
      subtotal = round2(subtotal + gross);
      discountTotal = round2(discountTotal + discount);
      return round2(gross - discount);
    });
    return { computed, subtotal, discountTotal, total: round2(subtotal - discountTotal + Number(adjustment || 0)) };
  }, [lines, adjustment]);

  const updateLine = (i: number, patch: Partial<LineRow>) => setLines((c) => c.map((l, p) => (p === i ? { ...l, ...patch } : l)));
  const addLine = () => setLines((c) => [...c, emptyLine()]);
  const removeLine = (i: number) => setLines((c) => (c.length === 1 ? c : c.filter((_, p) => p !== i)));

  const save = async (status: "draft" | "sent") => {
    if (!contactId) { toast.error("Select a customer."); return; }
    const validLines = lines.filter((l) => (l.description.trim() !== "" || l.item_id) && Number(l.quantity) > 0);
    if (validLines.length === 0) { toast.error("Add at least one item."); return; }

    const payload = {
      contact_id: contactId,
      warehouse_id: warehouseId || null,
      sales_order_number: nextNum.numberToSubmit(soNumber),
      reference_number: reference.trim() || null,
      issue_date: issueDate,
      expected_shipment_date: shipDate || null,
      payment_terms: paymentTerms || null,
      delivery_method: deliveryMethod.trim() || null,
      salesperson: salesperson.trim() || null,
      status, currency,
      notes: notes.trim() || null,
      terms: terms.trim() || null,
      adjustment: Number(adjustment) || 0,
      subtotal: totals.subtotal,
      tax_total: 0,
      total: totals.total,
      line_items: validLines.map((l) => ({ item_id: l.item_id || null, description: (l.description.trim() || itemsById.get(l.item_id)?.name) ?? "", quantity: Number(l.quantity), rate: Number(l.rate), discount: Number(l.discount || 0) }))
    };

    setSubmitting(true);
    try {
      const res = await fetch(isEdit ? `/api/v1/sales-orders/${salesOrderId}` : "/api/v1/sales-orders", {
        method: isEdit ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        toast.error(body?.error?.message ?? "Could not save the sales order.");
        return;
      }
      const saved = (await res.json()) as { data?: { id?: string } };
      toast.success(isEdit ? "Sales order updated." : status === "sent" ? "Sales order saved and sent." : "Sales order saved as draft.");
      clearDraft();
      qc.invalidateQueries({ queryKey: ["module", "sales-orders"] });
      const id = saved?.data?.id ?? salesOrderId;
      router.push(id ? `/sales-orders/${id}` : "/sales-orders");
    } finally { setSubmitting(false); }
  };

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{isEdit ? "Edit Sales Order" : "New Sales Order"}</h1>
        <Button asChild size="sm" variant="ghost"><a href="/sales-orders" aria-label="Close"><X className="h-4 w-4" /></a></Button>
      </div>

      <Card><CardContent className="grid gap-5 pt-6 md:grid-cols-2">
        <div>
          <Label className="text-destructive">Customer Name*</Label>
          <Combobox className="mt-1" value={contactId} onChange={setContactId} placeholder="Select or add a customer" searchPlaceholder="Search customers…" createHref="/customers/new" createLabel="New Customer" options={customers.map((c) => ({ value: c.id, label: c.label }))} />
        </div>
        <div>
          <Label>Location</Label>
          <Combobox className="mt-1" value={warehouseId} onChange={setWarehouseId} placeholder="Select a location" searchPlaceholder="Search locations…" options={warehouses.map((w) => ({ value: w.id, label: w.label }))} />
        </div>
        <div>
          <Label className="text-destructive">Sales Order#</Label>
          <Input className="mt-1" value={soNumber} onChange={(e) => setSoNumber(e.target.value)} placeholder="Auto-generated (e.g. SO-00001)" />
        </div>
        <div><Label>Reference#</Label><Input className="mt-1" value={reference} onChange={(e) => setReference(e.target.value)} /></div>
        <div><Label className="text-destructive">Sales Order Date*</Label><Input type="date" className="mt-1" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} /></div>
        <div><Label>Expected Shipment Date</Label><Input type="date" className="mt-1" value={shipDate} onChange={(e) => setShipDate(e.target.value)} /></div>
        <div>
          <Label>Payment Terms</Label>
          <select className={`${selectClass} mt-1`} value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)}>
            {PAYMENT_TERMS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div><Label>Delivery Method</Label><Input className="mt-1" value={deliveryMethod} onChange={(e) => setDeliveryMethod(e.target.value)} placeholder="Select a delivery method or type to add" /></div>
        <div><Label>Salesperson</Label><Input className="mt-1" value={salesperson} onChange={(e) => setSalesperson(e.target.value)} placeholder="Select or Add Salesperson" /></div>
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
              <Input placeholder="Description" value={line.description} onChange={(e) => updateLine(index, { description: e.target.value })} />
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
        <Card><CardContent className="space-y-4 pt-6">
          <div><Label>Customer Notes</Label><Textarea className="mt-1" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Enter any notes to be displayed in your transaction" /></div>
          <div><Label>Terms &amp; Conditions</Label><Textarea className="mt-1" rows={3} value={terms} onChange={(e) => setTerms(e.target.value)} /></div>
        </CardContent></Card>
        <Card><CardContent className="space-y-2 pt-6 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Sub Total</span><span className="tabular-nums">{format(totals.subtotal)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span className="tabular-nums">−{format(totals.discountTotal)}</span></div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">Adjustment</span>
            <Input type="number" step="0.01" className="h-8 w-28 text-right" value={adjustment} onChange={(e) => setAdjustment(e.target.value)} />
          </div>
          <div className="flex justify-between border-t pt-2 text-base font-bold"><span>Total ( {currency} )</span><span className="tabular-nums">{format(totals.total)}</span></div>
        </CardContent></Card>
      </div>

      <div className="flex items-center gap-2">
        <Button type="button" variant="secondary" onClick={() => save("draft")} disabled={submitting}>Save as Draft</Button>
        <Button type="button" onClick={() => save("sent")} disabled={submitting}>Save and Send</Button>
        <Button type="button" variant="ghost" onClick={() => router.push("/sales-orders")}>Cancel</Button>
      </div>
    </div>
  );
}
