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
import { formatMoney } from "@/lib/utils/currency";
import { todayISO, addDaysISO } from "@/lib/utils/dates";
import { TemplatePreview } from "@/components/settings/TemplatePreview";
import { defaultConfig } from "@/lib/pdf-templates/config";
import type { DocumentData } from "@/lib/pdf-templates/document";

type Option = { id: string; label: string; currency?: string };
type Account = { id: string; name: string; account_type: string };
type TaxRate = { id: string; name: string; rate: number };
type Item = { id: string; name: string; sales_price: number };
type LineRow = { description: string; quantity: string; rate: string; discount: string; tax_rate_id: string; item_id: string };

const selectClass = "h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";
const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const emptyLine = (): LineRow => ({ description: "", quantity: "1", rate: "0", discount: "0", tax_rate_id: "", item_id: "" });
const TERMS: Record<string, number> = { "Due on Receipt": 0, "Net 15": 15, "Net 30": 30, "Net 45": 45, "Net 60": 60 };

async function fetchList(path: string): Promise<Array<Record<string, unknown>>> {
  const r = await fetch(path);
  if (!r.ok) return [];
  const payload = (await r.json()) as { data?: unknown };
  return Array.isArray(payload.data) ? (payload.data as Array<Record<string, unknown>>) : [];
}

