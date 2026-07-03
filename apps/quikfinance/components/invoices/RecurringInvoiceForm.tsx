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
import { useCurrency } from "@/lib/currency";
import { todayISO } from "@/lib/utils/dates";

type Option = { id: string; label: string };
type Account = { id: string; name: string; account_type: string };
type TaxRate = { id: string; name: string; rate: number };
type Item = { id: string; name: string; sales_price: number };
type LineRow = { description: string; quantity: string; rate: string; discount: string; tax_rate_id: string; item_id: string };

const selectClass = "h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";
const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const emptyLine = (): LineRow => ({ description: "", quantity: "1", rate: "0", discount: "0", tax_rate_id: "", item_id: "" });
// "Repeat Every" options → internal frequency values.
const REPEAT_OPTIONS = [
  { value: "weekly", label: "Week" },
  { value: "biweekly", label: "2 Weeks" },
  { value: "monthly", label: "Month" },
  { value: "bimonthly", label: "2 Months" },
  { value: "quarterly", label: "3 Months" },
  { value: "semiannually", label: "6 Months" },
  { value: "annually", label: "Year" }
];

async function fetchList(path: string): Promise<Array<Record<string, unknown>>> {
  const r = await fetch(path);
  if (!r.ok) return [];
  const payload = (await r.json()) as { data?: unknown };
  return Array.isArray(payload.data) ? (payload.data as Array<Record<string, unknown>>) : [];
}

