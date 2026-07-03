"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Combobox } from "@/components/ui/combobox";
import { useFormDraft } from "@/lib/hooks/use-form-draft";
import { PageHeader } from "@/components/shared/PageHeader";
import { useI18n } from "@/lib/i18n";
import { useCurrency } from "@/lib/currency";
import { formatMoney } from "@/lib/utils/currency";
import { todayISO } from "@/lib/utils/dates";

type Option = { id: string; label: string; currency?: string };
type OpenInvoice = { id: string; invoice_number: string; balance_due: number };

const selectClass = "h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";
const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

async function fetchList(path: string): Promise<Array<Record<string, unknown>>> {
  const response = await fetch(path);
  if (!response.ok) return [];
  const payload = (await response.json()) as { data?: unknown };
  return Array.isArray(payload.data) ? (payload.data as Array<Record<string, unknown>>) : [];
}

export function PaymentReceivedForm({ paymentId }: { paymentId?: string } = {}) {
  const router = useRouter();
  const { t } = useI18n();
  const { currency: orgCurrency } = useCurrency();
  const isEdit = Boolean(paymentId);

  const [contactId, setContactId] = useState("");
  const [paymentDate, setPaymentDate] = useState(todayISO());
  const [depositAccountId, setDepositAccountId] = useState("");
  const [method, setMethod] = useState("Bank Transfer");
  const [reference, setReference] = useState("");
  const [bankCharges, setBankCharges] = useState("0");
  const [tdsAmount, setTdsAmount] = useState("0");
  const [exchangeRate, setExchangeRate] = useState("1");
  const [allocations, setAllocations] = useState<Record<string, string>>({});
  const [amountReceived, setAmountReceived] = useState("");
  const [useAdvance, setUseAdvance] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Edit mode: load the existing payment and prefill (allocations applied after invoices load).
  const { data: existing } = useQuery({
    queryKey: ["payment-edit", paymentId],
    queryFn: async () => {
      const r = await fetch(`/api/v1/payments/${paymentId}/receipt`);
      return r.ok ? ((await r.json()).data as Record<string, unknown>) : null;
    },
    enabled: isEdit
  });
  useEffect(() => {
    if (!existing) return;
    setContactId(String(existing.contact_id ?? ""));
    setPaymentDate(String(existing.payment_date ?? todayISO()).slice(0, 10));
    setDepositAccountId(existing.deposit_account_id ? String(existing.deposit_account_id) : "");
    setMethod(String(existing.method ?? "Bank Transfer"));
    setReference(String(existing.reference ?? ""));
    setBankCharges(String(existing.bank_charges ?? "0"));
    setTdsAmount(String(existing.tds_amount ?? "0"));
    setExchangeRate(String(existing.exchange_rate ?? "1"));
    setAmountReceived(String(existing.amount ?? ""));
    const allocs = Array.isArray(existing.allocations) ? (existing.allocations as Array<Record<string, unknown>>) : [];
    const map: Record<string, string> = {};
    allocs.forEach((a) => { map[String(a.invoice_id)] = String(a.amount); });
    setAllocations(map);
  }, [existing]);

  const { data: customers = [] } = useQuery({
    queryKey: ["pay-customers"],
    staleTime: 0,
    queryFn: async () =>
      (await fetchList("/api/v1/customers?per_page=100")).map((row) => ({ id: String(row.id), label: String(row.display_name ?? "Customer"), currency: String(row.currency ?? "") }) as Option)
  });

  // The payment is taken in the customer's currency; convert to the company base via the rate entered here.
  const selectedCustomer = customers.find((c) => c.id === contactId);
  const custCurrency = (selectedCustomer?.currency || orgCurrency).toUpperCase();
  const isForeign = custCurrency !== orgCurrency.toUpperCase();
  const rate = isForeign ? Number(exchangeRate) || 0 : 1;
  const { data: bankAccounts = [] } = useQuery({
    queryKey: ["pay-bank-accounts"],
    queryFn: async () =>
      (await fetchList("/api/v1/accounts?per_page=200"))
        .filter((row) => ["bank", "cash"].includes(String(row.account_type)))
        .map((row) => ({ id: String(row.id), label: `${row.code} · ${row.name}` }) as Option)
  });

  // Open invoices for the selected customer.
  const { data: openInvoices = [] } = useQuery({
    queryKey: ["pay-open-invoices", contactId],
    queryFn: async () => {
      const rows = await fetchList("/api/v1/invoices?per_page=100");
      return rows
        .filter((row) => String(row.contact_id) === contactId && Number(row.balance_due ?? 0) > 0)
        .map((row) => ({ id: String(row.id), invoice_number: String(row.invoice_number ?? ""), balance_due: Number(row.balance_due ?? 0) }) as OpenInvoice);
    },
    enabled: Boolean(contactId)
  });

  // Reset allocations when the user changes the customer (but not on initial prefill).
  const prevContact = useRef<string | null>(null);
  useEffect(() => {
    if (prevContact.current !== null && prevContact.current !== contactId) { setAllocations({}); setExchangeRate("1"); }
    prevContact.current = contactId;
  }, [contactId]);

  // Preserve in-progress data across a Combobox "+ New" round-trip (create only).
  const { clearDraft } = useFormDraft(
    "qf-draft:payment-received",
    { contactId, paymentDate, depositAccountId, method, reference, bankCharges, tdsAmount, allocations, amountReceived, useAdvance },
    (d) => {
      // Pre-seed prevContact so restoring the customer doesn't wipe restored allocations.
      prevContact.current = d.contactId ?? null;
      if (d.contactId !== undefined) setContactId(d.contactId);
      if (d.paymentDate !== undefined) setPaymentDate(d.paymentDate);
      if (d.depositAccountId !== undefined) setDepositAccountId(d.depositAccountId);
      if (d.method !== undefined) setMethod(d.method);
      if (d.reference !== undefined) setReference(d.reference);
      if (d.bankCharges !== undefined) setBankCharges(d.bankCharges);
      if (d.tdsAmount !== undefined) setTdsAmount(d.tdsAmount);
      if (d.allocations && typeof d.allocations === "object") setAllocations(d.allocations);
      if (d.amountReceived !== undefined) setAmountReceived(d.amountReceived);
      if (d.useAdvance !== undefined) setUseAdvance(d.useAdvance);
    },
    { enabled: !isEdit }
  );

  const totalAllocated = useMemo(
    () => round2(Object.values(allocations).reduce((sum, value) => sum + Number(value || 0), 0)),
    [allocations]
  );

  // Amount received defaults to the allocated total; any excess becomes a customer advance.
  const cashReceived = amountReceived === "" ? totalAllocated : round2(Number(amountReceived) || 0);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!contactId) {
      toast.error(t("paymentForm.customerReq", "Select a customer."));
      return;
    }
    if (!useAdvance && !depositAccountId) {
      toast.error(t("paymentForm.required", "Select a deposit account."));
      return;
    }
    const allocationList = openInvoices
      .map((invoice) => ({ invoice_id: invoice.id, amount: round2(Number(allocations[invoice.id] || 0)) }))
      .filter((allocation) => allocation.amount > 0);
    if (useAdvance && allocationList.length === 0) {
      toast.error(t("paymentForm.allocate", "Allocate the payment to at least one invoice."));
      return;
    }
    if (!useAdvance && allocationList.length === 0 && cashReceived <= 0) {
      toast.error(t("paymentForm.amountOrAlloc", "Enter an amount received or allocate to an invoice."));
      return;
    }
    if (isForeign && rate <= 0) {
      toast.error(`Enter the exchange rate (1 ${custCurrency} = ? ${orgCurrency}).`);
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(isEdit ? `/api/v1/payments/received?id=${paymentId}` : "/api/v1/payments/received", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact_id: contactId,
          payment_date: paymentDate,
          amount: useAdvance ? totalAllocated : cashReceived,
          method,
          reference: reference || null,
          currency: custCurrency,
          exchange_rate: rate || 1,
          source: useAdvance ? "advance" : "bank",
          deposit_account_id: useAdvance ? null : depositAccountId,
          bank_charges: useAdvance ? 0 : round2(Number(bankCharges) || 0),
          tds_amount: useAdvance ? 0 : round2(Number(tdsAmount) || 0),
          allocations: allocationList
        })
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        toast.error(body?.error?.message ?? t("paymentForm.failed", "Could not record the payment."));
        return;
      }
      toast.success(isEdit ? "Payment updated." : t("paymentForm.recorded", "Payment recorded and posted."));
      clearDraft();
      router.push(isEdit && paymentId ? `/payments/received/${paymentId}` : "/payments/received");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-6 animate-fade-up">
      <PageHeader title={t("paymentForm.title", "Record payment received")} description={t("paymentForm.desc", "Allocates to open invoices and posts Dr Bank / Cr Accounts Receivable.")} />

      <Card>
        <CardHeader>
          <CardTitle>{t("paymentForm.details", "Details")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-2">
          <div>
            <Label htmlFor="contact">{t("paymentForm.customer", "Customer")}</Label>
            <div className="mt-2">
              <Combobox id="contact" value={contactId} placeholder={t("common.select", "Select…")} searchPlaceholder="Search customers…" createHref="/customers/new" createLabel="New Customer"
                onChange={(val) => setContactId(val)} options={customers.map((customer) => ({ value: customer.id, label: customer.label }))} />
            </div>
          </div>
          <div>
            <Label htmlFor="deposit">{t("paymentForm.depositTo", "Deposit to")}</Label>
            <div className="mt-2">
              <Combobox id="deposit" value={depositAccountId} placeholder={t("common.select", "Select…")} searchPlaceholder="Search accounts…"
                onChange={(val) => setDepositAccountId(val)} options={bankAccounts.map((account) => ({ value: account.id, label: account.label }))} />
            </div>
          </div>
          <div>
            <Label htmlFor="date">{t("paymentForm.date", "Payment date")}</Label>
            <Input id="date" type="date" className="mt-2" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} />
          </div>
          <div>
            <Label htmlFor="method">{t("paymentForm.method", "Method")}</Label>
            <Input id="method" className="mt-2" value={method} onChange={(event) => setMethod(event.target.value)} />
          </div>
          <div>
            <Label htmlFor="reference">{t("paymentForm.reference", "Reference")}</Label>
            <Input id="reference" className="mt-2" value={reference} onChange={(event) => setReference(event.target.value)} />
          </div>
          {isForeign ? (
            <div>
              <Label htmlFor="fx">Exchange rate (1 {custCurrency} = ? {orgCurrency})</Label>
              <Input id="fx" type="number" min="0" step="0.0001" className="mt-2" value={exchangeRate} onChange={(event) => setExchangeRate(event.target.value)} />
              <p className="mt-1 text-xs text-muted-foreground">Amounts are entered in {custCurrency}; the ledger posts {orgCurrency}{rate > 0 ? ` (≈ ${orgCurrency} ${(cashReceived * rate).toFixed(2)})` : ""}.</p>
            </div>
          ) : null}
          {!useAdvance ? (
            <>
              <div>
                <Label htmlFor="bankCharges">{t("paymentForm.bankCharges", "Bank charges (if any)")}</Label>
                <Input id="bankCharges" type="number" min="0" step="0.01" className="mt-2" value={bankCharges} onChange={(event) => setBankCharges(event.target.value)} />
              </div>
              <div>
                <Label htmlFor="tds">{t("paymentForm.tds", "TDS deducted (Income Tax)")}</Label>
                <Input id="tds" type="number" min="0" step="0.01" className="mt-2" value={tdsAmount} onChange={(event) => setTdsAmount(event.target.value)} />
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("paymentForm.openInvoices", "Open invoices")}</CardTitle>
        </CardHeader>
        <CardContent>
          {!contactId ? (
            <p className="text-sm text-muted-foreground">{t("paymentForm.pickCustomer", "Select a customer to see their open invoices.")}</p>
          ) : openInvoices.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("paymentForm.noOpen", "No open invoices for this customer.")}</p>
          ) : (
            <div className="space-y-2">
              {openInvoices.map((invoice) => (
                <div key={invoice.id} className="grid grid-cols-[1fr_140px_160px] items-center gap-3">
                  <span className="text-sm font-medium">{invoice.invoice_number}</span>
                  <span className="text-right text-sm tabular-nums text-muted-foreground">{formatMoney(invoice.balance_due)}</span>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    max={invoice.balance_due}
                    placeholder="0.00"
                    value={allocations[invoice.id] ?? ""}
                    onChange={(event) => setAllocations((current) => ({ ...current, [invoice.id]: event.target.value }))}
                  />
                </div>
              ))}
              <div className="flex justify-between border-t pt-2 text-sm font-bold">
                <span>{t("paymentForm.allocated", "Allocated to invoices")}</span>
                <span className="tabular-nums">{formatMoney(totalAllocated)}</span>
              </div>
            </div>
          )}

          <div className="mt-4 space-y-3 border-t pt-4">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-sky-600" checked={useAdvance} onChange={(event) => setUseAdvance(event.target.checked)} />
              {t("paymentForm.useAdvance", "Apply from customer advance (no new cash)")}
            </label>
            {!useAdvance ? (
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-muted-foreground">{t("paymentForm.amountReceived", "Amount received")}</span>
                <Input type="number" min="0" step="0.01" className="h-9 w-36 text-right" placeholder={String(totalAllocated)} value={amountReceived} onChange={(event) => setAmountReceived(event.target.value)} />
              </div>
            ) : null}
            {!useAdvance && cashReceived - totalAllocated > 0.001 ? (
              <p className="text-right text-xs text-muted-foreground">
                {t("paymentForm.advanceNote", "{amount} will be recorded as a customer advance.", { amount: formatMoney(cashReceived - totalAllocated) })}
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={() => router.push("/payments/received")}>{t("common.cancel", "Cancel")}</Button>
        <Button type="submit" disabled={submitting}>{t("paymentForm.record", "Record payment")}</Button>
      </div>
    </form>
  );
}
