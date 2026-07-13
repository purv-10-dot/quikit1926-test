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
import { todayISO } from "@/lib/utils/dates";

type Option = { id: string; label: string };
const EXPENSE_TYPES = ["expense", "cost_of_goods_sold", "other_expense", "other_current_asset", "fixed_asset"];
const PAYMENT_TYPES = ["bank", "cash", "credit_card"];
const selectClass = "h-10 w-full rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";
const REPEAT = [
  { value: "weekly", label: "Week" }, { value: "biweekly", label: "2 Weeks" }, { value: "monthly", label: "Month" },
  { value: "bimonthly", label: "2 Months" }, { value: "quarterly", label: "3 Months" }, { value: "semiannually", label: "6 Months" }, { value: "annually", label: "Year" }
];

async function fetchList(path: string): Promise<Array<Record<string, unknown>>> {
  const r = await fetch(path);
  if (!r.ok) return [];
  const payload = (await r.json()) as { data?: unknown };
  return Array.isArray(payload.data) ? (payload.data as Array<Record<string, unknown>>) : [];
}

export function RecurringExpenseForm() {
  const router = useRouter();
  const { currency: orgCurrency } = useCurrency();

  const [profileName, setProfileName] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [frequency, setFrequency] = useState("monthly");
  const [startDate, setStartDate] = useState(todayISO());
  const [endsOn, setEndsOn] = useState("");
  const [neverExpires, setNeverExpires] = useState(true);
  const [accountId, setAccountId] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentAccountId, setPaymentAccountId] = useState("");
  const [vendorId, setVendorId] = useState("");
  const [notes, setNotes] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data: accounts = [] } = useQuery({ queryKey: ["expense-accounts"], queryFn: async () => (await fetchList("/api/v1/accounts?per_page=300")).map((r) => ({ id: String(r.id), label: `${r.code} · ${r.name}`, type: String(r.account_type) })) });
  const { data: vendors = [] } = useQuery({ queryKey: ["expense-vendors"], staleTime: 0, queryFn: async () => (await fetchList("/api/v1/vendors?per_page=200")).map((r) => ({ id: String(r.id), label: String(r.display_name ?? "Vendor") }) as Option) });
  const { data: customers = [] } = useQuery({ queryKey: ["expense-customers"], staleTime: 0, queryFn: async () => (await fetchList("/api/v1/customers?per_page=200")).map((r) => ({ id: String(r.id), label: String(r.display_name ?? "Customer") }) as Option) });
  const { data: warehouses = [] } = useQuery({ queryKey: ["expense-warehouses"], queryFn: async () => (await fetchList("/api/v1/warehouses?per_page=200")).map((r) => ({ id: String(r.id), label: String(r.name ?? "") }) as Option) });

  const expenseAccounts = useMemo(() => accounts.filter((a) => EXPENSE_TYPES.includes(a.type)), [accounts]);
  const paymentAccounts = useMemo(() => accounts.filter((a) => PAYMENT_TYPES.includes(a.type)), [accounts]);

  const nextRunLabel = useMemo(() => {
    const label = REPEAT.find((r) => r.value === frequency)?.label.toLowerCase() ?? "period";
    return `An expense for this amount will be created every ${label} from ${startDate}.`;
  }, [frequency, startDate]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!profileName.trim()) { toast.error("Enter a profile name."); return; }
    if (!accountId) { toast.error("Select an expense account."); return; }
    if (!paymentAccountId) { toast.error("Select a Paid Through account."); return; }
    if (!(Number(amount) > 0)) { toast.error("Enter an amount."); return; }
    if (!neverExpires && !endsOn) { toast.error("Choose an end date or select Never Expires."); return; }

    setSubmitting(true);
    try {
      const payload = {
        profile_name: profileName.trim(), frequency, start_date: startDate, end_date: neverExpires ? null : endsOn, never_expires: neverExpires,
        expense: {
          expense_date: startDate, warehouse_id: warehouseId || null, vendor_id: vendorId || null, customer_id: customerId || null,
          account_id: accountId, payment_account_id: paymentAccountId, amount: Number(amount), tax_amount: 0, currency: orgCurrency,
          description: notes.trim() || profileName.trim(), is_billable: false, status: "draft"
        }
      };
      const res = await fetch("/api/v1/recurring/expense", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        toast.error(body?.error?.message ?? "Could not create the recurring expense.");
        return;
      }
      toast.success("Recurring expense profile created.");
      router.push("/recurring");
    } finally { setSubmitting(false); }
  };

  return (
    <form onSubmit={submit} className="space-y-6">
      <Card>
        <CardContent className="grid gap-5 pt-6 md:grid-cols-2">
          <div>
            <Label className="text-destructive">Profile Name*</Label>
            <Input className="mt-2" value={profileName} onChange={(e) => setProfileName(e.target.value)} placeholder="e.g. Monthly office rent" />
          </div>
          <div>
            <Label>Location</Label>
            <div className="mt-2"><Combobox value={warehouseId} placeholder="Select a location" searchPlaceholder="Search locations…" onChange={setWarehouseId} options={warehouses.map((w) => ({ value: w.id, label: w.label }))} /></div>
          </div>
          <div>
            <Label className="text-destructive">Repeat Every*</Label>
            <select className={`${selectClass} mt-2`} value={frequency} onChange={(e) => setFrequency(e.target.value)}>
              {REPEAT.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 items-end gap-3">
            <div><Label>Start Date</Label><Input type="date" className="mt-2" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></div>
            <div>
              <Label>Ends On</Label>
              <Input type="date" className="mt-2" value={endsOn} disabled={neverExpires} onChange={(e) => setEndsOn(e.target.value)} />
              <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-primary" checked={neverExpires} onChange={(e) => setNeverExpires(e.target.checked)} />Never Expires</label>
            </div>
          </div>
          <div>
            <Label className="text-destructive">Expense Account*</Label>
            <div className="mt-2"><Combobox value={accountId} placeholder="Select an account" searchPlaceholder="Search accounts…" onChange={setAccountId} options={expenseAccounts.map((a) => ({ value: a.id, label: a.label }))} /></div>
          </div>
          <div>
            <Label className="text-destructive">Amount*</Label>
            <div className="mt-2 flex">
              <span className="inline-flex items-center rounded-l-md border border-r-0 bg-muted px-3 text-sm text-muted-foreground">{orgCurrency}</span>
              <Input type="number" min="0" step="0.01" className="rounded-l-none" value={amount} placeholder="0.00" onChange={(e) => setAmount(e.target.value)} />
            </div>
          </div>
          <div>
            <Label className="text-destructive">Paid Through*</Label>
            <div className="mt-2"><Combobox value={paymentAccountId} placeholder="Select an account" searchPlaceholder="Search accounts…" onChange={setPaymentAccountId} options={paymentAccounts.map((a) => ({ value: a.id, label: a.label }))} /></div>
          </div>
          <div>
            <Label>Vendor</Label>
            <div className="mt-2"><Combobox value={vendorId} placeholder="Select a vendor" searchPlaceholder="Search vendors…" createHref="/vendors/new" createLabel="New Vendor" onChange={setVendorId} options={vendors.map((v) => ({ value: v.id, label: v.label }))} /></div>
          </div>
          <div className="md:col-span-2">
            <Label>Notes</Label>
            <Textarea rows={2} className="mt-2" maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Max. 500 characters" />
          </div>
          <div>
            <Label>Customer Name</Label>
            <div className="mt-2"><Combobox value={customerId} placeholder="Select a customer" searchPlaceholder="Search customers…" createHref="/customers/new" createLabel="New Customer" onChange={setCustomerId} options={customers.map((c) => ({ value: c.id, label: c.label }))} /></div>
          </div>
        </CardContent>
      </Card>
      <p className="text-xs text-muted-foreground">{nextRunLabel}</p>
      <div className="flex gap-2">
        <Button type="submit" disabled={submitting}>{submitting ? "Saving…" : "Save"}</Button>
        <Button type="button" variant="secondary" onClick={() => router.push("/recurring")}>Cancel</Button>
      </div>
    </form>
  );
}