export function RecurringInvoiceForm() {
  const router = useRouter();
  const qc = useQueryClient();
  const { currency, format } = useCurrency();

  const [contactId, setContactId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [profileName, setProfileName] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [frequency, setFrequency] = useState("monthly");
  const [startOn, setStartOn] = useState(todayISO());
  const [endsOn, setEndsOn] = useState("");
  const [neverExpires, setNeverExpires] = useState(true);
  const [arAccountId, setArAccountId] = useState("");
  const [salesperson, setSalesperson] = useState("");
  const [subject, setSubject] = useState("");
  const [notes, setNotes] = useState("");
  const [termsText, setTermsText] = useState("");
  const [lines, setLines] = useState<LineRow[]>([emptyLine()]);
  const [submitting, setSubmitting] = useState(false);

  const { data: customers = [] } = useQuery({ queryKey: ["ri-customers"], staleTime: 0, queryFn: async () => (await fetchList("/api/v1/customers?per_page=200")).map((r) => ({ id: String(r.id), label: String(r.display_name ?? "Customer") }) as Option) });
  const { data: warehouses = [] } = useQuery({ queryKey: ["ri-warehouses"], queryFn: async () => (await fetchList("/api/v1/warehouses?per_page=200")).map((r) => ({ id: String(r.id), label: String(r.name ?? "") }) as Option) });
  const { data: items = [] } = useQuery({ queryKey: ["ri-items"], staleTime: 0, queryFn: async () => (await fetchList("/api/v1/inventory?per_page=200")).map((r) => ({ id: String(r.id), name: String(r.name ?? ""), sales_price: Number(r.sales_price ?? 0) }) as Item) });
  const { data: taxRates = [] } = useQuery({ queryKey: ["ri-taxes"], queryFn: async () => (await fetchList("/api/v1/taxes?per_page=100")).map((r) => ({ id: String(r.id), name: String(r.name ?? ""), rate: Number(r.rate ?? 0) }) as TaxRate) });
  const { data: arAccounts = [] } = useQuery({ queryKey: ["ri-ar"], queryFn: async () => (await fetchList("/api/v1/accounts?per_page=200")).filter((r) => r.account_type === "accounts_receivable").map((r) => ({ id: String(r.id), name: String(r.name ?? ""), account_type: String(r.account_type) }) as Account) });
  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const rateById = useMemo(() => new Map(taxRates.map((t) => [t.id, t.rate])), [taxRates]);

  useEffect(() => { if (!arAccountId && arAccounts.length) setArAccountId(arAccounts[0].id); }, [arAccounts, arAccountId]);

  // Preserve in-progress data across a Combobox "+ New" round-trip.
  const { clearDraft } = useFormDraft(
    "qf-draft:recurring-invoice",
    { contactId, warehouseId, profileName, orderNumber, frequency, startOn, endsOn, neverExpires, arAccountId, salesperson, subject, notes, termsText, lines },
    (d) => {
      if (d.contactId !== undefined) setContactId(d.contactId);
      if (d.warehouseId !== undefined) setWarehouseId(d.warehouseId);
      if (d.profileName !== undefined) setProfileName(d.profileName);
      if (d.orderNumber !== undefined) setOrderNumber(d.orderNumber);
      if (d.frequency !== undefined) setFrequency(d.frequency);
      if (d.startOn !== undefined) setStartOn(d.startOn);
      if (d.endsOn !== undefined) setEndsOn(d.endsOn);
      if (d.neverExpires !== undefined) setNeverExpires(d.neverExpires);
      if (d.arAccountId !== undefined) setArAccountId(d.arAccountId);
      if (d.salesperson !== undefined) setSalesperson(d.salesperson);
      if (d.subject !== undefined) setSubject(d.subject);
      if (d.notes !== undefined) setNotes(d.notes);
      if (d.termsText !== undefined) setTermsText(d.termsText);
      if (Array.isArray(d.lines) && d.lines.length) setLines(d.lines);
    }
  );

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
    return { computed, subtotal, discountTotal, taxTotal, total: round2(subtotal - discountTotal + taxTotal) };
  }, [lines, rateById]);

  const updateLine = (i: number, patch: Partial<LineRow>) => setLines((c) => c.map((l, p) => (p === i ? { ...l, ...patch } : l)));
  const addLine = () => setLines((c) => [...c, emptyLine()]);
  const removeLine = (i: number) => setLines((c) => (c.length === 1 ? c : c.filter((_, p) => p !== i)));

  const save = async () => {
    if (!contactId) { toast.error("Select a customer."); return; }
    if (!profileName.trim()) { toast.error("Enter a profile name."); return; }
    const validLines = lines.filter((l) => (l.description.trim() !== "" || l.item_id) && Number(l.quantity) > 0);
    if (validLines.length === 0) { toast.error("Add at least one item."); return; }
    if (!neverExpires && !endsOn) { toast.error("Choose an end date or select Never Expires."); return; }

    const payload = {
      profile_name: profileName.trim(),
      order_number: orderNumber.trim() || null,
      frequency,
      start_date: startOn,
      end_date: neverExpires ? null : endsOn,
      never_expires: neverExpires,
      invoice: {
        contact_id: contactId,
        warehouse_id: warehouseId || null,
        issue_date: startOn,
        due_date: startOn,
        status: "draft",
        currency,
        ar_account_id: arAccountId || null,
        salesperson: salesperson.trim() || null,
        subject: subject.trim() || null,
        notes: notes.trim() || null,
        terms: termsText.trim() || null,
        subtotal: totals.subtotal,
        discount_total: totals.discountTotal,
        tax_total: totals.taxTotal,
        total: totals.total,
        balance_due: totals.total,
        line_items: validLines.map((l) => ({ item_id: l.item_id || null, description: (l.description.trim() || itemsById.get(l.item_id)?.name) ?? "", quantity: Number(l.quantity), rate: Number(l.rate), discount: Number(l.discount || 0), tax_rate_id: l.tax_rate_id || null }))
      }
    };

    setSubmitting(true);
    try {
      const res = await fetch("/api/v1/recurring/invoice", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        toast.error(body?.error?.message ?? "Could not create the recurring invoice.");
        return;
      }
      toast.success("Recurring invoice profile created.");
      clearDraft();
      qc.invalidateQueries({ queryKey: ["recurring"] });
      router.push("/recurring");
    } finally { setSubmitting(false); }
  };

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">New Recurring Invoice</h1>
        <Button asChild size="sm" variant="ghost"><a href="/recurring" aria-label="Close"><X className="h-4 w-4" /></a></Button>
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
        <div><Label className="text-destructive">Profile Name*</Label><Input className="mt-1" value={profileName} onChange={(e) => setProfileName(e.target.value)} placeholder="e.g. Monthly retainer" /></div>
        <div><Label>Order Number</Label><Input className="mt-1" value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} /></div>
        <div>
          <Label className="text-destructive">Repeat Every*</Label>
          <select className={`${selectClass} mt-1`} value={frequency} onChange={(e) => setFrequency(e.target.value)}>
            {REPEAT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 items-end gap-3">
          <div><Label>Start On</Label><Input type="date" className="mt-1" value={startOn} onChange={(e) => setStartOn(e.target.value)} /></div>
          <div>
            <Label>Ends On</Label>
            <Input type="date" className="mt-1" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} disabled={neverExpires} />
            <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-primary" checked={neverExpires} onChange={(e) => setNeverExpires(e.target.checked)} />Never Expires</label>
          </div>
        </div>
        <div>
          <Label>Accounts Receivable</Label>
          <div className="mt-1">
            <Combobox value={arAccountId} placeholder="Select an account" searchPlaceholder="Search accounts…"
              onChange={(val) => setArAccountId(val)} options={arAccounts.map((a) => ({ value: a.id, label: a.name }))} />
          </div>
        </div>
        <div><Label>Salesperson</Label><Input className="mt-1" value={salesperson} onChange={(e) => setSalesperson(e.target.value)} placeholder="Select or Add Salesperson" /></div>
        <div className="md:col-span-2"><Label>Subject</Label><Input className="mt-1" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Let your customer know what this Recurring Invoice is for" /></div>
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
            <span className="px-1 py-2 text-right text-sm tabular-nums">{format(totals.computed[index] ?? 0)}</span>
            <Button type="button" variant="ghost" size="sm" aria-label="Remove" onClick={() => removeLine(index)}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
        <Button type="button" variant="secondary" size="sm" onClick={addLine}><Plus className="mr-2 h-4 w-4" />Add New Row</Button>
      </CardContent></Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card><CardContent className="space-y-4 pt-6">
          <div><Label>Customer Notes</Label><Textarea className="mt-1" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          <div><Label>Terms &amp; Conditions</Label><Textarea className="mt-1" rows={3} value={termsText} onChange={(e) => setTermsText(e.target.value)} /></div>
        </CardContent></Card>
        <Card><CardContent className="space-y-2 pt-6 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Sub Total</span><span className="tabular-nums">{format(totals.subtotal)}</span></div>
          {totals.discountTotal ? <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span className="tabular-nums">−{format(totals.discountTotal)}</span></div> : null}
          <div className="flex justify-between"><span className="text-muted-foreground">Tax</span><span className="tabular-nums">{format(totals.taxTotal)}</span></div>
          <div className="flex justify-between border-t pt-2 text-base font-bold"><span>Total ( {currency} )</span><span className="tabular-nums">{format(totals.total)}</span></div>
          <p className="pt-1 text-xs text-muted-foreground">An invoice for this amount will be generated every {REPEAT_OPTIONS.find((o) => o.value === frequency)?.label.toLowerCase()} from {startOn}.</p>
        </CardContent></Card>
      </div>

      <div className="flex items-center gap-2">
        <Button type="button" onClick={save} disabled={submitting}>Save</Button>
        <Button type="button" variant="ghost" onClick={() => router.push("/recurring")}>Cancel</Button>
      </div>
    </div>
  );
}
