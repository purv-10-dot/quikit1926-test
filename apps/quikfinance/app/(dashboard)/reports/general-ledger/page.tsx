"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18n";

function fmt(v: number) {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(v);
}

export default function GeneralLedgerPage() {
  const { t } = useI18n();
  const today = new Date().toISOString().split("T")[0];
  const fy = `${new Date().getFullYear()}-04-01`;
  const [from, setFrom] = useState(fy);
  const [to, setTo] = useState(today);
  const [accountId, setAccountId] = useState("");
  const [page, setPage] = useState(1);

  const { data: accountsData } = useQuery({
    queryKey: ["accounts-list"],
    queryFn: async () => {
      const res = await fetch("/api/v1/accounts");
      return res.json();
    }
  });

  const { data, isLoading } = useQuery({
    queryKey: ["general-ledger", from, to, accountId, page],
    queryFn: async () => {
      let url = `/api/v1/reports/general-ledger?from=${from}&to=${to}&page=${page}&limit=100`;
      if (accountId) url += `&account_id=${accountId}`;
      const res = await fetch(url);
      return res.json();
    }
  });

  const rows = data?.data ?? [];
  const meta = data?.meta ?? {};
  const accounts = accountsData?.data ?? [];

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        title={t("nav.items.General Ledger", "General Ledger")}
        description="All posted journal entry lines across accounts for the selected period, with running balance."
      />

      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <Label>From</Label>
          <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
        </div>
        <div className="space-y-1">
          <Label>To</Label>
          <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
        </div>
        <div className="space-y-1">
          <Label>Account</Label>
          <select className="rounded-md border bg-background px-3 py-2 text-sm w-60" value={accountId} onChange={(e) => { setAccountId(e.target.value); setPage(1); }}>
            <option value="">All Accounts</option>
            {accounts.map((a: Record<string, unknown>) => (
              <option key={String(a.id)} value={String(a.id)}>{String(a.code)} — {String(a.name)}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Date</th>
              <th className="text-left px-4 py-3 font-medium">Reference</th>
              <th className="text-left px-4 py-3 font-medium">Account</th>
              <th className="text-left px-4 py-3 font-medium">Description</th>
              <th className="text-right px-4 py-3 font-medium">Debit</th>
              <th className="text-right px-4 py-3 font-medium">Credit</th>
              <th className="text-right px-4 py-3 font-medium">Balance</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading && <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Loading...</td></tr>}
            {!isLoading && rows.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">No posted journal entries for this period.</td></tr>
            )}
            {rows.map((r: Record<string, unknown>, i: number) => {
              const acc = r.account as Record<string, unknown>;
              return (
                <tr key={`${String(r.id)}-${i}`} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">{String(r.date)}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{String(r.reference ?? "—")}</td>
                  <td className="px-4 py-2">
                    {acc && <span className="text-xs"><span className="text-muted-foreground">{String(acc.code)} </span>{String(acc.name)}</span>}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground max-w-xs truncate">{String(r.description ?? "")}</td>
                  <td className="px-4 py-2 text-right">{Number(r.debit) > 0 ? fmt(Number(r.debit)) : "—"}</td>
                  <td className="px-4 py-2 text-right">{Number(r.credit) > 0 ? fmt(Number(r.credit)) : "—"}</td>
                  <td className={`px-4 py-2 text-right font-medium ${Number(r.running_balance) < 0 ? "text-red-600" : ""}`}>
                    {fmt(Number(r.running_balance))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{meta.total ?? 0} entries total</span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
          <span className="px-2 py-1">Page {page}</span>
          <Button size="sm" variant="outline" disabled={rows.length < 100} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      </div>
    </div>
  );
}
