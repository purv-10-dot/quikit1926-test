"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import { PageHeader } from "@/components/shared/PageHeader";
import { useI18n } from "@/lib/i18n";
import { useCurrency } from "@/lib/currency";
import { formatMoney } from "@/lib/utils/currency";
import { todayISO } from "@/lib/utils/dates";

type Option = { id: string; label: string };
type Attachment = { id?: string; file_name: string; content_type?: string | null; size_bytes: number; data?: string };
const EXPENSE_TYPES = ["expense", "cost_of_goods_sold", "other_expense", "other_current_asset", "fixed_asset"];
const PAYMENT_TYPES = ["bank", "cash", "credit_card"];
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
const humanSize = (b: number) => (b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);

async function fetchList(path: string): Promise<Array<Record<string, unknown>>> {
  const response = await fetch(path);
  if (!response.ok) return [];
  const payload = (await response.json()) as { data?: unknown };
  return Array.isArray(payload.data) ? (payload.data as Array<Record<string, unknown>>) : [];
}

export function ExpenseForm({ expenseId }: { expenseId?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const cloneId = searchParams.get("clone");
  const { t } = useI18n();
  const { currency: orgCurrency } = useCurrency();
  const isEdit = Boolean(expenseId);

  const [warehouseId, setWarehouseId] = useState("");
  const [expenseDate, setExpenseDate] = useState(todayISO());
  const [accountId, setAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [taxAmount, setTaxAmount] = useState("0");
  const [paymentAccountId, setPaymentAccountId] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [reference, setReference] = useState("");
  const [description, setDescription] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [isBillable, setIsBillable] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const { data: accounts = [] } = useQuery({ queryKey: ["expense-accounts"], queryFn: async () => (await fetchList("/api/v1/accounts?per_page=300")).map((r) => ({ id: String(r.id), label: `${r.code} · ${r.name}`, type: String(r.account_type) })) });
  const { data: vendors = [] } = useQuery({ queryKey: ["expense-vendors"], staleTime: 0, queryFn: async () => (await fetchList("/api/v1/vendors?per_page=200")).map((r) => ({ id: String(r.id), label: String(r.display_name ?? "Vendor") }) as Option) });
  const { data: customers = [] } = useQuery({ queryKey: ["expense-customers"], staleTime: 0, queryFn: async () => (await fetchList("/api/v1/customers?per_page=200")).map((r) => ({ id: String(r.id), label: String(r.display_name ?? "Customer") }) as Option) });
  const { data: warehouses = [] } = useQuery({ queryKey: ["expense-warehouses"], queryFn: async () => (await fetchList("/api/v1/warehouses?per_page=200")).map((r) => ({ id: String(r.id), label: String(r.name ?? "") }) as Option) });
  const { data: projects = [] } = useQuery({ queryKey: ["expense-projects"], queryFn: async () => (await fetchList("/api/v1/projects?per_page=200")).map((r) => ({ id: String(r.id), label: String(r.name ?? "") }) as Option) });

  const expenseAccounts = useMemo(() => accounts.filter((a) => EXPENSE_TYPES.includes(a.type)), [accounts]);
  const paymentAccounts = useMemo(() => accounts.filter((a) => PAYMENT_TYPES.includes(a.type)), [accounts]);

  const { data: existing } = useQuery({
    queryKey: ["expense", expenseId],
    queryFn: async () => {
      const response = await fetch(`/api/v1/expenses/${expenseId}`);
      if (!response.ok) return null;
      return ((await response.json()) as { data?: Record<string, unknown> }).data ?? null;
    },
    enabled: isEdit
  });

  useEffect(() => {
    if (!existing) return;
    setWarehouseId(existing.warehouse_id ? String(existing.warehouse_id) : "");
    setExpenseDate(String(existing.expense_date ?? todayISO()).slice(0, 10));
    setAccountId(String(existing.account_id ?? ""));
    setAmount(String(existing.amount ?? ""));
    setTaxAmount(String(existing.tax_amount ?? "0"));
    setPaymentAccountId(existing.payment_account_id ? String(existing.payment_account_id) : "");
    setVendorId(existing.vendor_id ? String(existing.vendor_id) : "");
    setReference(String(existing.reference ?? ""));
    setDescription(String(existing.description ?? ""));
    setCustomerId(existing.customer_id ? String(existing.customer_id) : "");
    setIsBillable(Boolean(existing.is_billable));
    setProjectId(existing.project_id ? String(existing.project_id) : "");
    const atts = Array.isArray(existing.attachments) ? (existing.attachments as Array<Record<string, unknown>>) : [];
    setAttachments(atts.map((a) => ({ id: String(a.id), file_name: String(a.file_name ?? "file"), content_type: a.content_type ? String(a.content_type) : null, size_bytes: Number(a.size_bytes ?? 0) })));
  }, [existing]);

  // Clone: prefill a new expense from an existing one (no attachments / billed state carried over).
  const { data: cloneSrc } = useQuery({
    queryKey: ["expense-clone", cloneId],
    enabled: !isEdit && Boolean(cloneId),
    queryFn: async () => { const r = await fetch(`/api/v1/expenses/${cloneId}`); return r.ok ? (((await r.json()) as { data?: Record<string, unknown> }).data ?? null) : null; }
  });
  useEffect(() => {
    if (!cloneSrc) return;
    setWarehouseId(cloneSrc.warehouse_id ? String(cloneSrc.warehouse_id) : "");
    setAccountId(String(cloneSrc.account_id ?? ""));
    setAmount(String(cloneSrc.amount ?? ""));
    setTaxAmount(String(cloneSrc.tax_amount ?? "0"));
    setPaymentAccountId(cloneSrc.payment_account_id ? String(cloneSrc.payment_account_id) : "");
    setVendorId(cloneSrc.vendor_id ? String(cloneSrc.vendor_id) : "");
    setDescription(String(cloneSrc.description ?? ""));
    setCustomerId(cloneSrc.customer_id ? String(cloneSrc.customer_id) : "");
    setIsBillable(Boolean(cloneSrc.is_billable));
    setProjectId(cloneSrc.project_id ? String(cloneSrc.project_id) : "");
  }, [cloneSrc]);

  const { clearDraft } = useFormDraft(
    "qf-draft:expense",
    { warehouseId, expenseDate, accountId, amount, taxAmount, paymentAccountId, vendorId, reference, description, customerId, isBillable, projectId },
    (d) => {
      if (d.warehouseId !== undefined) setWarehouseId(d.warehouseId);
      if (d.expenseDate !== undefined) setExpenseDate(d.expenseDate);
      if (d.accountId !== undefined) setAccountId(d.accountId);
      if (d.amount !== undefined) setAmount(d.amount);
      if (d.taxAmount !== undefined) setTaxAmount(d.taxAmount);
      if (d.paymentAccountId !== undefined) setPaymentAccountId(d.paymentAccountId);
      if (d.vendorId !== undefined) setVendorId(d.vendorId);
      if (d.reference !== undefined) setReference(d.reference);
      if (d.description !== undefined) setDescription(d.description);
      if (d.customerId !== undefined) setCustomerId(d.customerId);
      if (d.isBillable !== undefined) setIsBillable(d.isBillable);
      if (d.projectId !== undefined) setProjectId(d.projectId);
    },
    { enabled: !isEdit && !cloneId }
  );

  const total = (Number(amount) || 0) + (Number(taxAmount) || 0);

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
    if (!accountId) { toast.error(t("expenseForm.account", "Select an expense account.")); return; }
    if (!paymentAccountId) { toast.error("Select a Paid Through account."); return; }
    if (!(Number(amount) > 0)) { toast.error("Enter an amount."); return; }

    setSubmitting(true);
    try {
      const payload = {
        expense_date: expenseDate,
        warehouse_id: warehouseId || null,
        vendor_id: vendorId || null,
        customer_id: customerId || null,
        account_id: accountId,
        project_id: projectId || null,
        payment_account_id: paymentAccountId || null,
        amount: Number(amount) || 0,
        tax_amount: Number(taxAmount) || 0,
        currency: orgCurrency,
        reference: reference || null,
        description: description || "Expense",
        is_billable: isBillable,
        status: "posted",
        attachments: attachments.map((a) => ({ id: a.id, file_name: a.file_name, content_type: a.content_type, size_bytes: a.size_bytes, data: a.data }))
      };
      const response = await fetch(isEdit ? `/api/v1/expenses/${expenseId}` : "/api/v1/expenses", {
        method: isEdit ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        toast.error(body?.error?.message ?? t("expenseForm.failed", "Could not save the expense."));
        return;
      }
      const saved = (await response.json()) as { data?: { id?: string } };
      toast.success(isEdit ? t("expenseForm.updated", "Expense updated.") : t("expenseForm.created", "Expense recorded and posted."));
      clearDraft();
      const id = saved?.data?.id ?? expenseId;
      router.push(id ? `/expenses/${id}` : "/expenses");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-6 animate-fade-up">
      <PageHeader title={isEdit ? t("expenseForm.editTitle", "Edit Expense") : t("expenseForm.newTitle", "Record Expense")} description={t("expenseForm.desc", "Posts Dr Expense / Dr Input Tax / Cr Paid-Through (or Accounts Payable).")} />
      <Card>
        <CardContent className="grid gap-5 pt-6 md:grid-cols-2">
          <div>
            <Label>{t("expenseForm.location", "Location")}</Label>
            <div className="mt-2"><Combobox value={warehouseId} placeholder="Select a location" searchPlaceholder="Search locations…" onChange={setWarehouseId} options={warehouses.map((w) => ({ value: w.id, label: w.label }))} /></div>
          </div>
          <div>
            <Label className="text-destructive">{t("expenseForm.date", "Date")}*</Label>
            <Input type="date" className="mt-2" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} />
          </div>
          <div>
            <Label className="text-destructive">{t("expenseForm.expenseAccount", "Expense Account")}*</Label>
            <div className="mt-2"><Combobox value={accountId} placeholder={t("common.select", "Select an account")} searchPlaceholder="Search accounts…" onChange={setAccountId} options={expenseAccounts.map((a) => ({ value: a.id, label: a.label }))} /></div>
          </div>
          <div>
            <Label className="text-destructive">{t("expenseForm.amount", "Amount")}*</Label>
            <div className="mt-2 flex">
              <span className="inline-flex items-center rounded-l-md border border-r-0 bg-muted px-3 text-sm text-muted-foreground">{orgCurrency}</span>
              <Input type="number" min="0" step="0.01" className="rounded-l-none" value={amount} placeholder="0.00" onChange={(e) => setAmount(e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-destructive">{t("expenseForm.paidThrough", "Paid Through")}*</Label>
            <div className="mt-2"><Combobox value={paymentAccountId} placeholder={t("common.select", "Select an account")} searchPlaceholder="Search accounts…" onChange={setPaymentAccountId} options={paymentAccounts.map((a) => ({ value: a.id, label: a.label }))} /></div>
          </div>
          <div>
            <Label>{t("expenseForm.tax", "Input tax")}</Label>
            <Input type="number" min="0" step="0.01" className="mt-2" value={taxAmount} onChange={(e) => setTaxAmount(e.target.value)} />
          </div>
          <div>
            <Label>{t("expenseForm.vendor", "Vendor")}</Label>
            <div className="mt-2"><Combobox value={vendorId} placeholder={t("common.none", "Select a vendor")} searchPlaceholder="Search vendors…" createHref="/vendors/new" createLabel="New Vendor" onChange={setVendorId} options={vendors.map((v) => ({ value: v.id, label: v.label }))} /></div>
          </div>
          <div>
            <Label>{t("expenseForm.invoice", "Invoice#")}</Label>
            <Input className="mt-2" value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <Label>{t("expenseForm.notes", "Notes")}</Label>
            <Textarea rows={2} className="mt-2" maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Max. 500 characters" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t("expenseForm.billing", "Customer & Billing")}</CardTitle></CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-2">
          <div>
            <Label>{t("expenseForm.customer", "Customer Name")}</Label>
            <div className="mt-2"><Combobox value={customerId} placeholder="Select or add a customer" searchPlaceholder="Search customers…" createHref="/customers/new" createLabel="New Customer" onChange={setCustomerId} options={customers.map((c) => ({ value: c.id, label: c.label }))} /></div>
            <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-primary" checked={isBillable} onChange={(e) => setIsBillable(e.target.checked)} />Billable (can be invoiced to this customer)</label>
          </div>
          <div>
            <Label>{t("expenseForm.project", "Projects")}</Label>
            <div className="mt-2"><Combobox value={projectId} placeholder="Select a project" searchPlaceholder="Search projects…" onChange={setProjectId} options={projects.map((p) => ({ value: p.id, label: p.label }))} /></div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t("expenseForm.attachments", "Receipts / Attachments")}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground hover:bg-muted">
            <Paperclip className="h-4 w-4" /><span>Upload your Files (max 10 MB each)</span>
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
          ) : <p className="text-xs text-muted-foreground">No receipts uploaded.</p>}
        </CardContent>
      </Card>

      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">{t("expenseForm.total", "Total")}: <span className="tabular-nums">{formatMoney(total)}</span></span>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={() => router.push("/expenses")}>{t("common.cancel", "Cancel")}</Button>
          <Button type="submit" disabled={submitting}>{submitting ? t("common.saving", "Saving…") : isEdit ? t("expenseForm.update", "Update") : t("expenseForm.save", "Save")}</Button>
        </div>
      </div>
    </form>
  );
}
