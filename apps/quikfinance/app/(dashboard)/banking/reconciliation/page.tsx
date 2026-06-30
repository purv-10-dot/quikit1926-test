"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/shared/PageHeader";
import { formatMoneyDigits } from "@/lib/utils/currency";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n";
import Link from "next/link";

function fmt(v: number) {
  return formatMoneyDigits(v, 2);
}

export default function ReconciliationPage() {
  const { t } = useI18n();
  const [selectedAccount, setSelectedAccount] = useState<string>("");
  const [search, setSearch] = useState("");

  const { data: accountsData } = useQuery({
    queryKey: ["bank-accounts-list"],
    queryFn: async () => {
      const res = await fetch("/api/v1/bank-accounts");
      return res.json();
    }
  });

  const { data: txData, isLoading } = useQuery({
    queryKey: ["bank-transactions", selectedAccount],
    enabled: !!selectedAccount,
    queryFn: async () => {
      const res = await fetch(`/api/v1/reconciliation?bank_account_id=${selectedAccount}&limit=200`);
      return res.json();
    }
  });

  const accounts = accountsData?.data ?? [];
  const transactions = (txData?.data ?? []).filter((t: Record<string, unknown>) => {
    if (!search) return true;
    return String(t.description ?? "").toLowerCase().includes(search.toLowerCase());
  });

  const unmatched = transactions.filter((t: Record<string, unknown>) => t.status === "imported");
  const matched = transactions.filter((t: Record<string, unknown>) => t.status === "matched" || t.status === "reconciled");

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        title={t("nav.items.Reconciliation", "Bank Reconciliation")}
        description="Match bank statement transactions with your book entries. Auto-match rules apply first, then manual review."
      />

      {accounts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <p>No bank accounts found.</p>
            <Button asChild className="mt-4" variant="secondary"><Link href="/bank-accounts">Add Bank Account</Link></Button>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-wrap gap-2">
          {accounts.map((a: Record<string, unknown>) => (
            <Button
              key={String(a.id)}
              size="sm"
              variant={selectedAccount === String(a.id) ? "secondary" : "ghost"}
              onClick={() => setSelectedAccount(String(a.id))}
            >
              {String(a.name)}
              <span className="ml-2 text-xs opacity-70">{fmt(Number(a.current_balance ?? 0))}</span>
            </Button>
          ))}
        </div>
      )}

      {selectedAccount && (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Transactions</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold">{transactions.length}</p></CardContent>
            </Card>
            <Card className="border-amber-200 bg-amber-50 dark:bg-amber-950/10">
              <CardHeader className="pb-2"><CardTitle className="text-sm text-amber-600">Unmatched</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold text-amber-600">{unmatched.length}</p></CardContent>
            </Card>
            <Card className="border-green-200 bg-green-50 dark:bg-green-950/10">
              <CardHeader className="pb-2"><CardTitle className="text-sm text-green-600">Matched / Reconciled</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold text-green-600">{matched.length}</p></CardContent>
            </Card>
          </div>

          <div className="flex items-center gap-2">
            <Input
              placeholder="Search transactions..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-72"
            />
            <Button variant="outline" asChild>
              <Link href={`/bank-accounts/${selectedAccount}/reconciliation`}>Open Full Workspace</Link>
            </Button>
          </div>

          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Date</th>
                  <th className="text-left px-4 py-3 font-medium">Description</th>
                  <th className="text-right px-4 py-3 font-medium">Amount</th>
                  <th className="text-center px-4 py-3 font-medium">Status</th>
                  <th className="text-right px-4 py-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {isLoading && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Loading transactions...</td></tr>
                )}
                {!isLoading && transactions.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No transactions found. Import a bank statement to begin.</td></tr>
                )}
                {transactions.map((tx: Record<string, unknown>) => (
                  <tr key={String(tx.id)} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 text-muted-foreground">{String(tx.transaction_date)}</td>
                    <td className="px-4 py-3">{String(tx.description ?? "—")}</td>
                    <td className={`px-4 py-3 text-right font-medium ${Number(tx.amount) < 0 ? "text-red-600" : "text-green-600"}`}>
                      {fmt(Number(tx.amount))}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant={
                        tx.status === "reconciled" ? "default" :
                        tx.status === "matched" ? "secondary" :
                        tx.status === "ignored" ? "outline" : "destructive"
                      }>
                        {String(tx.status)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {tx.status === "imported" && (
                        <Button size="sm" variant="outline">Match</Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
