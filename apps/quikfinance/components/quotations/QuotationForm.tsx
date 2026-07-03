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
import { useCurrencyOptions } from "@/lib/hooks/use-currency-options";
import { formatMoney } from "@/lib/utils/currency";
import { todayISO } from "@/lib/utils/dates";

type Option = { id: string; label: string; currency?: string };
type Item = { id: string; name: string; sales_price: number };
type LineRow = { description: string; quantity: string; rate: string; discount: string; item_id: string };

const selectClass = "h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";
const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const emptyLine = (): LineRow => ({ description: "", quantity: "1", rate: "0", discount: "0", item_id: "" });

async function fetchList(path: string): Promise<Array<Record<string, unknown>>> {
  const r = await fetch(path);
  if (!r.ok) return [];
  const payload = (await r.json()) as { data?: unknown };
  return Array.isArray(payload.data) ? (payload.data as Array<Record<string, unknown>>) : [];
}

export function QuotationForm({ quotationId }: { quotationId?: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { currency } = useCurrency();
  const isEdit = Boolean(quotationId);

  const [contactId, setContactId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [quoteNumber, setQuoteNumber] = useState("");
  const [reference, setReference] = useState("");
  const [issueDate, setIssueDate] = useState(todayISO());
  const [expiryDate, setExpiryDate] = useState("");
  const [salesperson, setSalesperson] = useState("");
  const [projectId, setProjectId] = useState("");
  const [subject, setSubject] = useState("");
  const [notes, setNotes] = useState("Looking forward for your business.");
  const [terms, setTerms] = useState("");
  const [adjustment, setAdjustment] = useState("0");
  const [lines, setLines] = useState<LineRow[]>([emptyLine()]);
  const [docCurrency, setDocCurrency] = useState(currency);
  const [exchangeRate, setExchangeRate] = useState("1");
  const [submitting, setSubmitting] = useState(false);
  const isForeign = docCurrency.toUpperCase() !== currency.toUpperCase();

  const { data: customers = [] } = useQuery({
    queryKey: ["quote-form-customers"],
    staleTime: 0,
    queryFn: async () => (await fetchList("/api/v1/customers?per_page=200")).map((r) => ({ id: String(r.id), label: String(r.display_name ?? "Customer"), currency: String(r.currency ?? "") }) as Option)
  });
  const currencyOptions = useCurrencyOptions();
  const { data: warehouses = [] } = useQuery({
    queryKey: ["quote-form-warehouses"],
    queryFn: async () => (await fetchList("/api/v1/warehouses?per_page=200")).map((r) => ({ id: String(r.id), label: String(r.name ?? "") }) as Option)
  });
  const { data: projects = [] } = useQuery({
    queryKey: ["quote-form-projects"],
    queryFn: async () => (await fetchList("/api/v1/projects?per_page=200")).map((r) => ({ id: String(r.id), label: String(r.name ?? "") }) as Option)
  });
  const { data: items = [] } = useQuery({
    queryKey: ["quote-form-items"],
    staleTime: 0,
    queryFn: async () => (await fetchList("/api/v1/inventory?per_page=200")).map((r) => ({ id: String(r.id), name: String(r.name ?? ""), sales_price: Number(r.sales_price ?? 0) }) as Item)
  });
  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const { data: settings } = useQuery({
    queryKey: ["quote-settings"],
    queryFn: async () => {
      const r = await fetch("/api/v1/settings/quotes");
      return r.ok ? ((await r.json()).data as { default_terms?: string }) : null;
    }
  });

  // Prefill the default Terms & Conditions on new quotes (Settings → Quotes).
  useEffect(() => {
    if (!isEdit && settings?.default_terms) setTerms((current) => current || settings.default_terms || "");
  }, [isEdit, settings]);

  const { data: existing } = useQuery({
    queryKey: ["quotation", quotationId],
    queryFn: async () => {
      const r = await fetch(`/api/v1/quotations/${quotationId}`);
      if (!r.ok) return null;
      return ((await r.json()) as { data?: Record<string, unknown> }).data ?? null;
    },
    enabled: isEdit
  });

  useEffect(() => {
    if (!existing) return;
    setContactId(String(existing.contact_id ?? ""));
    setWarehouseId(existing.warehouse_id ? String(existing.warehouse_id) : "");
    setQuoteNumber(String(existing.quotation_number ?? ""));
    setReference(String(existing.reference_number ?? ""));
    setIssueDate(String(existing.issue_date ?? todayISO()).slice(0, 10));
    setExpiryDate(existing.expiry_date ? String(existing.expiry_date).slice(0, 10) : "");
    setSalesperson(String(existing.salesperson ?? ""));
    setProjectId(existing.project_id ? String(existing.project_id) : "");
    setSubject(String(existing.subject ?? ""));
    setNotes(String(existing.notes ?? ""));
    setTerms(String(existing.terms ?? ""));
    setAdjustment(String(existing.adjustment ?? "0"));
    setDocCurrency(String(existing.currency ?? currency).toUpperCase());
    setExchangeRate(String(existing.exchange_rate ?? "1"));
    const rows = Array.isArray(existing.line_items) ? (existing.line_items as Array<Record<string, unknown>>) : [];
    if (rows.length) {
      setLines(rows.map((l) => ({ description: String(l.description ?? ""), quantity: String(l.quantity ?? "1"), rate: String(l.rate ?? "0"), discount: String(l.discount ?? "0"), item_id: String(l.item_id ?? "") })));
    }
  }, [existing]);

  // Prefill the next quote number (Zoho-style) for new quotes.
  const nextNum = useNextNumber("quotation", !isEdit);
  useEffect(() => { if (!isEdit && nextNum.preview) setQuoteNumber((cur) => cur || nextNum.preview || ""); }, [nextNum.preview, isEdit]);

  // On create, default the quote currency to the selected customer's currency (still changeable below).
  useEffect(() => {
    if (isEdit) return;
    const c = customers.find((x) => x.id === contactId);
    if (c?.currency) { setDocCurrency(c.currency.toUpperCase()); setExchangeRate("1"); }
  }, [contactId, customers, isEdit]);

  // Preserve in-progress data across a Combobox "+ New" round-trip (create only).
  const { clearDraft } = useFormDraft(
    "qf-draft:quotation",
    { contactId, warehouseId, quoteNumber, reference, issueDate, expiryDate, salesperson, projectId, subject, notes, terms, adjustment, lines },
    (d) => {
      if (d.contactId !== undefined) setContactId(d.contactId);
      if (d.warehouseId !== undefined) setWarehouseId(d.warehouseId);
      if (d.quoteNumber !== undefined) setQuoteNumber(d.quoteNumber);
      if (d.reference !== undefined) setReference(d.reference);
      if (d.issueDate !== undefined) setIssueDate(d.issueDate);
      if (d.expiryDate !== undefined) setExpiryDate(d.expiryDate);
      if (d.salesperson !== undefined) setSalesperson(d.salesperson);
      if (d.projectId !== undefined) setProjectId(d.projectId);
      if (d.subject !== undefined) setSubject(d.subject);
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
    const total = round2(subtotal - discountTotal + Number(adjustment || 0));
    return { computed, subtotal, discountTotal, total };
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
      quotation_number: nextNum.numberToSubmit(quoteNumber),
      reference_number: reference.trim() || null,
      issue_date: issueDate,
      expiry_date: expiryDate || null,
      salesperson: salesperson.trim() || null,
      project_id: projectId || null,
      subject: subject.trim() || null,
      status,
      currency: docCurrency,
      exchange_rate: isForeign ? Number(exchangeRate) || 1 : 1,
      notes: notes.trim() || null,
      terms: terms.trim() || null,
      adjustment: Number(adjustment) || 0,
      subtotal: totals.subtotal,
      tax_total: 0,
      total: totals.total,
      line_items: validLines.map((l) => ({
        item_id: l.item_id || null,
        description: (l.description.trim() || itemsById.get(l.item_id)?.name) ?? "",
        quantity: Number(l.quantity),
        rate: Number(l.rate),
        discount: Number(l.discount || 0)
      }))
    };

    setSubmitting(true);
    try {
      const res = await fetch(isEdit ? `/api/v1/quotations/${quotationId}` : "/api/v1/quotations", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        toast.error(body?.error?.message ?? "Could not save the quote.");
        return;
      }
      const saved = (await res.json()) as { data?: { id?: string } };
      toast.success(isEdit ? "Quote updated." : status === "sent" ? "Quote saved and sent." : "Quote saved as draft.");
      clearDraft();
      qc.invalidateQueries({ queryKey: ["module", "quotations"] });
      const id = saved?.data?.id ?? quotationId;
      router.push(id ? `/quotations/${id}` : "/quotations");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{isEdit ? "Edit Quote" : "New Quote"}</h1>
        <Button asChild size="sm" variant="ghost"><a href="/quotations" aria-label="Close"><X className="h-4 w-4" /></a></Button>
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
          <Label>Currency</Label>
          <Combobox className="mt-1" value={docCurrency} onChange={(v) => setDocCurrency(v)} placeholder="Select currency" searchPlaceholder="Search currencies…" options={currencyOptions} />
        </div>
        <div>
          <Label className="text-destructive">Quote#</Label>
          <Input className="mt-1" value={quoteNumber} onChange={(e) => setQuoteNumber(e.target.value)} placeholder="Auto-generated (e.g. QT-00001)" />
        </div>
        <div>
          <Label>Reference#</Label>
          <Input className="mt-1" value={reference} onChange={(e) => setReference(e.target.value)} />
        </div>
        <div>
          <Label className="text-destructive">Quote Date*</Label>
          <Input type="date" className="mt-1" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
        </div>
        <div>
          <Label>Expiry Date</Label>
          <Input type="date" className="mt-1" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
        </div>
        <div>
          <Label>Salesperson</Label>
          <Input className="mt-1" value={salesperson} onChange={(e) => setSalesperson(e.target.value)} placeholder="Select or Add Salesperson" />
        </div>
        <div>
          <Label>Project Name</Label>
          <div className="mt-1">
            <Combobox value={projectId} placeholder="Select a project" searchPlaceholder="Search projects…"
              onChange={(val) => setProjectId(val)} options={projects.map((p) => ({ value: p.id, label: p.label }))} />
          </div>
        </div>
        <div className="md:col-span-2">
          <Label>Subject</Label>
          <Input className="mt-1" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Let your customer know what this Quote is for" />
        </div>
      </CardContent></Card>

      {/* Item table */}
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
            <span className="px-1 py-2 text-right text-sm tabular-nums">{formatMoney(totals.computed[index] ?? 0, docCurrency)}</span>
            <Button type="button" variant="ghost" size="sm" aria-label="Remove" onClick={() => removeLine(index)}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
        <Button type="button" variant="secondary" size="sm" onClick={addLine}><Plus className="mr-2 h-4 w-4" />Add New Row</Button>
      </CardContent></Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card><CardContent className="space-y-4 pt-6">
          <div>
            <Label>Customer Notes</Label>
            <Textarea className="mt-1" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div>
            <Label>Terms &amp; Conditions</Label>
            <Textarea className="mt-1" rows={3} value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="Enter the terms and conditions of your business to be displayed in your transaction" />
          </div>
        </CardContent></Card>
        <Card><CardContent className="space-y-2 pt-6 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Sub Total</span><span className="tabular-nums">{formatMoney(totals.subtotal, docCurrency)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span className="tabular-nums">−{formatMoney(totals.discountTotal, docCurrency)}</span></div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">Adjustment</span>
            <Input type="number" step="0.01" className="h-8 w-28 text-right" value={adjustment} onChange={(e) => setAdjustment(e.target.value)} />
          </div>
          {isForeign ? (
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Exchange rate (1 {docCurrency} = ? {currency})</span>
              <Input type="number" step="0.0001" min="0" className="h-8 w-28 text-right" value={exchangeRate} onChange={(e) => setExchangeRate(e.target.value)} />
            </div>
          ) : null}
          <div className="flex justify-between border-t pt-2 text-base font-bold"><span>Total ( {docCurrency} )</span><span className="tabular-nums">{formatMoney(totals.total, docCurrency)}</span></div>
          {isForeign ? <div className="flex justify-between text-xs text-muted-foreground"><span>In company currency</span><span className="tabular-nums">{formatMoney(totals.total * (Number(exchangeRate) || 0), currency)}</span></div> : null}
        </CardContent></Card>
      </div>

      <div className="flex items-center gap-2">
        <Button type="button" variant="secondary" onClick={() => save("draft")} disabled={submitting}>Save as Draft</Button>
        <Button type="button" onClick={() => save("sent")} disabled={submitting}>Save and Send</Button>
        <Button type="button" variant="ghost" onClick={() => router.push("/quotations")}>Cancel</Button>
      </div>
    </div>
  );
}
