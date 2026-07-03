"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Inbox } from "lucide-react";
import { toast } from "sonner";
import { useCurrency } from "@/lib/currency";
import { Combobox } from "@/components/ui/combobox";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

type Pending = { id: string; bill_number: string; total: string; issue_date: string; vendor: string; vendor_reference: string | null; from_portal: boolean };
type Account = { id: string; name: string; account_type: string };

const EXPENSE_TYPES = ["expense", "cost_of_goods_sold", "other_expense"];
const fmtDate = (d: string) => (d ? new Date(d).toLocaleDateString() : "—");

export function VendorSubmissions() {
  const { format } = useCurrency();
  const qc = useQueryClient();
  const [account, setAccount] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const { data: pending, isPending } = useQuery({
    queryKey: ["pending-bills"],
    queryFn: async () => {
      const r = await fetch("/api/v1/bills/pending-approval");
      return r.ok ? ((await r.json()).data as Pending[]) : [];
    }
  });
  const { data: accounts = [] } = useQuery({
    queryKey: ["accounts-expense"],
    queryFn: async () => {
      const r = await fetch("/api/v1/accounts?per_page=200");
      return r.ok ? ((await r.json()).data as Account[]) : [];
    }
  });
  const expenseAccounts = useMemo(() => accounts.filter((a) => EXPENSE_TYPES.includes(a.account_type)), [accounts]);

  const approve = async (b: Pending) => {
    setBusy(b.id);
    try {
      const r = await fetch(`/api/v1/bills/${b.id}/approve`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expenseAccountId: account[b.id] || undefined })
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body?.error?.message ?? "Approve failed");
      toast.success(`${b.bill_number} approved & posted to the ledger.`);
      qc.invalidateQueries({ queryKey: ["pending-bills"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Approve failed"); }
    finally { setBusy(null); }
  };

  return (
    <div className="space-y-5 animate-fade-up">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Vendor Submissions</h1>
        <p className="text-sm text-muted-foreground">Draft bills submitted by vendors — review, choose an expense account, and post.</p>
      </div>

      <div className="overflow-hidden rounded-2xl border bg-card shadow-card">
        {isPending ? (
          <div className="space-y-2 p-5">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : (pending ?? []).length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-12 text-center"><CheckCircle2 className="h-8 w-8 text-emerald-500" /><p className="text-sm font-medium">Nothing to approve</p><p className="text-xs text-muted-foreground">Vendor-submitted bills will appear here for posting.</p></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th className="px-5 py-2.5 text-left">Bill #</th><th className="px-5 py-2.5 text-left">Vendor</th><th className="px-5 py-2.5 text-left">Against PO</th><th className="px-5 py-2.5 text-right">Amount</th><th className="px-5 py-2.5 text-left">Expense account</th><th className="px-5 py-2.5 text-right">Action</th></tr>
              </thead>
              <tbody className="divide-y">
                {pending!.map((b) => (
                  <tr key={b.id} className="hover:bg-muted/40">
                    <td className="px-5 py-3"><span className="font-medium">{b.bill_number}</span>{b.from_portal && <span className="ml-2 rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-medium text-indigo-700">Portal</span>}<p className="text-xs text-muted-foreground">{fmtDate(b.issue_date)}</p></td>
                    <td className="px-5 py-3">{b.vendor}</td>
                    <td className="px-5 py-3 text-muted-foreground">{b.vendor_reference ?? "—"}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{format(Number(b.total))}</td>
                    <td className="px-5 py-3"><div className="w-56"><Combobox value={account[b.id] ?? ""} onChange={(v) => setAccount((a) => ({ ...a, [b.id]: v }))} placeholder="Default expense" searchPlaceholder="Search accounts…" options={expenseAccounts.map((a) => ({ value: a.id, label: a.name }))} /></div></td>
                    <td className="px-5 py-3 text-right"><Button size="sm" onClick={() => approve(b)} disabled={busy === b.id}>{busy === b.id ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1 h-4 w-4" />}Approve & post</Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
