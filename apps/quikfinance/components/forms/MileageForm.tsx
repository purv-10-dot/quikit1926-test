"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Combobox } from "@/components/ui/combobox";
import { useCurrency } from "@/lib/currency";
import { formatMoney } from "@/lib/utils/currency";
import { todayISO } from "@/lib/utils/dates";

type Option = { id: string; label: string };
const EXPENSE_TYPES = ["expense", "cost_of_goods_sold", "other_expense", "other_current_asset", "fixed_asset"];
const PAYMENT_TYPES = ["bank", "cash", "credit_card"];
const selectClass = "h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";

async function fetchList(path: string): Promise<Array<Record<string, unknown>>> {
  const r = await fetch(path);
  if (!r.ok) return [];
  const payload = (await r.json()) as { data?: unknown };
  return Array.isArray(payload.data) ? (payload.data as Array<Record<string, unknown>>) : [];
}

export function MileageForm() {
  const router = useRouter();
  const { currency: orgCurrency } = useCurrency();

  const [employee, setEmployee] = useState("");
  const [expenseDate, setExpenseDate] = useState(todayISO());
  const [distance, setDistance] = useState("");
  const [unit, setUnit] = useState("Km");
  const [rate, setRate] = useState("10");
  const [accountId, setAccountId] = useState("");
  const [paymentAccountId, setPaymentAccountId] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [isBillable, setIsBillable] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: accounts = [] } = useQuery({ queryKey: ["expense-accounts"], queryFn: async () => (await fetchList("/api/v1/accounts?per_page=300")).map((r) => ({ id: String(r.id), label: `${r.code} · ${r.name}`, type: String(r.account_type) })) });
  const { data: vendors = [] } = useQuery({ queryKey: ["expense-vendors"], staleTime: 0, queryFn: async () => (await fetchList("/api/v1/vendors?per_page=200")).map((r) => ({ id: String(r.id), label: String(r.display_name ?? "Vendor") }) as Option) });
  const { data: customers = [] } = useQuery({ queryKey: ["expense-customers"], staleTime: 0, queryFn: async () => (await fetchList("/api/v1/customers?per_page=200")).map((r) => ({ id: String(r.id), label: String(r.display_name ?? "Customer") }) as Option) });
  const { data: projects = [] } = useQuery({ queryKey: ["expense-projects"], queryFn: async () => (await fetchList("/api/v1/projects?per_page=200")).map((r) => ({ id: String(r.id), label: String(r.name ?? "") }) as Option) });

  const expenseAccounts = useMemo(() => accounts.filter((a) => EXPENSE_TYPES.includes(a.type)), [accounts]);
  const paymentAccounts = useMemo(() => accounts.filter((a) => PAYMENT_TYPES.includes(a.type)), [accounts]);
  useEffect(() => { if (!accountId && expenseAccounts.length) setAccountId(expenseAccounts.find((a) => /fuel|mileage|travel/i.test(a.label))?.id ?? expenseAccounts[0].id); }, [expenseAccounts, accountId]);

  const amount = useMemo(() => Math.round(((Number(distance) || 0) * (Number(rate) || 0) + Number.EPSILON) * 100) / 100, [distance, rate]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!accountId) { toast.error("Select an expense account."); return; }
    if (!paymentAccountId) { toast.error("Select a Paid Through account."); return; }
    if (!(Number(distance) > 0)) { toast.error("Enter the distance travelled."); return; }
    setSubmitting(true);
    try {
      const payload = {
        expense_date: expenseDate, account_id: accountId, payment_account_id: paymentAccountId,
        vendor_id: vendorId || null, customer_id: customerId || null, project_id: projectId || null,
        amount, tax_amount: 0, currency: orgCurrency, reference: reference || null, is_billable: isBillable,
        is_mileage: true, distance: Number(distance), mileage_rate: Number(rate), mileage_unit: unit, employee_name: employee || null,
        description: notes || `Mileage: ${distance} ${unit} @ ${formatMoney(Number(rate) || 0)}/${unit}`,
        status: "posted"
      };
      const res = await fetch("/api/v1/expenses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        toast.error(body?.error?.message ?? "Could not record the mileage expense.");
        return;
      }
      const saved = (await res.json()) as { data?: { id?: string } };
      toast.success("Mileage expense recorded and posted.");
      router.push(saved?.data?.id ? `/expenses/${saved.data.id}` : "/expenses");
    } finally { setSubmitting(false); }
  };

  return (
    <form onSubmit={submit} className="space-y-6">
      <Card>
        <CardContent className="grid gap-5 pt-6 md:grid-cols-2">
          <div>
            <Label>Employee</Label>
            <Input className="mt-2" value={employee} onChange={(e) => setEmployee(e.target.value)} placeholder="Employee name" />
          </div>
          <div>
            <Label className="text-destructive">Date*</Label>
            <Input type="date" className="mt-2" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} />
          </div>
          <div>
            <Label className="text-destructive">Distance travelled*</Label>
            <div className="mt-2 flex gap-2">
              <Input type="number" min="0" step="0.1" value={distance} onChange={(e) => setDistance(e.target.value)} placeholder="0" />
              <select className={`${selectClass} w-28 shrink-0`} value={unit} onChange={(e) => setUnit(e.target.value)}>
                <option value="Km">Kilometer(s)</option>
                <option value="Mile">Mile(s)</option>
              </select>
            </div>
          </div>
          <div>
            <Label className="text-destructive">Mileage Rate (per {unit})*</Label>
            <div className="mt-2 flex">
              <span className="inline-flex items-center rounded-l-md border border-r-0 bg-muted px-3 text-sm text-muted-foreground">{orgCurrency}</span>
              <Input type="number" min="0" step="0.01" className="rounded-l-none" value={rate} onChange={(e) => setRate(e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-destructive">Amount</Label>
            <div className="mt-2 flex">
              <span className="inline-flex items-center rounded-l-md border border-r-0 bg-muted px-3 text-sm text-muted-foreground">{orgCurrency}</span>
              <Input className="rounded-l-none bg-muted/40" value={amount.toFixed(2)} readOnly />
            </div>
          </div>
          <div>
            <Label className="text-destructive">Expense Account*</Label>
            <div className="mt-2"><Combobox value={accountId} placeholder="Select an account" searchPlaceholder="Search accounts…" onChange={setAccountId} options={expenseAccounts.map((a) => ({ value: a.id, label: a.label }))} /></div>
          </div>
          <div>
            <Label className="text-destructive">Paid Through*</Label>
            <div className="mt-2"><Combobox value={paymentAccountId} placeholder="Select an account" searchPlaceholder="Search accounts…" onChange={setPaymentAccountId} options={paymentAccounts.map((a) => ({ value: a.id, label: a.label }))} /></div>
          </div>
          <div>
            <Label>Vendor</Label>
            <div className="mt-2"><Combobox value={vendorId} placeholder="Select a vendor" searchPlaceholder="Search vendors…" createHref="/vendors/new" createLabel="New Vendor" onChange={setVendorId} options={vendors.map((v) => ({ value: v.id, label: v.label }))} /></div>
          </div>
          <div>
            <Label>Invoice#</Label>
            <Input className="mt-2" value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <Label>Notes</Label>
            <Textarea rows={2} className="mt-2" maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div>
            <Label>Customer Name</Label>
            <div className="mt-2"><Combobox value={customerId} placeholder="Select a customer" searchPlaceholder="Search customers…" createHref="/customers/new" createLabel="New Customer" onChange={setCustomerId} options={customers.map((c) => ({ value: c.id, label: c.label }))} /></div>
            <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-primary" checked={isBillable} onChange={(e) => setIsBillable(e.target.checked)} />Billable</label>
          </div>
          <div>
            <Label>Projects</Label>
            <div className="mt-2"><Combobox value={projectId} placeholder="Select a project" searchPlaceholder="Search projects…" onChange={setProjectId} options={projects.map((p) => ({ value: p.id, label: p.label }))} /></div>
          </div>
        </CardContent>
      </Card>
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">Amount: <span className="tabular-nums">{formatMoney(amount)}</span></span>
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={() => router.push("/expenses")}>Cancel</Button>
          <Button type="submit" disabled={submitting}>{submitting ? "Saving…" : "Save"}</Button>
        </div>
      </div>
    </form>
  );
}