export function InvoiceForm({ invoiceId }: { invoiceId?: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { currency } = useCurrency();
  const isEdit = Boolean(invoiceId);

  const [contactId, setContactId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [issueDate, setIssueDate] = useState(todayISO());
  const [terms, setTerms] = useState("Net 30");
  const [dueDate, setDueDate] = useState(addDaysISO(30));
  const [arAccountId, setArAccountId] = useState("");
  const [salesperson, setSalesperson] = useState("");
  const [subject, setSubject] = useState("");
  const [notes, setNotes] = useState("Thanks for your business.");
  const [termsText, setTermsText] = useState("");
  const [adjustment, setAdjustment] = useState("0");
  const [tcs, setTcs] = useState("0");
  const [lines, setLines] = useState<LineRow[]>([emptyLine()]);
  const [docCurrency, setDocCurrency] = useState(currency);
  const [exchangeRate, setExchangeRate] = useState("1");
  const [submitting, setSubmitting] = useState(false);
  const isForeign = docCurrency.toUpperCase() !== currency.toUpperCase();
  const fmt = (n: number) => formatMoney(n, docCurrency);

  const { data: customers = [] } = useQuery({ queryKey: ["inv-form-customers"], staleTime: 0, queryFn: async () => (await fetchList("/api/v1/customers?per_page=200")).map((r) => ({ id: String(r.id), label: String(r.display_name ?? "Customer"), currency: String(r.currency ?? "") }) as Option) });
  const { data: warehouses = [] } = useQuery({ queryKey: ["inv-form-warehouses"], queryFn: async () => (await fetchList("/api/v1/warehouses?per_page=200")).map((r) => ({ id: String(r.id), label: String(r.name ?? "") }) as Option) });
  const { data: items = [] } = useQuery({ queryKey: ["inv-form-items"], staleTime: 0, queryFn: async () => (await fetchList("/api/v1/inventory?per_page=200")).map((r) => ({ id: String(r.id), name: String(r.name ?? ""), sales_price: Number(r.sales_price ?? 0) }) as Item) });
  const { data: taxRates = [] } = useQuery({ queryKey: ["inv-form-taxes"], queryFn: async () => (await fetchList("/api/v1/taxes?per_page=100")).map((r) => ({ id: String(r.id), name: String(r.name ?? ""), rate: Number(r.rate ?? 0) }) as TaxRate) });
  const { data: arAccounts = [] } = useQuery({ queryKey: ["inv-form-ar"], queryFn: async () => (await fetchList("/api/v1/accounts?per_page=200")).filter((r) => r.account_type === "accounts_receivable").map((r) => ({ id: String(r.id), name: String(r.name ?? ""), account_type: String(r.account_type) }) as Account) });
  const { data: numbering } = useQuery({ queryKey: ["invoice-settings"], queryFn: async () => { const r = await fetch("/api/v1/settings/invoices"); return r.ok ? ((await r.json()).data as { auto_generate_number?: boolean }) : null; } });
  const autoNumber = numbering?.auto_generate_number !== false;

  // Prefill the next invoice number (Zoho-style) for new invoices.
  const nextNum = useNextNumber("invoice", !isEdit);
  useEffect(() => { if (!isEdit && nextNum.preview) setInvoiceNumber((cur) => cur || nextNum.preview || ""); }, [nextNum.preview, isEdit]);
  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const rateById = useMemo(() => new Map(taxRates.map((t) => [t.id, t.rate])), [taxRates]);

  useEffect(() => { if (!arAccountId && arAccounts.length) setArAccountId(arAccounts[0].id); }, [arAccounts, arAccountId]);

  // On create, the invoice inherits the selected customer's default currency.
  useEffect(() => {
    if (isEdit) return;
    const c = customers.find((x) => x.id === contactId);
    if (c?.currency) { setDocCurrency(c.currency.toUpperCase()); setExchangeRate("1"); }
  }, [contactId, customers, isEdit]);

  const { data: existing } = useQuery({
    queryKey: ["invoice", invoiceId],
    queryFn: async () => {
      const r = await fetch(`/api/v1/invoices/${invoiceId}`);
      if (!r.ok) return null;
      return ((await r.json()) as { data?: Record<string, unknown> }).data ?? null;
    },
    enabled: isEdit
  });

  useEffect(() => {
    if (!existing) return;
    setContactId(String(existing.contact_id ?? ""));
    setWarehouseId(existing.warehouse_id ? String(existing.warehouse_id) : "");
    setInvoiceNumber(String(existing.invoice_number ?? ""));
    setOrderNumber(String(existing.order_number ?? ""));
    setIssueDate(String(existing.issue_date ?? todayISO()).slice(0, 10));
    setDueDate(String(existing.due_date ?? addDaysISO(30)).slice(0, 10));
    setArAccountId(existing.ar_account_id ? String(existing.ar_account_id) : "");
    setSalesperson(String(existing.salesperson ?? ""));
    setSubject(String(existing.subject ?? ""));
    setNotes(String(existing.notes ?? ""));
    setTermsText(String(existing.terms ?? ""));
    setAdjustment(String(existing.round_off ?? "0"));
    setTcs(String(existing.tcs_amount ?? "0"));
    setDocCurrency(String(existing.currency ?? currency).toUpperCase());
    setExchangeRate(String(existing.exchange_rate ?? "1"));
    const rows = Array.isArray(existing.line_items) ? (existing.line_items as Array<Record<string, unknown>>) : [];
    if (rows.length) setLines(rows.map((l) => ({ description: String(l.description ?? ""), quantity: String(l.quantity ?? "1"), rate: String(l.rate ?? "0"), discount: String(l.discount ?? "0"), tax_rate_id: String(l.tax_rate_id ?? ""), item_id: String(l.item_id ?? "") })));
  }, [existing]);

  // Preserve in-progress data across a Combobox "+ New" round-trip (create only).
  const { clearDraft } = useFormDraft(
    "qf-draft:invoice",
    { contactId, warehouseId, invoiceNumber, orderNumber, issueDate, terms, dueDate, arAccountId, salesperson, subject, notes, termsText, adjustment, tcs, lines },
    (d) => {
      if (d.contactId !== undefined) setContactId(d.contactId);
      if (d.warehouseId !== undefined) setWarehouseId(d.warehouseId);
      if (d.invoiceNumber !== undefined) setInvoiceNumber(d.invoiceNumber);
      if (d.orderNumber !== undefined) setOrderNumber(d.orderNumber);
      if (d.issueDate !== undefined) setIssueDate(d.issueDate);
      if (d.terms !== undefined) setTerms(d.terms);
      if (d.dueDate !== undefined) setDueDate(d.dueDate);
      if (d.arAccountId !== undefined) setArAccountId(d.arAccountId);
      if (d.salesperson !== undefined) setSalesperson(d.salesperson);
      if (d.subject !== undefined) setSubject(d.subject);
      if (d.notes !== undefined) setNotes(d.notes);
      if (d.termsText !== undefined) setTermsText(d.termsText);
      if (d.adjustment !== undefined) setAdjustment(d.adjustment);
      if (d.tcs !== undefined) setTcs(d.tcs);
      if (Array.isArray(d.lines) && d.lines.length) setLines(d.lines);
    },
    { enabled: !isEdit }
  );

  const applyTerms = (t: string) => {
    setTerms(t);
    if (t in TERMS) {
      const d = new Date(issueDate);
      d.setDate(d.getDate() + TERMS[t]);
      setDueDate(d.toISOString().slice(0, 10));
    }
  };

  const totals = useMemo(() => {
    let subtotal = 0, discountTotal = 0, taxTotal = 0;
    const computed = lines.map((line) => {
      const gross = round2(Number(line.quantity || 0) * Number(line.rate || 0));
      const discount = round2(Number(line.discount || 0));
      const net = round2(gross - discount);
      const pct = line.tax_rate_id ? rateById.get(line.tax_rate_id) ?? 0 : 0;
      const tax = round2((net * pct) / 100);
      subtotal = round2(subtotal + gross); discountTotal = round2(discountTotal + discount); taxTotal = round2(taxTotal + tax);
      return round2(net + tax);
    });
    const total = round2(subtotal - discountTotal + taxTotal + Number(adjustment || 0));
    return { computed, subtotal, discountTotal, taxTotal, total, balanceDue: round2(total + Number(tcs || 0)) };
  }, [lines, adjustment, tcs, rateById]);

  const updateLine = (i: number, patch: Partial<LineRow>) => setLines((c) => c.map((l, p) => (p === i ? { ...l, ...patch } : l)));
  const addLine = () => setLines((c) => [...c, emptyLine()]);
  const removeLine = (i: number) => setLines((c) => (c.length === 1 ? c : c.filter((_, p) => p !== i)));

  const save = async (send: boolean) => {
    if (!contactId) { toast.error("Select a customer."); return; }
    if (!autoNumber && !invoiceNumber.trim() && !isEdit) { toast.error("Enter an invoice number (auto-generation is off in Settings → Invoices)."); return; }
    const validLines = lines.filter((l) => (l.description.trim() !== "" || l.item_id) && Number(l.quantity) > 0);
    if (validLines.length === 0) { toast.error("Add at least one item."); return; }

    const payload = {
      contact_id: contactId,
      warehouse_id: warehouseId || null,
      invoice_number: nextNum.numberToSubmit(invoiceNumber),
      order_number: orderNumber.trim() || null,
      issue_date: issueDate,
      due_date: dueDate,
      status: send ? "sent" : "draft",
      currency: docCurrency,
      exchange_rate: isForeign ? Number(exchangeRate) || 1 : 1,
      ar_account_id: arAccountId || null,
      salesperson: salesperson.trim() || null,
      subject: subject.trim() || null,
      notes: notes.trim() || null,
      terms: termsText.trim() || null,
      round_off: Number(adjustment) || 0,
      tcs_amount: Number(tcs) || 0,
      subtotal: totals.subtotal,
      discount_total: totals.discountTotal,
      tax_total: totals.taxTotal,
      total: totals.total,
      balance_due: totals.balanceDue,
      line_items: validLines.map((l) => ({ item_id: l.item_id || null, description: (l.description.trim() || itemsById.get(l.item_id)?.name) ?? "", quantity: Number(l.quantity), rate: Number(l.rate), discount: Number(l.discount || 0), tax_rate_id: l.tax_rate_id || null }))
    };

    setSubmitting(true);
    try {
      const res = await fetch(isEdit ? `/api/v1/invoices/${invoiceId}` : "/api/v1/invoices", { method: isEdit ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        toast.error(body?.error?.message ?? "Could not save the invoice.");
        return;
      }
      const saved = (await res.json()) as { data?: { id?: string } };
      const id = saved?.data?.id ?? invoiceId;
      if (send && id) {
        const r = await fetch(`/api/v1/invoices/${id}/send`, { method: "POST" });
        if (r.ok) toast.success("Invoice saved and emailed.");
        else toast.message("Invoice saved (add a customer email to send).");
      } else {
        toast.success(isEdit ? "Invoice updated." : "Invoice saved.");
      }
      clearDraft();
      qc.invalidateQueries({ queryKey: ["module", "invoices"] });
      router.push(id ? `/invoices/${id}` : "/invoices");
    } finally { setSubmitting(false); }
  };

  // Live preview document, rebuilt from the current form state.
  const previewConfig = useMemo(() => defaultConfig(), []);
  const previewDoc = useMemo<DocumentData>(() => ({
    company: { name: "Your Company", subtitle: "", address: [], gstin: "", pan: "", email: "" },
    billTo: { label: "Bill To", name: customers.find((c) => c.id === contactId)?.label || "Customer", address: [], email: "", gstin: "" },
    shipTo: null,
    meta: { number: invoiceNumber || "—", date: issueDate, dueDate, terms, reference: orderNumber, subject },
    currency: docCurrency,
    lines: lines
      .map((l, i) => ({ sno: i + 1, item: l.description || itemsById.get(l.item_id)?.name || "Item", description: "", hsn: "-", qty: Number(l.quantity) || 0, unit: "", rate: Number(l.rate) || 0, discount: Number(l.discount) || 0, taxPct: 0, tax: 0, amount: totals.computed[i] ?? 0 }))
      .filter((l) => (l.item && l.item !== "Item") || l.amount),
    totals: { subTotal: totals.subtotal, discount: totals.discountTotal, shipping: 0, tax: totals.taxTotal, roundOff: Number(adjustment) || 0, total: totals.total },
    taxBreakup: { cgst: 0, sgst: 0, igst: 0 },
    notes,
    terms: termsText
  }), [customers, contactId, invoiceNumber, issueDate, dueDate, terms, orderNumber, subject, docCurrency, lines, totals, adjustment, notes, termsText, itemsById]);

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{isEdit ? "Edit Invoice" : "New Invoice"}</h1>
        <Button asChild size="sm" variant="ghost"><a href="/invoices" aria-label="Close"><X className="h-4 w-4" /></a></Button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,440px)]">
      <div className="min-w-0 space-y-5">

      <Card><CardContent className="grid gap-5 pt-6 md:grid-cols-2">
        <div>
          <Label className="text-destructive">Customer Name*</Label>
          <Combobox className="mt-1" value={contactId} onChange={setContactId} placeholder="Select or add a customer" searchPlaceholder="Search customers…" createHref="/customers/new" createLabel="New Customer" options={customers.map((c) => ({ value: c.id, label: c.label }))} />
        </div>
        <div>
          <Label>Location</Label>
          <Combobox className="mt-1" value={warehouseId} onChange={setWarehouseId} placeholder="Select a location" searchPlaceholder="Search locations…" options={warehouses.map((w) => ({ value: w.id, label: w.label }))} />
        </div>
        <div><Label className={autoNumber ? "" : "text-destructive"}>Invoice#{autoNumber ? "" : "*"}</Label><Input className="mt-1" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder={autoNumber ? "Auto-generated (e.g. INV-00001)" : "Enter invoice number"} /></div>
        <div><Label>Order Number</Label><Input className="mt-1" value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} placeholder="Linked sales order #" /></div>
        <div><Label className="text-destructive">Invoice Date*</Label><Input type="date" className="mt-1" value={issueDate} onChange={(e) => { setIssueDate(e.target.value); }} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Terms</Label>
            <select className={`${selectClass} mt-1`} value={terms} onChange={(e) => applyTerms(e.target.value)}>
              {Object.keys(TERMS).map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div><Label>Due Date</Label><Input type="date" className="mt-1" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div>
        </div>
        <div>
          <Label>Accounts Receivable</Label>
          <Combobox className="mt-1" value={arAccountId} onChange={setArAccountId} placeholder="Select an account" searchPlaceholder="Search accounts…" options={arAccounts.map((a) => ({ value: a.id, label: a.name }))} />
        </div>
        <div><Label>Salesperson</Label><Input className="mt-1" value={salesperson} onChange={(e) => setSalesperson(e.target.value)} placeholder="Select or Add Salesperson" /></div>
        <div className="md:col-span-2"><Label>Subject</Label><Input className="mt-1" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Let your customer know what this Invoice is for" /></div>
      </CardContent></Card>

      <Card><CardContent className="space-y-3 pt-6">
        <p className="text-sm font-semibold">Item Table</p>
        <div className="hidden gap-2 text-xs font-semibold uppercase text-muted-foreground md:grid md:grid-cols-[1fr_80px_100px_90px_120px_100px_40px]">
          <span>Item Details</span><span className="text-right">Qty</span><span className="text-right">Rate</span><span className="text-right">Discount</span><span>Tax</span><span className="text-right">Amount</span><span />
        </div>
        {lines.map((line, index) => (
          <div key={index} className="grid gap-2 md:grid-cols-[1fr_80px_100px_90px_120px_100px_40px] md:items-start">
            <div className="space-y-1">
              <Combobox value={line.item_id} placeholder="Type or click to select an item." searchPlaceholder="Search items…" createHref="/inventory/new" createLabel="New Item"
                onChange={(val) => { const it = itemsById.get(val); updateLine(index, it ? { item_id: it.id, description: it.name, rate: String(it.sales_price) } : { item_id: "" }); }}
                options={items.map((it) => ({ value: it.id, label: it.name }))} />
              <Input placeholder="Description" value={line.description} onChange={(e) => updateLine(index, { description: e.target.value })} />
            </div>
            <Input type="number" min="0" step="0.01" className="text-right" value={line.quantity} onChange={(e) => updateLine(index, { quantity: e.target.value })} />
            <Input type="number" min="0" step="0.01" className="text-right" value={line.rate} onChange={(e) => updateLine(index, { rate: e.target.value })} />
            <Input type="number" min="0" step="0.01" className="text-right" value={line.discount} onChange={(e) => updateLine(index, { discount: e.target.value })} />
            <Combobox value={line.tax_rate_id} placeholder="No tax" searchPlaceholder="Search taxes…"
              onChange={(val) => updateLine(index, { tax_rate_id: val })} options={taxRates.map((t) => ({ value: t.id, label: t.name }))} />
            <span className="px-1 py-2 text-right text-sm tabular-nums">{fmt(totals.computed[index] ?? 0)}</span>
            <Button type="button" variant="ghost" size="sm" aria-label="Remove" onClick={() => removeLine(index)}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
        <Button type="button" variant="secondary" size="sm" onClick={addLine}><Plus className="mr-2 h-4 w-4" />Add New Row</Button>
      </CardContent></Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card><CardContent className="space-y-4 pt-6">
          <div><Label>Customer Notes</Label><Textarea className="mt-1" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          <div><Label>Terms &amp; Conditions</Label><Textarea className="mt-1" rows={3} value={termsText} onChange={(e) => setTermsText(e.target.value)} placeholder="Enter the terms and conditions of your business to be displayed in your transaction" /></div>
        </CardContent></Card>
        <Card><CardContent className="space-y-2 pt-6 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Sub Total</span><span className="tabular-nums">{fmt(totals.subtotal)}</span></div>
          {totals.discountTotal ? <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span className="tabular-nums">−{fmt(totals.discountTotal)}</span></div> : null}
          <div className="flex justify-between"><span className="text-muted-foreground">Tax</span><span className="tabular-nums">{fmt(totals.taxTotal)}</span></div>
          <div className="flex items-center justify-between gap-2"><span className="text-muted-foreground">Adjustment</span><Input type="number" step="0.01" className="h-8 w-28 text-right" value={adjustment} onChange={(e) => setAdjustment(e.target.value)} /></div>
          <div className="flex items-center justify-between gap-2"><span className="text-muted-foreground">TCS</span><Input type="number" step="0.01" className="h-8 w-28 text-right" value={tcs} onChange={(e) => setTcs(e.target.value)} /></div>
          {isForeign ? (
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">Exchange rate (1 {docCurrency} = ? {currency})</span>
              <Input type="number" step="0.0001" min="0" className="h-8 w-28 text-right" value={exchangeRate} onChange={(e) => setExchangeRate(e.target.value)} />
            </div>
          ) : null}
          <div className="flex justify-between border-t pt-2 text-base font-bold"><span>Total ( {docCurrency} )</span><span className="tabular-nums">{fmt(totals.total)}</span></div>
          {isForeign ? <div className="flex justify-between text-xs text-muted-foreground"><span>Posts to ledger in {currency}</span><span className="tabular-nums">≈ {currency} {(totals.total * (Number(exchangeRate) || 0)).toFixed(2)}</span></div> : null}
          <div className="flex justify-between"><span className="text-muted-foreground">Balance Due</span><span className="tabular-nums font-semibold">{fmt(totals.balanceDue)}</span></div>
        </CardContent></Card>
      </div>

      <div className="flex items-center gap-2">
        <Button type="button" variant="secondary" onClick={() => save(false)} disabled={submitting}>Save as Draft</Button>
        <Button type="button" onClick={() => save(true)} disabled={submitting}>Save and Send</Button>
        <Button type="button" variant="ghost" onClick={() => router.push("/invoices")}>Cancel</Button>
      </div>
      </div>{/* /left column */}

      {/* Live preview — always shows the final invoice while you edit. */}
      <aside className="hidden xl:block">
        <div className="sticky top-6 space-y-2">
          <p className="text-[12px] font-medium uppercase tracking-wide text-muted-foreground">Live preview</p>
          <div className="overflow-hidden rounded-3xl border border-border/50 bg-muted/30 p-3 shadow-card">
            <div className="origin-top" style={{ transform: "scale(0.68)", width: "147%" }}>
              <TemplatePreview config={previewConfig} doc={previewDoc} />
            </div>
          </div>
        </div>
      </aside>
      </div>{/* /grid */}
    </div>
  );
}
