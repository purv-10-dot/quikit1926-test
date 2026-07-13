"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCurrency } from "@/lib/currency";
import { todayISO } from "@/lib/utils/dates";

type Opt = { id: string; label: string };
type Row = { date: string; account_id: string; amount: string; payment_account_id: string; vendor_id: string; warehouse_id: string; customer_id: string; project_id: string; is_billable: boolean };
const EXPENSE_TYPES = ["expense", "cost_of_goods_sold", "other_expense", "other_current_asset", "fixed_asset"];
const PAYMENT_TYPES = ["bank", "cash", "credit_card"];
const sel = "h-9 w-full rounded-md border bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring";
const emptyRow = (): Row => ({ date: todayISO(), account_id: "", amount: "", payment_account_id: "", vendor_id: "", warehouse_id: "", customer_id: "", project_id: "", is_billable: false });

async function fetchList(path: string): Promise<Array<Record<string, unknown>>> {
  const r = await fetch(path);
  if (!r.ok) return [];
  const payload = (await r.json()) as { data?: unknown };
  return Array.isArray(payload.data) ? (payload.data as Array<Record<string, unknown>>) : [];
}

export function BulkExpenseForm() {
  const router = useRouter();
  const { currency: orgCurrency } = useCurrency();
  const [rows, setRows] = useState<Row[]>(() => Array.from({ length: 8 }, emptyRow));
  const [submitting, setSubmitting] = useState(false);

  const { data: accounts = [] } = useQuery({ queryKey: ["expense-accounts"], queryFn: async () => (await fetchList("/api/v1/accounts?per_page=300")).map((r) => ({ id: String(r.id), label: String(r.name ?? ""), type: String(r.account_type) })) });
  const { data: vendors = [] } = useQuery({ queryKey: ["expense-vendors"], staleTime: 0, queryFn: async () => (await fetchList("/api/v1/vendors?per_page=200")).map((r) => ({ id: String(r.id), label: String(r.display_name ?? "Vendor") }) as Opt) });
  const { data: customers = [] } = useQuery({ queryKey: ["expense-customers"], staleTime: 0, queryFn: async () => (await fetchList("/api/v1/customers?per_page=200")).map((r) => ({ id: String(r.id), label: String(r.display_name ?? "Customer") }) as Opt) });
  const { data: warehouses = [] } = useQuery({ queryKey: ["expense-warehouses"], queryFn: async () => (await fetchList("/api/v1/warehouses?per_page=200")).map((r) => ({ id: String(r.id), label: String(r.name ?? "") }) as Opt) });
  const { data: projects = [] } = useQuery({ queryKey: ["expense-projects"], queryFn: async () => (await fetchList("/api/v1/projects?per_page=200")).map((r) => ({ id: String(r.id), label: String(r.name ?? "") }) as Opt) });

  const expenseAccounts = useMemo(() => accounts.filter((a) => EXPENSE_TYPES.includes(a.type)), [accounts]);
  const paymentAccounts = useMemo(() => accounts.filter((a) => PAYMENT_TYPES.includes(a.type)), [accounts]);

  const setRow = (i: number, patch: Partial<Row>) => setRows((cur) => cur.map((r, p) => (p === i ? { ...r, ...patch } : r)));
  const addRows = () => setRows((cur) => [...cur, ...Array.from({ length: 5 }, emptyRow)]);

  const submit = async () => {
    const valid = rows.filter((r) => r.account_id && r.payment_account_id && Number(r.amount) > 0 && r.date);
    if (valid.length === 0) { toast.error("Fill at least one row (Date, Expense Account, Amount, Paid Through)."); return; }
    setSubmitting(true);
    try {
      const expenses = valid.map((r) => ({
        expense_date: r.date, account_id: r.account_id, payment_account_id: r.payment_account_id,
        vendor_id: r.vendor_id || null, customer_id: r.customer_id || null, warehouse_id: r.warehouse_id || null, project_id: r.project_id || null,
        amount: Number(r.amount), tax_amount: 0, currency: orgCurrency, is_billable: r.is_billable, description: "Bulk expense", status: "posted"
      }));
      const res = await fetch("/api/v1/expenses/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ expenses }) });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        toast.error(body?.error?.message ?? "Could not save the expenses.");
        return;
      }
      const saved = (await res.json()) as { data?: { created?: number } };
      toast.success(`${saved?.data?.created ?? valid.length} expense(s) recorded and posted.`);
      router.push("/expenses");
    } finally { setSubmitting(false); }
  };

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="border-b bg-muted/40 text-xs font-semibold uppercase text-muted-foreground">
            <tr>
              <th className="px-2 py-2 text-left">Date*</th>
              <th className="px-2 py-2 text-left">Expense Account*</th>
              <th className="px-2 py-2 text-left">Amount*</th>
              <th className="px-2 py-2 text-left">Paid Through*</th>
              <th className="px-2 py-2 text-left">Vendor</th>
              <th className="px-2 py-2 text-left">Location</th>
              <th className="px-2 py-2 text-left">Customer</th>
              <th className="px-2 py-2 text-left">Project</th>
              <th className="px-2 py-2 text-center">Billable</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="px-2 py-1.5"><Input type="date" className="h-9" value={r.date} onChange={(e) => setRow(i, { date: e.target.value })} /></td>
                <td className="px-2 py-1.5"><select className={sel} value={r.account_id} onChange={(e) => setRow(i, { account_id: e.target.value })}><option value="">Select an account</option>{expenseAccounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select></td>
                <td className="px-2 py-1.5"><Input type="number" min="0" step="0.01" className="h-9 w-28" placeholder="0.00" value={r.amount} onChange={(e) => setRow(i, { amount: e.target.value })} /></td>
                <td className="px-2 py-1.5"><select className={sel} value={r.payment_account_id} onChange={(e) => setRow(i, { payment_account_id: e.target.value })}><option value="">Select an account</option>{paymentAccounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select></td>
                <td className="px-2 py-1.5"><select className={sel} value={r.vendor_id} onChange={(e) => setRow(i, { vendor_id: e.target.value })}><option value="">—</option>{vendors.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}</select></td>
                <td className="px-2 py-1.5"><select className={sel} value={r.warehouse_id} onChange={(e) => setRow(i, { warehouse_id: e.target.value })}><option value="">—</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}</select></td>
                <td className="px-2 py-1.5"><select className={sel} value={r.customer_id} onChange={(e) => setRow(i, { customer_id: e.target.value })}><option value="">—</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></td>
                <td className="px-2 py-1.5"><select className={sel} value={r.project_id} onChange={(e) => setRow(i, { project_id: e.target.value })}><option value="">—</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select></td>
                <td className="px-2 py-1.5 text-center"><input type="checkbox" className="h-4 w-4 accent-primary" checked={r.is_billable} onChange={(e) => setRow(i, { is_billable: e.target.checked })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button type="button" variant="secondary" size="sm" onClick={addRows}><Plus className="mr-2 h-4 w-4" />Add More Expenses</Button>
      <div className="flex gap-2">
        <Button type="button" onClick={submit} disabled={submitting}>{submitting ? "Saving…" : "Save"}</Button>
        <Button type="button" variant="secondary" onClick={() => router.push("/expenses")}>Cancel</Button>
      </div>
    </div>
  );
}
