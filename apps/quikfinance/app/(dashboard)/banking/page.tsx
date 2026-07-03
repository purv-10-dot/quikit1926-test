"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Landmark, Wallet, Upload, Plus, ListChecks, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/PageHeader";
import { useCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils/cn";

type Account = {
  id: string; name: string; kind: string; institution_name: string | null; account_number_last4: string | null;
  currency: string; is_primary: boolean; account_code: string | null; book_balance: number; uncategorized: number;
};
type Overview = { cash_in_hand: number; bank_balance: number; accounts: Account[] };

export default function BankingOverviewPage() {
  const { format } = useCurrency();
  const { data } = useQuery<Overview>({
    queryKey: ["banking-overview"],
    queryFn: async () => {
      const r = await fetch("/api/v1/banking/overview");
      return r.ok ? (((await r.json()) as { data?: Overview }).data ?? { cash_in_hand: 0, bank_balance: 0, accounts: [] }) : { cash_in_hand: 0, bank_balance: 0, accounts: [] };
    },
    initialData: { cash_in_hand: 0, bank_balance: 0, accounts: [] }
  });

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader title="Banking Overview" description="Connect bank & credit-card accounts, import statements, and auto-categorize with rules." />
        <div className="flex flex-wrap gap-2">
          <Link href="/banking/transactions"><Button size="sm" variant="secondary"><Wallet className="h-4 w-4" />Transactions</Button></Link>
          <Link href="/banking/import"><Button size="sm" variant="secondary"><Upload className="h-4 w-4" />Import Statement</Button></Link>
          <Link href="/banking/accounts/new"><Button size="sm"><Plus className="h-4 w-4" />Add Bank or Credit Card</Button></Link>
          <Link href="/banking/rules"><Button size="sm" variant="secondary"><ListChecks className="h-4 w-4" />Manage Transaction Rules</Button></Link>
        </div>
      </div>

      {/* Summary tiles */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-2xl border bg-card p-4 shadow-card">
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Wallet className="h-4 w-4" />Cash in Hand</div>
          <div className={cn("mt-1 text-2xl font-bold tabular-nums", data.cash_in_hand < 0 && "text-rose-600")}>{format(data.cash_in_hand)}</div>
        </div>
        <div className="rounded-2xl border bg-card p-4 shadow-card">
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Landmark className="h-4 w-4" />Bank Balance</div>
          <div className={cn("mt-1 text-2xl font-bold tabular-nums", data.bank_balance < 0 && "text-rose-600")}>{format(data.bank_balance)}</div>
        </div>
      </div>

      {/* Accounts — Mercury-style cards */}
      <div>
        <h3 className="mb-3 text-base font-semibold">Accounts</h3>
        {data.accounts.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border/60 bg-card p-12 text-center text-sm text-muted-foreground">
            No bank or credit-card accounts yet. <Link href="/banking/accounts/new" className="font-medium text-indigo-600 hover:underline">Add one</Link> to start importing statements.
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.accounts.map((a) => {
              const isCard = a.kind === "credit_card";
              return (
                <div key={a.id} className={cn(
                  "group relative flex flex-col overflow-hidden rounded-3xl border p-5 shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:shadow-popover",
                  isCard ? "border-transparent bg-gradient-to-br from-indigo-600 to-violet-600 text-white" : "border-border/50 bg-card")}>
                  <div className="flex items-center justify-between">
                    <span className={cn("flex items-center gap-2 font-semibold", isCard ? "text-white" : "")}>
                      {isCard ? <CreditCard className="h-4 w-4" /> : <Landmark className="h-4 w-4 text-muted-foreground" />}
                      {a.name}
                    </span>
                    {a.is_primary ? <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase", isCard ? "bg-white/20 text-white" : "bg-muted text-muted-foreground")}>Primary</span> : null}
                  </div>
                  <p className={cn("mt-1 text-xs", isCard ? "text-white/70" : "text-muted-foreground")}>
                    {[a.institution_name, a.account_number_last4 ? `•••• ${a.account_number_last4}` : null].filter(Boolean).join(" · ") || (isCard ? "Credit Card" : "Bank")}
                  </p>
                  <p className="mt-5 text-[26px] font-bold leading-none tracking-tight tabular-nums">{format(a.book_balance)}</p>
                  <div className="mt-4 flex items-center justify-between">
                    {a.uncategorized > 0 ? (
                      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", isCard ? "bg-white/20 text-white" : "bg-amber-100 text-amber-700")}>{a.uncategorized} to categorize</span>
                    ) : <span className={cn("text-[11px]", isCard ? "text-white/60" : "text-muted-foreground")}>All categorized</span>}
                    <Link href={`/banking/import?account=${a.id}`} className={cn("inline-flex items-center gap-1 text-[12px] font-semibold", isCard ? "text-white hover:underline" : "text-indigo-600 hover:underline")}>
                      <Upload className="h-3.5 w-3.5" />Import
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
