"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Combobox } from "@/components/ui/combobox";
import { useFormDraft } from "@/lib/hooks/use-form-draft";
import { useNextNumber } from "@/lib/hooks/use-next-number";
import { PageHeader } from "@/components/shared/PageHeader";
import { useI18n } from "@/lib/i18n";
import { useCurrency } from "@/lib/currency";
import { formatMoney } from "@/lib/utils/currency";
import { todayISO, addDaysISO } from "@/lib/utils/dates";

type Vendor = { id: string; label: string; ap_account_id: string; payment_terms: string; billing_address: Record<string, unknown> | null };
type Option = { id: string; label: string };
type TaxRate = { id: string; name: string; rate: number };
type Item = { id: string; name: string; purchase_price: number };
type LineRow = { description: string; quantity: string; rate: string; tax_rate_id: string; discount: string; account_id: string; item_id: string };
type Attachment = { id?: string; file_name: string; content_type?: string | null; size_bytes: number; data?: string };

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const EXPENSE_TYPES = ["expense", "cost_of_goods_sold", "other_expense", "other_current_asset", "fixed_asset"];
const AP_TYPES = ["accounts_payable", "other_current_liability"];
const PAYMENT_TERMS: Record<string, number> = { "Due on Receipt": 0, "Net 15": 15, "Net 30": 30, "Net 45": 45, "Net 60": 60 };
const selectClass = "h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";
const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const emptyLine = (): LineRow => ({ description: "", quantity: "1", rate: "0", tax_rate_id: "", discount: "0", account_id: "", item_id: "" });

function addrLines(a?: Record<string, unknown> | null): string[] {
  if (!a) return [];
  return [a.line1, a.line2, [a.city, a.state].filter(Boolean).join(", "), [a.country, a.postal_code].filter(Boolean).join(" ")]
    .map((x) => (x ? String(x) : "")).filter(Boolean);
}

async function fetchList(path: string): Promise<Array<Record<string, unknown>>> {
  const response = await fetch(path);
  if (!response.ok) return [];
  const payload = (await response.json()) as { data?: unknown };
  return Array.isArray(payload.data) ? (payload.data as Array<Record<string, unknown>>) : [];
}

