"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/shared/PageHeader";
import { useI18n } from "@/lib/i18n";
import { useCurrency } from "@/lib/currency";
import { formatMoney } from "@/lib/utils/currency";
import { todayISO, addDaysISO } from "@/lib/utils/dates";

type Option = { id: string; label: string };
type TaxRate = { id: string; name: string; rate: number };
type Item = { id: string; name: string; sales_price: number };
type LineRow = { description: string; quantity: string; rate: string; tax_rate_id: string; discount: string; item_id: string };

const STATUSES = ["draft", "sent", "viewed", "partial", "paid", "overdue", "void"];
const selectClass = "h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";
const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const emptyLine = (): LineRow => ({ description: "", quantity: "1", rate: "0", tax_rate_id: "", discount: "0", item_id: "" });

async function fetchList(path: string): Promise<Array<Record<string, unknown>>> {
  const response = await fetch(path);
  if (!response.ok) return [];
  const payload = (await response.json()) as { data?: unknown };
  return Array.isArray(payload.data) ? (payload.data as Array<Record<string, unknown>>) : [];
}

export function InvoiceForm({ invoiceId }: { invoiceId?: string }) {
  const router = useRouter();
  const { t } = useI18n();
  const { currency: orgCurrency } = useCurrency();
  const isEdit = Boolean(invoiceId);

  const [contactId, setContactId] = useState("");
  const [issueDate, setIssueDate] = useState(todayISO());
  const [dueDate, setDueDate] = useState(addDaysISO(30));
  const [status, setStatus] = useState("sent");
  const [placeOfSupply, setPlaceOfSupply] = useState("");
  const [tcs, setTcs] = useState("0");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineRow[]>([emptyLine()]);
  const [submitting, setSubmitting] = useState(false);

  const { data: customers = [] } = useQuery({
    queryKey: ["invoice-form-customers"],
    queryFn: async () =>
      (await fetchList("/api/v1/customers?per_page=100")).map((row) => ({ id: String(row.id), label: String(row.display_name ?? "Customer") }) as Option)
  });
  const { data: taxRates = [] } = useQuery({
    queryKey: ["invoice-form-taxes"],
    queryFn: async () =>
      (await fetchList("/api/v1/taxes?per_page=100")).map((row) => ({ id: String(row.id), name: String(row.name ?? ""), rate: Number(row.rate ?? 0) }) as TaxRate)
  });
  const { data: items = [] } = useQuery({
    queryKey: ["invoice-form-items"],
    queryFn: async () =>
      (await fetchList("/api/v1/inventory?per_page=200")).map((row) => ({ id: String(row.id), name: String(row.name ?? ""), sales_price: Number(row.sales_price ?? 0) }) as Item)
  });
  const itemsById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  // Edit mode: load the existing invoice + its lines.
  const { data: existing } = useQuery({
    queryKey: ["invoice", invoiceId],
    queryFn: async () => {
      const response = await fetch(`/api/v1/invoices/${invoiceId}`);
      if (!response.ok) return null;
      const payload = (await response.json()) as { data?: Record<string, unknown> };
      return payload.data ?? null;
    },
    enabled: isEdit
  });

  useEffect(() => {
    if (!existing) return;
    setContactId(String(existing.contact_id ?? ""));
    setIssueDate(String(existing.issue_date ?? todayISO()).slice(0, 10));
    setDueDate(String(existing.due_date ?? addDaysISO(30)).slice(0, 10));
    setStatus(String(existing.status ?? "sent"));
    setPlaceOfSupply(String(existing.place_of_supply ?? ""));
    setTcs(String(existing.tcs_amount ?? "0"));
    setNotes(String(existing.notes ?? ""));
    const items = Array.isArray(existing.line_items) ? (existing.line_items as Array<Record<string, unknown>>) : [];
    if (items.length > 0) {
      setLines(
        items.map((item) => ({
          description: String(item.description ?? ""),
          quantity: String(item.quantity ?? "1"),
          rate: String(item.rate ?? "0"),
          tax_rate_id: String(item.tax_rate_id ?? ""),
          discount: String(item.discount ?? "0"),
          item_id: String(item.item_id ?? "")
        }))
      );
    }
  }, [existing]);

  const rateById = useMemo(() => new Map(taxRates.map((rate) => [rate.id, rate.rate])), [taxRates]);

  const totals = useMemo(() => {
    let subtotal = 0;
    let discountTotal = 0;
    let taxTotal = 0;
    const computed = lines.map((line) => {
      const gross = round2(Number(line.quantity || 0) * Number(line.rate || 0));
      const discount = round2(Number(line.discount || 0));
      const net = round2(gross - discount);
      const percent = line.tax_rate_id ? rateById.get(line.tax_rate_id) ?? 0 : 0;
      const tax = round2((net * percent) / 100);
      subtotal = round2(subtotal + gross);
      discountTotal = round2(discountTotal + discount);
      taxTotal = round2(taxTotal + tax);
      return { net, tax, total: round2(net + tax) };
    });
    return { computed, subtotal, discountTotal, taxTotal, total: round2(subtotal - discountTotal + taxTotal) };
  }, [lines, rateById]);

  const updateLine = (index: number, patch: Partial<LineRow>) =>
    setLines((current) => current.map((line, position) => (position === index ? { ...line, ...patch } : line)));
  const addLine = () => setLines((current) => [...current, emptyLine()]);
  const removeLine = (index: number) => setLines((current) => (current.length === 1 ? current : current.filter((_, position) => position !== index)));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!contactId) {
      toast.error(t("invoiceForm.selectCustomer", "Select a customer."));
      return;
    }
    const validLines = lines.filter((line) => line.description.trim() !== "" && Number(line.quantity) > 0);
    if (validLines.length === 0) {
      toast.error(t("invoiceForm.addLine", "Add at least one line item."));
      return;
    }

    const payload = {
      contact_id: contactId,
      issue_date: issueDate,
      due_date: dueDate,
      status,
      currency: orgCurrency,
      place_of_supply: placeOfSupply || null,
      notes: notes || null,
      subtotal: totals.subtotal,
      discount_total: totals.discountTotal,
      tax_total: totals.taxTotal,
      tcs_amount: Number(tcs) || 0,
      total: totals.total,
      balance_due: totals.total,
      line_items: validLines.map((line) => ({
        description: line.description.trim(),
        quantity: Number(line.quantity),
        rate: Number(line.rate),
        discount: Number(line.discount || 0),
        tax_rate_id: line.tax_rate_id || null,
        item_id: line.item_id || null
      }))
    };

    setSubmitting(true);
    try {
      const response = await fetch(isEdit ? `/api/v1/invoices/${invoiceId}` : "/api/v1/invoices", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        toast.error(body?.error?.message ?? t("invoiceForm.saveFailed", "Could not save the invoice."));
        return;
      }
      toast.success(isEdit ? t("invoiceForm.updated", "Invoice updated.") : t("invoiceForm.created", "Invoice created and posted."));
      router.push("/invoices");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-6 animate-fade-up">
      <PageHeader title={isEdit ? t("invoiceForm.editTitle", "Edit invoice") : t("invoiceForm.newTitle", "New invoice")} description={t("invoiceForm.desc", "Line items post a balanced journal entry to the ledger.")} />

      <Card>
        <CardHeader>
          <CardTitle>{t("invoiceForm.details", "Details")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-2">
          <div>
            <Label htmlFor="contact">{t("invoiceForm.customer", "Customer")}</Label>
            <select id="contact" className={`${selectClass} mt-2`} value={contactId} onChange={(event) => setContactId(event.target.value)} required>
              <option value="">{t("common.select", "Select…")}</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="status">{t("invoiceForm.status", "Status")}</Label>
            <select id="status" className={`${selectClass} mt-2`} value={status} onChange={(event) => setStatus(event.target.value)}>
              {STATUSES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="issue">{t("invoiceForm.issueDate", "Issue date")}</Label>
            <Input id="issue" type="date" className="mt-2" value={issueDate} onChange={(event) => setIssueDate(event.target.value)} />
          </div>
          <div>
            <Label htmlFor="due">{t("invoiceForm.dueDate", "Due date")}</Label>
            <Input id="due" type="date" className="mt-2" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
          </div>
          <div>
            <Label htmlFor="pos">{t("invoiceForm.placeOfSupply", "Place of supply (state code)")}</Label>
            <Input id="pos" className="mt-2" maxLength={2} value={placeOfSupply} onChange={(event) => setPlaceOfSupply(event.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("invoiceForm.lineItems", "Line items")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="hidden gap-2 text-xs font-semibold uppercase text-muted-foreground md:grid md:grid-cols-[170px_1fr_80px_100px_130px_100px_100px_40px]">
            <span>{t("invoiceForm.item", "Item")}</span>
            <span>{t("invoiceForm.description", "Description")}</span>
            <span>{t("invoiceForm.qty", "Qty")}</span>
            <span>{t("invoiceForm.rate", "Rate")}</span>
            <span>{t("invoiceForm.tax", "Tax")}</span>
            <span>{t("invoiceForm.discount", "Discount")}</span>
            <span className="text-right">{t("invoiceForm.amount", "Amount")}</span>
            <span />
          </div>
          {lines.map((line, index) => (
            <div key={index} className="grid gap-2 md:grid-cols-[170px_1fr_80px_100px_130px_100px_100px_40px] md:items-center">
              <select
                className={selectClass}
                value={line.item_id}
                onChange={(event) => {
                  const selected = itemsById.get(event.target.value);
                  updateLine(index, selected ? { item_id: selected.id, description: selected.name, rate: String(selected.sales_price) } : { item_id: "" });
                }}
              >
                <option value="">{t("invoiceForm.noItem", "— none —")}</option>
                {items.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
              <Input placeholder={t("invoiceForm.description", "Description")} value={line.description} onChange={(event) => updateLine(index, { description: event.target.value })} />
              <Input type="number" min="0" step="0.01" value={line.quantity} onChange={(event) => updateLine(index, { quantity: event.target.value })} />
              <Input type="number" min="0" step="0.01" value={line.rate} onChange={(event) => updateLine(index, { rate: event.target.value })} />
              <select className={selectClass} value={line.tax_rate_id} onChange={(event) => updateLine(index, { tax_rate_id: event.target.value })}>
                <option value="">{t("invoiceForm.noTax", "No tax")}</option>
                {taxRates.map((rate) => (
                  <option key={rate.id} value={rate.id}>
                    {rate.name}
                  </option>
                ))}
              </select>
              <Input type="number" min="0" step="0.01" value={line.discount} onChange={(event) => updateLine(index, { discount: event.target.value })} />
              <span className="text-right text-sm tabular-nums">{formatMoney(totals.computed[index]?.total ?? 0)}</span>
              <Button type="button" variant="ghost" size="sm" aria-label={t("common.remove", "Remove")} onClick={() => removeLine(index)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button type="button" variant="secondary" size="sm" onClick={addLine}>
            <Plus className="mr-2 h-4 w-4" />
            {t("invoiceForm.addLine", "Add line")}
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader>
            <CardTitle>{t("invoiceForm.notes", "Notes")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("invoiceForm.summary", "Summary")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">{t("invoiceForm.subtotal", "Subtotal")}</span><span className="tabular-nums">{formatMoney(totals.subtotal)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">{t("invoiceForm.discount", "Discount")}</span><span className="tabular-nums">−{formatMoney(totals.discountTotal)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">{t("invoiceForm.tax", "Tax")}</span><span className="tabular-nums">{formatMoney(totals.taxTotal)}</span></div>
            <div className="flex justify-between border-t pt-2 text-base font-bold"><span>{t("invoiceForm.total", "Total")}</span><span className="tabular-nums">{formatMoney(totals.total)}</span></div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">{t("invoiceForm.tcs", "TCS")}</span>
              <Input type="number" min="0" step="0.01" className="h-8 w-28 text-right" value={tcs} onChange={(event) => setTcs(event.target.value)} />
            </div>
            <div className="flex justify-between text-sm font-semibold"><span>{t("invoiceForm.amountDue", "Amount due")}</span><span className="tabular-nums">{formatMoney(totals.total + (Number(tcs) || 0))}</span></div>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={() => router.push("/invoices")}>{t("common.cancel", "Cancel")}</Button>
        <Button type="submit" disabled={submitting}>{isEdit ? t("invoiceForm.update", "Update invoice") : t("invoiceForm.save", "Save invoice")}</Button>
      </div>
    </form>
  );
}
