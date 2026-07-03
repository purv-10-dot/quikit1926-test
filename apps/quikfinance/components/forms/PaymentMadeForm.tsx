"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Paperclip, Trash2 } from "lucide-react";
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
import { todayISO } from "@/lib/utils/dates";

type Option = { id: string; label: string };
type OpenBill = { id: string; bill_number: string; balance_due: number; date: string; total: number; location: string };
type Attachment = { id?: string; file_name: string; content_type?: string | null; size_bytes: number; data?: string };

const selectClass = "h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";
const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const PAYMENT_MODES = ["Cash", "Bank Transfer", "Cheque", "Credit Card", "UPI", "Other"];
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const humanSize = (b: number) => (b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);

async function fetchList(path: string): Promise<Array<Record<string, unknown>>> {
  const response = await fetch(path);
  if (!response.ok) return [];
  const payload = (await response.json()) as { data?: unknown };
  return Array.isArray(payload.data) ? (payload.data as Array<Record<string, unknown>>) : [];
}

export function PaymentMadeForm({ paymentId }: { paymentId?: string } = {}) {
  const router = useRouter();
  const { t } = useI18n();
  const { currency: orgCurrency } = useCurrency();
  const isEdit = Boolean(paymentId);

  const [contactId, setContactId] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [paymentNumber, setPaymentNumber] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(todayISO());
  const [method, setMethod] = useState("Cash");
  const [paymentAccountId, setPaymentAccountId] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [existingAllocs, setExistingAllocs] = useState<Record<string, number>>({});
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const { data: vendors = [] } = useQuery({ queryKey: ["paymade-vendors"], staleTime: 0, queryFn: async () => (await fetchList("/api/v1/vendors?per_page=200")).map((r) => ({ id: String(r.id), label: String(r.display_name ?? "Vendor") }) as Option) });
  const { data: warehouses = [] } = useQuery({ queryKey: ["paymade-warehouses"], queryFn: async () => (await fetchList("/api/v1/warehouses?per_page=200")).map((r) => ({ id: String(r.id), label: String(r.name ?? "") }) as Option) });
  const { data: bankAccounts = [] } = useQuery({ queryKey: ["paymade-bank-accounts"], queryFn: async () => (await fetchList("/api/v1/accounts?per_page=200")).filter((r) => ["bank", "cash"].includes(String(r.account_type))).map((r) => ({ id: String(r.id), label: `${r.code} · ${r.name}` }) as Option) });
  const { data: openBills = [] } = useQuery({
    queryKey: ["paymade-open-bills", contactId],
    queryFn: async () => (await fetchList("/api/v1/bills?per_page=200"))
      .filter((r) => String(r.contact_id) === contactId)
      .map((r) => ({ id: String(r.id), bill_number: String(r.bill_number ?? ""), balance_due: Number(r.balance_due ?? 0), date: String(r.date ?? r.issue_date ?? "").slice(0, 10), total: Number(r.total ?? 0), location: String(r.location ?? "") }) as OpenBill),
    enabled: Boolean(contactId)
  });

  const nextNum = useNextNumber("payment-made", !isEdit);
  useEffect(() => { if (!isEdit && nextNum.preview) setPaymentNumber((cur) => cur || nextNum.preview || ""); }, [nextNum.preview, isEdit]);

  // Edit: hydrate from the receipt endpoint (includes bill_allocations + attachments).
  const { data: existing } = useQuery({
    queryKey: ["payment-made-edit", paymentId],
    enabled: isEdit,
    queryFn: async () => { const r = await fetch(`/api/v1/payments/${paymentId}/receipt`); return r.ok ? ((await r.json()).data as Record<string, unknown>) : null; }
  });
  useEffect(() => {
    if (!existing) return;
    setContactId(String(existing.contact_id ?? ""));
    setWarehouseId(existing.warehouse_id ? String(existing.warehouse_id) : "");
    setPaymentNumber(String(existing.payment_number ?? ""));
    setPaymentAmount(String(existing.amount ?? ""));
    setPaymentDate(String(existing.payment_date ?? todayISO()).slice(0, 10));
    setMethod(String(existing.method ?? "Cash"));
    setPaymentAccountId(existing.deposit_account_id ? String(existing.deposit_account_id) : "");
    setReference(String(existing.reference ?? ""));
    setNotes(String(existing.memo ?? ""));
    const ba = Array.isArray(existing.bill_allocations) ? (existing.bill_allocations as Array<Record<string, unknown>>) : [];
    const map: Record<string, string> = {}; const orig: Record<string, number> = {};
    ba.forEach((a) => { map[String(a.bill_id)] = String(a.amount); orig[String(a.bill_id)] = Number(a.amount); });
    setAllocations(map); setExistingAllocs(orig);
    const atts = Array.isArray(existing.attachments) ? (existing.attachments as Array<Record<string, unknown>>) : [];
    setAttachments(atts.map((a) => ({ id: String(a.id), file_name: String(a.file_name ?? "file"), content_type: a.content_type ? String(a.content_type) : null, size_bytes: Number(a.size_bytes ?? 0) })));
  }, [existing]);

  // Reset allocations when the vendor changes (skip during draft restore / edit hydrate).
  const skipReset = useRef(false);
  useEffect(() => { if (skipReset.current) { skipReset.current = false; return; } if (!isEdit) setAllocations({}); }, [contactId, isEdit]);

  const { clearDraft } = useFormDraft(
    "qf-draft:payment-made",
    { contactId, warehouseId, paymentNumber, paymentAmount, paymentDate, method, paymentAccountId, reference, notes, allocations },
    (d) => {
      if (d.contactId) skipReset.current = true;
      if (d.contactId !== undefined) setContactId(d.contactId);
      if (d.warehouseId !== undefined) setWarehouseId(d.warehouseId);
      if (d.paymentNumber !== undefined) setPaymentNumber(d.paymentNumber);
      if (d.paymentAmount !== undefined) setPaymentAmount(d.paymentAmount);
      if (d.paymentDate !== undefined) setPaymentDate(d.paymentDate);
      if (d.method !== undefined) setMethod(d.method);
      if (d.paymentAccountId !== undefined) setPaymentAccountId(d.paymentAccountId);
      if (d.reference !== undefined) setReference(d.reference);
      if (d.notes !== undefined) setNotes(d.notes);
      if (d.allocations && typeof d.allocations === "object") setAllocations(d.allocations);
    },
    { enabled: !isEdit }
  );

  const availableFor = (b: OpenBill) => round2(b.balance_due + (existingAllocs[b.id] ?? 0));
  const visibleBills = useMemo(() => openBills.filter((b) => availableFor(b) > 0), [openBills, existingAllocs]);
  const totalAllocated = useMemo(() => round2(Object.values(allocations).reduce((sum, v) => sum + Number(v || 0), 0)), [allocations]);
  const amountPaid = paymentAmount.trim() === "" ? totalAllocated : round2(Number(paymentAmount) || 0);
  const excess = round2(amountPaid - totalAllocated);

  const onFiles = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach((file) => {
      if (file.size > MAX_ATTACHMENT_BYTES) { toast.error(`${file.name} exceeds 10 MB.`); return; }
      const reader = new FileReader();
      reader.onload = () => setAttachments((cur) => [...cur, { file_name: file.name, content_type: file.type || null, size_bytes: file.size, data: String(reader.result) }]);
      reader.readAsDataURL(file);
    });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!contactId || !paymentAccountId) { toast.error(t("payMade.required", "Select a vendor and a payment account.")); return; }
    const allocationList = visibleBills.map((bill) => ({ bill_id: bill.id, amount: round2(Number(allocations[bill.id] || 0)) })).filter((a) => a.amount > 0);
    if (allocationList.length === 0) { toast.error(t("payMade.allocate", "Allocate the payment to at least one bill.")); return; }

    setSubmitting(true);
    try {
      const payload = {
        contact_id: contactId, warehouse_id: warehouseId || null, payment_number: nextNum.numberToSubmit(paymentNumber),
        payment_date: paymentDate, amount: amountPaid, method, reference: reference || null, currency: orgCurrency,
        payment_account_id: paymentAccountId, memo: notes || null, allocations: allocationList,
        attachments: attachments.map((a) => ({ id: a.id, file_name: a.file_name, content_type: a.content_type, size_bytes: a.size_bytes, data: a.data }))
      };
      const response = await fetch(isEdit ? `/api/v1/payments/made?id=${paymentId}` : "/api/v1/payments/made", {
        method: isEdit ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        toast.error(body?.error?.message ?? t("payMade.failed", "Could not record the payment."));
        return;
      }
      const saved = (await response.json()) as { data?: { id?: string } };
      toast.success(isEdit ? "Payment updated." : t("payMade.recorded", "Payment recorded and posted."));
      clearDraft();
      const id = saved?.data?.id ?? paymentId;
      router.push(id ? `/payments/made/${id}` : "/payments/made");
    } finally { setSubmitting(false); }
  };

  return (
    <form onSubmit={submit} className="space-y-6 animate-fade-up">
      <PageHeader title={isEdit ? t("payMade.editTitle", "Edit Payment") : t("payMade.title", "New Payment")} description={t("payMade.desc", "Allocates to open bills and posts Dr Accounts Payable / Cr Bank.")} />

      <Card>
        <CardHeader><CardTitle>{t("payMade.details", "Details")}</CardTitle></CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-2">
          <div>
            <Label className="text-destructive">{t("payMade.vendor", "Vendor Name")}*</Label>
            <div className="mt-2"><Combobox value={contactId} placeholder={t("common.select", "Select…")} searchPlaceholder="Search vendors…" createHref="/vendors/new" createLabel="New Vendor" onChange={setContactId} options={vendors.map((v) => ({ value: v.id, label: v.label }))} /></div>
          </div>
          <div>
            <Label>{t("payMade.location", "Location")}</Label>
            <div className="mt-2"><Combobox value={warehouseId} placeholder="Select a location" searchPlaceholder="Search locations…" onChange={setWarehouseId} options={warehouses.map((w) => ({ value: w.id, label: w.label }))} /></div>
          </div>
          <div>
            <Label className="text-destructive">{t("payMade.number", "Payment#")}*</Label>
            <Input className="mt-2" value={paymentNumber} onChange={(e) => setPaymentNumber(e.target.value)} placeholder="e.g. PM-00001" />
          </div>
          <div>
            <Label className="text-destructive">{t("payMade.amount", "Payment Made")}*</Label>
            <div className="mt-2 flex">
              <span className="inline-flex items-center rounded-l-md border border-r-0 bg-muted px-3 text-sm text-muted-foreground">{orgCurrency}</span>
              <Input type="number" min="0" step="0.01" className="rounded-l-none" value={paymentAmount} placeholder={String(totalAllocated)} onChange={(e) => setPaymentAmount(e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-destructive">{t("payMade.date", "Payment Date")}*</Label>
            <Input id="date" type="date" className="mt-2" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
          </div>
          <div>
            <Label>{t("payMade.mode", "Payment Mode")}</Label>
            <select className={`${selectClass} mt-2`} value={method} onChange={(e) => setMethod(e.target.value)}>
              {PAYMENT_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <Label className="text-destructive">{t("payMade.paidThrough", "Paid Through")}*</Label>
            <div className="mt-2"><Combobox value={paymentAccountId} placeholder={t("common.select", "Select…")} searchPlaceholder="Search accounts…" onChange={setPaymentAccountId} options={bankAccounts.map((a) => ({ value: a.id, label: a.label }))} /></div>
          </div>
          <div>
            <Label>{t("payMade.reference", "Reference#")}</Label>
            <Input className="mt-2" value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          {!contactId ? (
            <p className="text-sm text-muted-foreground">{t("payMade.pickVendor", "Select a vendor to see their open bills.")}</p>
          ) : visibleBills.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("payMade.noOpen", "No open bills for this vendor.")}</p>
          ) : (
            <>
              <div className="mb-2 flex justify-end">
                <button type="button" className="text-sm text-primary hover:underline" onClick={() => setAllocations({})}>Clear Applied Amount</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="border-b text-xs font-semibold uppercase text-muted-foreground">
                    <tr>
                      <th className="px-2 py-2 text-left">Date</th>
                      <th className="px-2 py-2 text-left">Bill#</th>
                      <th className="px-2 py-2 text-left">PO#</th>
                      <th className="px-2 py-2 text-left">Location</th>
                      <th className="px-2 py-2 text-right">Bill Amount</th>
                      <th className="px-2 py-2 text-right">Amount Due</th>
                      <th className="px-2 py-2 text-left">Payment Made on</th>
                      <th className="px-2 py-2 text-right">Payment</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {visibleBills.map((bill) => (
                      <tr key={bill.id}>
                        <td className="px-2 py-2">{bill.date || "—"}</td>
                        <td className="px-2 py-2 font-medium">{bill.bill_number}</td>
                        <td className="px-2 py-2 text-muted-foreground">--</td>
                        <td className="px-2 py-2 text-muted-foreground">{bill.location || "--"}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{formatMoney(bill.total)}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{formatMoney(availableFor(bill))}</td>
                        <td className="px-2 py-2 text-muted-foreground">{paymentDate}</td>
                        <td className="px-2 py-2 text-right"><Input type="number" min="0" step="0.01" max={availableFor(bill)} placeholder="0.00" className="h-9 w-28 text-right" value={allocations[bill.id] ?? ""} onChange={(e) => setAllocations((c) => ({ ...c, [bill.id]: e.target.value }))} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-2 flex justify-end gap-6 border-t pt-2 text-sm font-bold"><span>Total :</span><span className="tabular-nums">{formatMoney(totalAllocated)}</span></div>
            </>
          )}
          <div className="mt-4 ml-auto max-w-sm space-y-1 rounded-md bg-amber-50 p-4 text-sm dark:bg-amber-950/30">
            <div className="flex justify-between"><span className="text-muted-foreground">Amount Paid</span><span className="tabular-nums">{formatMoney(amountPaid)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Amount used for Payments</span><span className="tabular-nums">{formatMoney(totalAllocated)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Amount Refunded</span><span className="tabular-nums">{formatMoney(0)}</span></div>
            <div className="flex items-center justify-between gap-2"><span className="text-muted-foreground">⚠ Amount in Excess</span><span className="tabular-nums font-semibold">{formatMoney(Math.max(0, excess))}</span></div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>{t("payMade.notes", "Notes")}</CardTitle></CardHeader>
          <CardContent><Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Internal use. Not visible to vendor." /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>{t("payMade.attachments", "Attachments")}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground hover:bg-muted">
              <Paperclip className="h-4 w-4" /><span>Upload File (max 10 MB each)</span>
              <input type="file" multiple className="hidden" onChange={(e) => { onFiles(e.target.files); e.target.value = ""; }} />
            </label>
            {attachments.length ? (
              <ul className="divide-y rounded-md border">
                {attachments.map((a, i) => (
                  <li key={a.id ?? `new-${i}`} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span className="flex items-center gap-2 truncate"><Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" /><span className="truncate">{a.file_name}</span><span className="shrink-0 text-xs text-muted-foreground">{humanSize(a.size_bytes)}</span></span>
                    <Button type="button" variant="ghost" size="sm" aria-label="Remove" onClick={() => setAttachments((c) => c.filter((_, idx) => idx !== i))}><Trash2 className="h-4 w-4" /></Button>
                  </li>
                ))}
              </ul>
            ) : <p className="text-xs text-muted-foreground">No attachments yet.</p>}
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={() => router.push("/payments/made")}>{t("common.cancel", "Cancel")}</Button>
        <Button type="submit" disabled={submitting || totalAllocated <= 0}>{submitting ? t("common.saving", "Saving…") : t("payMade.save", "Save")}</Button>
      </div>
    </form>
  );
}