export function BillForm({ billId }: { billId?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const cloneId = searchParams.get("clone");
  const { t } = useI18n();
  const { currency: orgCurrency } = useCurrency();
  const isEdit = Boolean(billId);

  const [contactId, setContactId] = useState("");
  const [billNumber, setBillNumber] = useState("");
  const [reference, setReference] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [issueDate, setIssueDate] = useState(todayISO());
  const [dueDate, setDueDate] = useState(addDaysISO(30));
  const [paymentTerms, setPaymentTerms] = useState("Net 30");
  const [apAccountId, setApAccountId] = useState("");
  const [subject, setSubject] = useState("");
  const [status, setStatus] = useState("open");
  const [notes, setNotes] = useState("");
  const [tds, setTds] = useState("0");
  const [lines, setLines] = useState<LineRow[]>([emptyLine()]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const { data: vendors = [] } = useQuery({
    queryKey: ["bill-form-vendors"],
    staleTime: 0,
    queryFn: async () =>
      (await fetchList("/api/v1/vendors?per_page=200")).map((row) => ({
        id: String(row.id), label: String(row.display_name ?? "Vendor"),
        ap_account_id: row.ap_account_id ? String(row.ap_account_id) : "",
        payment_terms: row.payment_terms != null ? String(row.payment_terms) : "",
        billing_address: (row.billing_address as Record<string, unknown>) ?? null
      } as Vendor))
  });
  const { data: warehouses = [] } = useQuery({ queryKey: ["bill-form-warehouses"], queryFn: async () => (await fetchList("/api/v1/warehouses?per_page=200")).map((r) => ({ id: String(r.id), label: String(r.name ?? "") }) as Option) });
  const { data: taxRates = [] } = useQuery({
    queryKey: ["bill-form-taxes"],
    queryFn: async () =>
      (await fetchList("/api/v1/taxes?per_page=100")).map((row) => ({ id: String(row.id), name: String(row.name ?? ""), rate: Number(row.rate ?? 0) }) as TaxRate)
  });
  const { data: accounts = [] } = useQuery({
    queryKey: ["bill-form-accounts"],
    queryFn: async () => (await fetchList("/api/v1/accounts?per_page=300")).map((row) => ({ id: String(row.id), label: `${row.code} · ${row.name}`, type: String(row.account_type) }))
  });
  const expenseAccounts = useMemo(() => accounts.filter((a) => EXPENSE_TYPES.includes(a.type)), [accounts]);
  const apAccounts = useMemo(() => accounts.filter((a) => AP_TYPES.includes(a.type)), [accounts]);
  const { data: items = [] } = useQuery({
    queryKey: ["bill-form-items"],
    staleTime: 0,
    queryFn: async () =>
      (await fetchList("/api/v1/inventory?per_page=200")).map((row) => ({ id: String(row.id), name: String(row.name ?? ""), purchase_price: Number(row.purchase_price ?? 0) }) as Item)
  });
  const itemsById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const vendorById = useMemo(() => new Map(vendors.map((v) => [v.id, v])), [vendors]);
  const selectedVendor = contactId ? vendorById.get(contactId) : undefined;

  // Default the A/P account once accounts load (Zoho pre-fills "Accounts Payable").
  useEffect(() => { if (!apAccountId && apAccounts.length) setApAccountId(apAccounts[0].id); }, [apAccounts, apAccountId]);

  // Prefill the next bill number (Zoho-style) for new bills.
  const nextNum = useNextNumber("bill", !isEdit);
  useEffect(() => { if (!isEdit && nextNum.preview) setBillNumber((cur) => cur || nextNum.preview || ""); }, [nextNum.preview, isEdit]);

  const { data: existing } = useQuery({
    queryKey: ["bill", billId],
    queryFn: async () => {
      const response = await fetch(`/api/v1/bills/${billId}`);
      if (!response.ok) return null;
      const payload = (await response.json()) as { data?: Record<string, unknown> };
      return payload.data ?? null;
    },
    enabled: isEdit
  });

  useEffect(() => {
    if (!existing) return;
    setContactId(String(existing.contact_id ?? ""));
    setBillNumber(String(existing.bill_number ?? ""));
    setReference(String(existing.reference_number ?? existing.vendor_reference ?? ""));
    setOrderNumber(String(existing.order_number ?? ""));
    setWarehouseId(existing.warehouse_id ? String(existing.warehouse_id) : "");
    setIssueDate(String(existing.issue_date ?? todayISO()).slice(0, 10));
    setDueDate(String(existing.due_date ?? addDaysISO(30)).slice(0, 10));
    setPaymentTerms(String(existing.payment_terms ?? "Net 30"));
    setApAccountId(existing.ap_account_id ? String(existing.ap_account_id) : "");
    setSubject(String(existing.subject ?? ""));
    setStatus(String(existing.status ?? "open"));
    setNotes(String(existing.notes ?? ""));
    setTds(String(existing.tds_amount ?? "0"));
    const rows = Array.isArray(existing.line_items) ? (existing.line_items as Array<Record<string, unknown>>) : [];
    if (rows.length > 0) {
      setLines(rows.map((item) => ({
        description: String(item.description ?? ""), quantity: String(item.quantity ?? "1"), rate: String(item.rate ?? "0"),
        tax_rate_id: String(item.tax_rate_id ?? ""), discount: String(item.discount ?? "0"), account_id: String(item.account_id ?? ""), item_id: String(item.item_id ?? "")
      })));
    }
    const atts = Array.isArray(existing.attachments) ? (existing.attachments as Array<Record<string, unknown>>) : [];
    setAttachments(atts.map((a) => ({ id: String(a.id), file_name: String(a.file_name ?? "file"), content_type: a.content_type ? String(a.content_type) : null, size_bytes: Number(a.size_bytes ?? 0) })));
  }, [existing]);

  // Clone: prefill a brand-new bill from an existing one (no number/attachments/payments carried over).
  const { data: cloneSrc } = useQuery({
    queryKey: ["bill-clone", cloneId],
    enabled: !isEdit && Boolean(cloneId),
    queryFn: async () => {
      const r = await fetch(`/api/v1/bills/${cloneId}`);
      return r.ok ? (((await r.json()) as { data?: Record<string, unknown> }).data ?? null) : null;
    }
  });
  useEffect(() => {
    if (!cloneSrc) return;
    setContactId(String(cloneSrc.contact_id ?? ""));
    setReference(String(cloneSrc.reference_number ?? cloneSrc.vendor_reference ?? ""));
    setOrderNumber(String(cloneSrc.order_number ?? ""));
    setWarehouseId(cloneSrc.warehouse_id ? String(cloneSrc.warehouse_id) : "");
    setPaymentTerms(String(cloneSrc.payment_terms ?? "Net 30"));
    setApAccountId(cloneSrc.ap_account_id ? String(cloneSrc.ap_account_id) : "");
    setSubject(String(cloneSrc.subject ?? ""));
    setNotes(String(cloneSrc.notes ?? ""));
    const rows = Array.isArray(cloneSrc.line_items) ? (cloneSrc.line_items as Array<Record<string, unknown>>) : [];
    if (rows.length) setLines(rows.map((item) => ({
      description: String(item.description ?? ""), quantity: String(item.quantity ?? "1"), rate: String(item.rate ?? "0"),
      tax_rate_id: String(item.tax_rate_id ?? ""), discount: String(item.discount ?? "0"), account_id: String(item.account_id ?? ""), item_id: String(item.item_id ?? "")
    })));
  }, [cloneSrc]);

  const onFiles = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach((file) => {
      if (file.size > MAX_ATTACHMENT_BYTES) { toast.error(`${file.name} exceeds 10 MB.`); return; }
      const reader = new FileReader();
      reader.onload = () => setAttachments((cur) => [...cur, { file_name: file.name, content_type: file.type || null, size_bytes: file.size, data: String(reader.result) }]);
      reader.readAsDataURL(file);
    });
  };
  const removeAttachment = (index: number) => setAttachments((cur) => cur.filter((_, i) => i !== index));

  const rateById = useMemo(() => new Map(taxRates.map((rate) => [rate.id, rate.rate])), [taxRates]);

  // Preserve in-progress data across a Combobox "+ New" round-trip (create only).
  const { clearDraft } = useFormDraft(
    "qf-draft:bill",
    { contactId, billNumber, reference, orderNumber, warehouseId, issueDate, dueDate, paymentTerms, apAccountId, subject, notes, tds, lines },
    (d) => {
      if (d.contactId !== undefined) setContactId(d.contactId);
      if (d.billNumber !== undefined) setBillNumber(d.billNumber);
      if (d.reference !== undefined) setReference(d.reference);
      if (d.orderNumber !== undefined) setOrderNumber(d.orderNumber);
      if (d.warehouseId !== undefined) setWarehouseId(d.warehouseId);
      if (d.issueDate !== undefined) setIssueDate(d.issueDate);
      if (d.dueDate !== undefined) setDueDate(d.dueDate);
      if (d.paymentTerms !== undefined) setPaymentTerms(d.paymentTerms);
      if (d.apAccountId !== undefined) setApAccountId(d.apAccountId);
      if (d.subject !== undefined) setSubject(d.subject);
      if (d.notes !== undefined) setNotes(d.notes);
      if (d.tds !== undefined) setTds(d.tds);
      if (Array.isArray(d.lines) && d.lines.length) setLines(d.lines);
    },
    { enabled: !isEdit && !cloneId }
  );

  // Payment terms drive the due date (Zoho behaviour).
  const applyTerms = (term: string) => {
    setPaymentTerms(term);
    if (term in PAYMENT_TERMS) {
      const d = new Date(issueDate);
      d.setDate(d.getDate() + PAYMENT_TERMS[term]);
      setDueDate(d.toISOString().slice(0, 10));
    }
  };

  const totals = useMemo(() => {
    let subtotal = 0, discountTotal = 0, taxTotal = 0;
    const computed = lines.map((line) => {
      const gross = round2(Number(line.quantity || 0) * Number(line.rate || 0));
      const discount = round2(Number(line.discount || 0));
      const net = round2(gross - discount);
      const percent = line.tax_rate_id ? rateById.get(line.tax_rate_id) ?? 0 : 0;
      const tax = round2((net * percent) / 100);
      subtotal = round2(subtotal + gross); discountTotal = round2(discountTotal + discount); taxTotal = round2(taxTotal + tax);
      return { total: round2(net + tax) };
    });
    return { computed, subtotal, discountTotal, taxTotal, total: round2(subtotal - discountTotal + taxTotal) };
  }, [lines, rateById]);

  const updateLine = (index: number, patch: Partial<LineRow>) =>
    setLines((current) => current.map((line, position) => (position === index ? { ...line, ...patch } : line)));
  const addLine = () => setLines((current) => [...current, emptyLine()]);
  const removeLine = (index: number) => setLines((current) => (current.length === 1 ? current : current.filter((_, position) => position !== index)));

  const save = async (nextStatus: string) => {
    if (!contactId) { toast.error(t("billForm.selectVendor", "Select a vendor.")); return; }
    if (!billNumber.trim()) { toast.error("Enter a bill number."); return; }
    const validLines = lines.filter((line) => (line.description.trim() !== "" || line.item_id) && Number(line.quantity) > 0);
    if (validLines.length === 0) { toast.error(t("billForm.addLine", "Add at least one line item.")); return; }

    const payload = {
      contact_id: contactId,
      bill_number: nextNum.numberToSubmit(billNumber),
      vendor_reference: reference.trim() || null,
      order_number: orderNumber.trim() || null,
      warehouse_id: warehouseId || null,
      issue_date: issueDate,
      due_date: dueDate,
      payment_terms: paymentTerms || null,
      ap_account_id: apAccountId || null,
      subject: subject.trim() || null,
      status: nextStatus,
      currency: orgCurrency,
      notes: notes || null,
      subtotal: totals.subtotal,
      discount_total: totals.discountTotal,
      tax_total: totals.taxTotal,
      total: totals.total,
      balance_due: totals.total,
      tds_amount: Number(tds) || 0,
      line_items: validLines.map((line) => ({
        description: (line.description.trim() || itemsById.get(line.item_id)?.name) ?? "",
        quantity: Number(line.quantity), rate: Number(line.rate), discount: Number(line.discount || 0),
        tax_rate_id: line.tax_rate_id || null, account_id: line.account_id || null, item_id: line.item_id || null
      })),
      attachments: attachments.map((a) => ({ id: a.id, file_name: a.file_name, content_type: a.content_type, size_bytes: a.size_bytes, data: a.data }))
    };

    setSubmitting(true);
    try {
      const response = await fetch(isEdit ? `/api/v1/bills/${billId}` : "/api/v1/bills", {
        method: isEdit ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        toast.error(body?.error?.message ?? t("billForm.saveFailed", "Could not save the bill."));
        return;
      }
      const saved = (await response.json()) as { data?: { id?: string } };
      toast.success(isEdit ? t("billForm.updated", "Bill updated.") : nextStatus === "draft" ? "Bill saved as draft." : "Bill saved.");
      clearDraft();
      const id = saved?.data?.id ?? billId;
      router.push(id ? `/bills/${id}` : "/bills");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader title={isEdit ? t("billForm.editTitle", "Edit Bill") : t("billForm.newTitle", "New Bill")} description={t("billForm.desc", "Line items post Dr Expense / Dr Input Tax / Cr Accounts Payable.")} />

      <Card>
        <CardHeader><CardTitle>{t("billForm.details", "Details")}</CardTitle></CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-2">
          <div>
            <Label className="text-destructive">{t("billForm.vendor", "Vendor Name")}*</Label>
            <div className="mt-2">
              <Combobox value={contactId} placeholder={t("common.select", "Select or add a vendor")} searchPlaceholder="Search vendors…" createHref="/vendors/new" createLabel="New Vendor"
                onChange={(val) => {
                  setContactId(val);
                  const v = vendorById.get(val);
                  if (v?.ap_account_id) setApAccountId(v.ap_account_id);
                }} options={vendors.map((vendor) => ({ value: vendor.id, label: vendor.label }))} />
            </div>
            {selectedVendor && addrLines(selectedVendor.billing_address).length > 0 ? (
              <div className="mt-2 text-xs text-muted-foreground">
                <p className="font-medium uppercase tracking-wide">Billing Address</p>
                {addrLines(selectedVendor.billing_address).map((l, i) => <p key={i}>{l}</p>)}
              </div>
            ) : null}
          </div>
          <div>
            <Label>{t("billForm.location", "Location")}</Label>
            <div className="mt-2">
              <Combobox value={warehouseId} placeholder="Select a location" searchPlaceholder="Search locations…" onChange={setWarehouseId} options={warehouses.map((w) => ({ value: w.id, label: w.label }))} />
            </div>
          </div>
          <div>
            <Label className="text-destructive">{t("billForm.billNumber", "Bill#")}*</Label>
            <Input className="mt-2" value={billNumber} onChange={(e) => setBillNumber(e.target.value)} placeholder="e.g. BILL-00001" />
          </div>
          <div>
            <Label>{t("billForm.orderNumber", "Order Number")}</Label>
            <Input className="mt-2" value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} />
          </div>
          <div>
            <Label>{t("billForm.reference", "Reference#")}</Label>
            <Input className="mt-2" value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>
          <div>
            <Label className="text-destructive">{t("billForm.issueDate", "Bill Date")}*</Label>
            <Input id="issue" type="date" className="mt-2" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
          </div>
          <div>
            <Label>{t("billForm.paymentTerms", "Payment Terms")}</Label>
            <select className={`${selectClass} mt-2`} value={paymentTerms} onChange={(e) => applyTerms(e.target.value)}>
              {Object.keys(PAYMENT_TERMS).map((term) => <option key={term} value={term}>{term}</option>)}
            </select>
          </div>
          <div>
            <Label>{t("billForm.dueDate", "Due Date")}</Label>
            <Input id="due" type="date" className="mt-2" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div>
            <Label>{t("billForm.ap", "Accounts Payable")}</Label>
            <div className="mt-2">
              <Combobox value={apAccountId} placeholder="Accounts Payable" searchPlaceholder="Search accounts…" onChange={setApAccountId} options={apAccounts.map((a) => ({ value: a.id, label: a.label }))} />
            </div>
          </div>
          <div className="md:col-span-2">
            <Label>{t("billForm.subject", "Subject")}</Label>
            <Input className="mt-2" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Enter a subject within 250 characters" maxLength={250} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t("billForm.lineItems", "Item Table")}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {lines.map((line, index) => (
            <div key={index} className="grid gap-2 md:grid-cols-[150px_1fr_150px_70px_90px_120px_90px_90px_40px] md:items-center">
              <Combobox value={line.item_id} placeholder={t("billForm.noItem", "Select an item")} searchPlaceholder="Search items…" createHref="/inventory/new" createLabel="New Item"
                onChange={(val) => { const selected = itemsById.get(val); updateLine(index, selected ? { item_id: selected.id, description: selected.name, rate: String(selected.purchase_price) } : { item_id: "" }); }}
                options={items.map((item) => ({ value: item.id, label: item.name }))} />
              <Input placeholder={t("billForm.description", "Description")} value={line.description} onChange={(e) => updateLine(index, { description: e.target.value })} />
              <Combobox value={line.account_id} placeholder={t("billForm.expenseAccount", "Expense account")} searchPlaceholder="Search accounts…"
                onChange={(val) => updateLine(index, { account_id: val })} options={expenseAccounts.map((account) => ({ value: account.id, label: account.label }))} />
              <Input type="number" min="0" step="0.01" value={line.quantity} onChange={(e) => updateLine(index, { quantity: e.target.value })} />
              <Input type="number" min="0" step="0.01" value={line.rate} onChange={(e) => updateLine(index, { rate: e.target.value })} />
              <Combobox value={line.tax_rate_id} placeholder={t("billForm.noTax", "No tax")} searchPlaceholder="Search taxes…"
                onChange={(val) => updateLine(index, { tax_rate_id: val })} options={taxRates.map((rate) => ({ value: rate.id, label: rate.name }))} />
              <Input type="number" min="0" step="0.01" value={line.discount} onChange={(e) => updateLine(index, { discount: e.target.value })} />
              <span className="text-right text-sm tabular-nums">{formatMoney(totals.computed[index]?.total ?? 0)}</span>
              <Button type="button" variant="ghost" size="sm" aria-label={t("common.remove", "Remove")} onClick={() => removeLine(index)}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
          <Button type="button" variant="secondary" size="sm" onClick={addLine}><Plus className="mr-2 h-4 w-4" />{t("billForm.addLine", "Add New Row")}</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t("billForm.attachments", "Attachments")}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground hover:bg-muted">
            <Paperclip className="h-4 w-4" />
            <span>Attach files (max 10 MB each)</span>
            <input type="file" multiple className="hidden" onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
          </label>
          {attachments.length ? (
            <ul className="divide-y rounded-md border">
              {attachments.map((a, i) => (
                <li key={a.id ?? `new-${i}`} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="flex items-center gap-2 truncate"><Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" /><span className="truncate">{a.file_name}</span><span className="shrink-0 text-xs text-muted-foreground">{humanSize(a.size_bytes)}</span></span>
                  <Button type="button" variant="ghost" size="sm" aria-label="Remove attachment" onClick={() => removeAttachment(i)}><Trash2 className="h-4 w-4" /></Button>
                </li>
              ))}
            </ul>
          ) : <p className="text-xs text-muted-foreground">No attachments yet.</p>}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader><CardTitle>{t("billForm.notes", "Notes")}</CardTitle></CardHeader>
          <CardContent><Textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t("billForm.summary", "Summary")}</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">{t("billForm.subtotal", "Subtotal")}</span><span className="tabular-nums">{formatMoney(totals.subtotal)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">{t("billForm.discount", "Discount")}</span><span className="tabular-nums">−{formatMoney(totals.discountTotal)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">{t("billForm.tax", "Input tax")}</span><span className="tabular-nums">{formatMoney(totals.taxTotal)}</span></div>
            <div className="flex items-center justify-between border-t pt-2 text-base font-bold"><span>{t("billForm.total", "Total")} ( {orgCurrency} )</span><span className="tabular-nums">{formatMoney(totals.total)}</span></div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">{t("billForm.tds", "TDS withheld")}</span>
              <Input type="number" min="0" step="0.01" className="h-8 w-28 text-right" value={tds} onChange={(e) => setTds(e.target.value)} />
            </div>
            <div className="flex justify-between text-sm font-semibold"><span>{t("billForm.netPayable", "Net payable")}</span><span className="tabular-nums">{formatMoney(Math.max(0, totals.total - (Number(tds) || 0)))}</span></div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-2">
        {(!isEdit || status === "draft") ? (
          <Button type="button" variant="secondary" onClick={() => save("draft")} disabled={submitting}>{t("billForm.saveDraft", "Save as Draft")}</Button>
        ) : null}
        <Button type="button" onClick={() => save(isEdit && status !== "draft" ? status : "open")} disabled={submitting}>{submitting ? t("common.saving", "Saving…") : t("billForm.save", "Save")}</Button>
        <Button type="button" variant="ghost" onClick={() => router.push("/bills")}>{t("common.cancel", "Cancel")}</Button>
      </div>
    </div>
  );
}
