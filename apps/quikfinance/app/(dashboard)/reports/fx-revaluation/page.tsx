"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/shared/PageHeader";
import { formatMoney } from "@/lib/utils/currency";
import { todayISO } from "@/lib/utils/dates";

type Detail = {
  doc_type: string;
  doc_number: string;
  currency: string;
  balance_due: number;
  booked_rate: number;
  current_rate: number;
  booked_base: number;
  current_base: number;
  difference: number;
};
type Result = { as_of: string; base_currency: string; details: Detail[]; net_gain: number; journal_entry_id: string | null };

export default function FxRevaluationPage() {
  const [asOf, setAsOf] = useState(todayISO());
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [posted, setPosted] = useState(false);

  const preview = async () => {
    setBusy(true);
    setPosted(false);
    try {
      const response = await fetch(`/api/v1/reports/fx-revaluation?as_of=${asOf}`);
      const body = (await response.json().catch(() => null)) as { data?: Result; error?: { message?: string } } | null;
      if (!response.ok) {
        toast.error(body?.error?.message ?? "Could not compute the revaluation.");
        return;
      }
      setResult(body?.data ?? null);
    } finally {
      setBusy(false);
    }
  };

  const post = async () => {
    setBusy(true);
    try {
      const response = await fetch("/api/v1/reports/fx-revaluation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ as_of: asOf })
      });
      const body = (await response.json().catch(() => null)) as { data?: Result; error?: { message?: string } } | null;
      if (!response.ok) {
        toast.error(body?.error?.message ?? "Could not post the revaluation.");
        return;
      }
      setResult(body?.data ?? null);
      setPosted(true);
      toast.success(body?.data?.journal_entry_id ? "FX revaluation posted to the ledger." : "Nothing to revalue for this date.");
    } finally {
      setBusy(false);
    }
  };

  const gain = result?.net_gain ?? 0;

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader title="Foreign-currency revaluation" description="Restate open foreign-currency receivables and payables to the period-end rate and post the unrealised gain/loss (account 6900)." />

      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 pt-6">
          <div>
            <Label htmlFor="asof">As of date</Label>
            <Input id="asof" type="date" className="mt-2 w-48" value={asOf} onChange={(event) => setAsOf(event.target.value)} />
          </div>
          <Button onClick={preview} disabled={busy} variant="secondary">Preview</Button>
          <Button onClick={post} disabled={busy || !result || result.details.length === 0}>Post revaluation</Button>
        </CardContent>
      </Card>

      {result ? (
        <Card>
          <CardHeader>
            <CardTitle>
              Revaluation as of {result.as_of} · base {result.base_currency}
              <span className={`ml-3 text-sm font-semibold ${gain >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                Net {gain >= 0 ? "gain" : "loss"}: {formatMoney(Math.abs(gain))}
              </span>
              {posted && result.journal_entry_id ? <span className="ml-2 text-xs text-muted-foreground">(posted)</span> : null}
            </CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            {result.details.length === 0 ? (
              <p className="text-sm text-muted-foreground">No open foreign-currency documents to revalue (or no exchange rate available for this date — add one under Settings → Currencies).</p>
            ) : (
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-muted/60 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Document</th>
                    <th className="px-3 py-2 text-left">Type</th>
                    <th className="px-3 py-2 text-right">Balance</th>
                    <th className="px-3 py-2 text-right">Booked rate</th>
                    <th className="px-3 py-2 text-right">Current rate</th>
                    <th className="px-3 py-2 text-right">Booked base</th>
                    <th className="px-3 py-2 text-right">Current base</th>
                    <th className="px-3 py-2 text-right">Gain/(loss)</th>
                  </tr>
                </thead>
                <tbody>
                  {result.details.map((detail) => (
                    <tr key={`${detail.doc_type}-${detail.doc_number}`} className="border-t">
                      <td className="px-3 py-2 font-medium">{detail.doc_number}</td>
                      <td className="px-3 py-2 capitalize text-muted-foreground">{detail.doc_type}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{detail.currency} {detail.balance_due.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{detail.booked_rate}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{detail.current_rate}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatMoney(detail.booked_base)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatMoney(detail.current_base)}</td>
                      <td className={`px-3 py-2 text-right tabular-nums ${detail.difference >= 0 ? "text-emerald-600" : "text-red-600"}`}>{formatMoney(detail.difference)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
