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
type Account = { id: string; name: string; account_type: string };
type Item = { id: string; name: string; sales_price: number };
type LineRow = { description: string; quantity: string; rate: string; discount: string; item_id: string; account_id: string };

const selectClass = "h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";
const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const emptyLine = (): LineRow => ({ description: "", quantity: "1", rate: "0", discount: "0", item_id: "", account_id: "" });
const INCOME_TYPES = ["revenue", "income", "other_income"];

async function fetchList(path: string): Promise<Array<Record<string, unknown>>> {
  const r = await fetch(path);
  if (!r.ok) return [];
  const payload = (await r.json()) as { data?: unknown };
  return Array.isArray(payload.data) ? (payload.data as Array<Record<string, unknown>>) : [];
}

export function CreditNoteForm({ creditNoteId }: { creditNoteId?: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { currency, format } = useCurrency();
  const isEdit = Boolean(creditNoteId);

  const [contactId, setContactId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [number, setNumber] = useState("");
  const [reference, setReference] = useState("");
  const [issueDate, setIssueDate] = useState(todayISO());
  const [arAccountId, setArAccountId] = useState("");
  const [salesperson, setSalesperson] = useState("");
  const [subject, setSubject] = useState("");
  const [notes, setNotes] = useState("");
  const [termsText, setTermsText] = useState("");
  const [adjustment, setAdjustment] = useState("0");
  const [lines, setLines] = useState<LineRow[]>([emptyLine()]);
  const [submitting, setSubmitting] = useState(false);

  const { data: customers = [] } = useQuery({ queryKey: ["cn-form-customers"], staleTime: 0, queryFn: async () => (await fetchList("/api/v1/customers?per_page=200")).map((r) => ({ id: String(r.id), label: String(r.display_name ?? "Customer") }) as Option) });
  const { data: warehouses = [] } = useQuery({ queryKey: ["cn-form-warehouses"], queryFn: async () => (await fetchList("/api/v1/warehouses?per_page=200")).map((r) => ({ id: String(r.id), label: String(r.name ?? "") }) as Option) });
  const { data: items = [] } = useQuery({ queryKey: ["cn-form-items"], staleTime: 0, queryFn: async () => (await fetchList("/api/v1/inventory?per_page=200")).map((r) => ({ id: String(r.id), name: String(r.name ?? ""), sales_price: Number(r.sales_price ?? 0) }) as Item) });
  const { data: accounts = [] } = useQuery({ queryKey: ["cn-form-accounts"], queryFn: async () => (await fetchList("/api/v1/accounts?per_page=200")).map((r) => ({ id: String(r.id), name: String(r.name ?? ""), account_type: String(r.account_type) }) as Account) });
  const arAccounts = useMemo(() => accounts.filter((a) => a.account_type === "accounts_receivable"), [accounts]);
  const incomeAccounts = useMemo(() => accounts.filter((a) => INCOME_TYPES.includes(a.account_type)), [accounts]);
  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  useEffect(() => { if (!arAccountId && arAccounts.length) setArAccountId(arAccounts[0].id); }, [arAccounts, arAccountId]);

  const { data: existing } = useQuery({
    queryKey: ["credit-note", creditNoteId],
    queryFn: async () => {
      const r = await fetch(`/api/v1/credit-notes/${creditNoteId}`);
      if (!r.ok) return null;
      return ((await r.json()) as { data?: Record<string, unknown> }).data ?? null;
    },
    enabled: isEdit
  });

  useEffect(() => {
    if (!existing) return;
    setContactId(String(existing.contact_id ?? ""));
    setWarehouseId(existing.warehouse_id ? String(existing.warehouse_id) : "");
    setNumber(String(existing.credit_note_number ?? ""));
    setReference(String(existing.reference_number ?? ""));
    setIssueDate(String(existing.issue_date ?? todayISO()).slice(0, 10));
    setArAccountId(existing.ar_account_id ? String(existing.ar_account_id) : "");
    setSalesperson(String(existing.salesperson ?? ""));
    setSubject(String(existing.subject ?? ""));
    setNotes(String(existing.notes ?? ""));
    setTermsText(String(existing.terms ?? ""));
    setAdjustment(String(existing.round_off ?? "0"));
    const rows = Array.isArray(existing.line_items) ? (existing.line_items as Array<Record<string, unknown>>) : [];
    if (rows.length) setLines(rows.map((l) => ({ description: String(l.description ?? ""), quantity: String(l.quantity ?? "1"), rate: String(l.rate ?? "0"), discount: String(l.discount ?? "0"), item_id: String(l.item_id ?? ""), account_id: String(l.account_id ?? "") })));
  }, [existing]);

  // Prefill the next credit note number (Zoho-style) for new credit notes.
  const nextNum = useNextNumber("credit-note", !isEdit);
  useEffect(() => { if (!isEdit && nextNum.preview) setNumber((cur) => cur || nextNum.preview || ""); }, [nextNum.preview, isEdit]);

  // Preserve in-progress data across a Combobox "+ New" round-trip (create only).
  const { clearDraft } = useFormDraft(
    "qf-draft:credit-note",
    { contactId, warehouseId, number, reference, issueDate, arAccountId, salesperson, subject, notes, termsText, adjustment, lines },
    (d) => {
      if (d.contactId !== undefined) setContactId(d.contactId);
      if (d.warehouseId !== undefined) setWarehouseId(d.warehouseId);
      if (d.number !== undefined) setNumber(d.number);
      if (d.reference !== undefined) setReference(d.reference);
      if (d.issueDate !== undefined) setIssueDate(d.issueDate);
      if (d.arAccountId !== undefined) setArAccountId(d.arAccountId);
      if (d.salesperson !== undefined) setSalesperson(d.salesperson);
      if (d.subject !== undefined) setSubject(d.subject);
      if (d.notes !== undefined) setNotes(d.notes);
      if (d.termsText !== undefined) setTermsText(d.termsText);
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

  const save = async (status: "draft" | "open") => {
    if (!contactId) { toast.error("Select a customer."); return; }
    const validLines = lines.filter((l) => (l.description.trim() !== "" || l.item_id) && Number(l.quantity) > 0);
    if (validLines.length === 0) { toast.error("Add at least one item."); return; }

    const payload = {
      contact_id: contactId,
      warehouse_id: warehouseId || null,
      credit_note_number: nextNum.numberToSubmit(number),
      reference_number: reference.trim() || null,
      issue_date: issueDate,
      status, currency,
      ar_account_id: arAccountId || null,
      salesperson: salesperson.trim() || null,
      subject: subject.trim() || null,
      notes: notes.trim() || null,
      terms: termsText.trim() || null,
      adjustment: Number(adjustment) || 0,
      subtotal: totals.subtotal,
      tax_total: 0,
      total: totals.total,
      line_items: validLines.map((l) => ({ item_id: l.item_id || null, account_id: l.account_id || null, description: (l.description.trim() || itemsById.get(l.item_id)?.name) ?? "", quantity: Number(l.quantity), rate: Number(l.rate), discount: Number(l.discount || 0) }))
    };

    setSubmitting(true);
    try {
      const res = await fetch(isEdit ? `/api/v1/credit-notes/${creditNoteId}` : "/api/v1/credit-notes", { method: isEdit ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        toast.error(body?.error?.message ?? "Could not save the credit note.");
        return;
      }
      const saved = (await res.json()) as { data?: { id?: string } };
      const id = saved?.data?.id ?? creditNoteId;
      toast.success(isEdit ? "Credit note updated." : status === "open" ? "Credit note saved as open." : "Credit note saved as draft.");
      clearDraft();
      qc.invalidateQueries({ queryKey: ["module", "credit-notes"] });
      router.push(id ? `/credit-notes/${id}` : "/credit-notes");
    } finally { setSubmitting(false); }
  };

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{isEdit ? "Edit Credit Note" : "New Credit Note"}</h1>
        <Button asChild size="sm" variant="ghost"><a href="/credit-notes" aria-label="Close"><X className="h-4 w-4" /></a></Button>
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
        <div><Label className="text-destructive">Credit Note#</Label><Input className="mt-1" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="Auto-generated (e.g. CN-00001)" /></div>
        <div><Label>Reference#</Label><Input className="mt-1" value={reference} onChange={(e) => setReference(e.target.value)} /></div>
        <div><Label className="text-destructive">Credit Note Date*</Label><Input type="date" className="mt-1" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} /></div>
        <div>
          <Label>Accounts Receivable</Label>
          <Combobox className="mt-1" value={arAccountId} onChange={setArAccountId} placeholder="Select an account" searchPlaceholder="Search accounts…" options={arAccounts.map((a) => ({ value: a.id, label: a.name }))} />
        </div>
        <div><Label>Salesperson</Label><Input className="mt-1" value={salesperson} onChange={(e) => setSalesperson(e.target.value)} placeholder="Select or Add Salesperson" /></div>
        <div className="md:col-span-2"><Label>Subject</Label><Input className="mt-1" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Let your customer know what this Credit Note is for" /></div>
      </CardContent></Card>

      <Card><CardContent className="space-y-3 pt-6">
        <p className="text-sm font-semibold">Item Table</p>
        <div className="hidden gap-2 text-xs font-semibold uppercase text-muted-foreground md:grid md:grid-cols-[1fr_150px_80px_100px_90px_100px_40px]">
          <span>Item Details</span><span>Account</span><span className="text-right">Qty</span><span className="text-right">Rate</span><span className="text-right">Discount</span><span className="text-right">Amount</span><span />
        </div>
        {lines.map((line, index) => (
          <div key={index} className="grid gap-2 md:grid-cols-[1fr_150px_80px_100px_90px_100px_40px] md:items-start">
            <div className="space-y-1">
              <Combobox value={line.item_id} placeholder="Type or click to select an item." searchPlaceholder="Search items…" createHref="/inventory/new" createLabel="New Item"
                onChange={(val) => { const it = itemsById.get(val); updateLine(index, it ? { item_id: it.id, description: it.name, rate: String(it.sales_price) } : { item_id: "" }); }}
                options={items.map((it) => ({ value: it.id, label: it.name }))} />
              <Input placeholder="Description" value={line.description} onChange={(e) => updateLine(index, { description: e.target.value })} />
            </div>
            <Combobox value={line.account_id} placeholder="Select an account" searchPlaceholder="Search accounts…" onChange={(val) => updateLine(index, { account_id: val })} options={incomeAccounts.map((a) => ({ value: a.id, label: a.name }))} />
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
          <div><Label>Customer Notes</Label><Textarea className="mt-1" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Will be displayed on the credit note" /></div>
          <div><Label>Terms &amp; Conditions</Label><Textarea className="mt-1" rows={3} value={termsText} onChange={(e) => setTermsText(e.target.value)} placeholder="Enter the terms and conditions of your business to be displayed in your transaction" /></div>
        </CardContent></Card>
        <Card><CardContent className="space-y-2 pt-6 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Sub Total</span><span className="tabular-nums">{format(totals.subtotal)}</span></div>
          {totals.discountTotal ? <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span className="tabular-nums">−{format(totals.discountTotal)}</span></div> : null}
          <div className="flex items-center justify-between gap-2"><span className="text-muted-foreground">Adjustment</span><Input type="number" step="0.01" className="h-8 w-28 text-right" value={adjustment} onChange={(e) => setAdjustment(e.target.value)} /></div>
          <div className="flex justify-between border-t pt-2 text-base font-bold"><span>Total ( {currency} )</span><span className="tabular-nums">{format(totals.total)}</span></div>
        </CardContent></Card>
      </div>

      <div className="flex items-center gap-2">
        <Button type="button" variant="secondary" onClick={() => save("draft")} disabled={submitting}>Save as Draft</Button>
        <Button type="button" onClick={() => save("open")} disabled={submitting}>Save as Open</Button>
        <Button type="button" variant="ghost" onClick={() => router.push("/credit-notes")}>Cancel</Button>
      </div>
    </div>
  );
}
