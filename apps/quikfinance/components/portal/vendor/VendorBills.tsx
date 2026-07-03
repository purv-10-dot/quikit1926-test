"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Receipt, Send, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils/cn";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionHeader, WidgetCard, EmptyState } from "@/components/portal/widgets";

type PO = { id: string; purchase_order_number: string; total: string; status: string };
type Bill = { id: string; bill_number: string; issue_date: string | null; due_date: string | null; total: string; balance_due: string; status: string };

const BILLABLE = ["accepted", "partially_accepted", "issued"];
const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString() : "—");

export function VendorBills() {
  const { format } = useCurrency();
  const qc = useQueryClient();
  const [poId, setPoId] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: pos } = useQuery({
    queryKey: ["vendor-pos"],
    queryFn: async () => {
      const r = await fetch("/api/v1/portal/vendor/list?type=pos");
      return r.ok ? ((await r.json()).data as PO[]) : [];
    }
  });
  const { data: bills, isPending } = useQuery({
    queryKey: ["vendor-bills"],
    queryFn: async () => {
      const r = await fetch("/api/v1/portal/vendor/list?type=bills");
      return r.ok ? ((await r.json()).data as Bill[]) : [];
    }
  });

  const billablePos = useMemo(() => (pos ?? []).filter((p) => BILLABLE.includes(p.status)), [pos]);
  const selectedPo = billablePos.find((p) => p.id === poId);

  const submit = async () => {
    if (!poId) { toast.error("Select a purchase order."); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/v1/portal/vendor/bills", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ poId, amount: amount ? Number(amount) : undefined })
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body?.error?.message ?? "Submit failed");
      toast.success(body.data?.message ?? "Bill submitted for approval.");
      setPoId(""); setAmount("");
      qc.invalidateQueries({ queryKey: ["vendor-bills"] });
      qc.invalidateQueries({ queryKey: ["vendor-dashboard"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Submit failed"); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-5 animate-fade-up">
      <SectionHeader title="Bills" description="Submit a bill against an accepted PO and track its status" />

      <WidgetCard title="Submit a bill">
        <div className="grid items-end gap-3 px-5 py-4 sm:grid-cols-[1fr_160px_auto]">
          <div>
            <Label>Against purchase order</Label>
            <div className="mt-1">
              <Combobox value={poId} onChange={setPoId} placeholder={billablePos.length ? "Select an accepted PO" : "No accepted POs to bill"}
                options={billablePos.map((p) => ({ value: p.id, label: `${p.purchase_order_number} · ${format(Number(p.total))}` }))} />
            </div>
          </div>
          <div>
            <Label>Amount</Label>
            <Input className="mt-1" type="number" min="0" step="0.01" placeholder={selectedPo ? String(selectedPo.total) : "0.00"} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <Button onClick={submit} disabled={busy || !poId}>{busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}Submit</Button>
        </div>
        <p className="border-t px-5 py-2.5 text-xs text-muted-foreground">Submitted bills are created as a draft for the customer's review before posting — they don't affect their ledger until approved.</p>
      </WidgetCard>

      <WidgetCard title="Your bills">
        {isPending ? (
          <div className="space-y-2 p-5">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}</div>
        ) : (bills ?? []).length === 0 ? (
          <EmptyState icon={Receipt} title="No bills yet" hint="Submit a bill against an accepted PO above." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th className="px-5 py-2.5 text-left">Bill #</th><th className="px-5 py-2.5 text-left">Date</th><th className="px-5 py-2.5 text-right">Total</th><th className="px-5 py-2.5 text-right">Balance</th><th className="px-5 py-2.5 text-center">Status</th></tr>
              </thead>
              <tbody className="divide-y">
                {bills!.map((b) => {
                  const display = b.status === "draft" ? "Pending approval" : b.status;
                  return (
                    <tr key={b.id} className="hover:bg-muted/40">
                      <td className="px-5 py-2.5 font-medium text-primary">{b.bill_number}</td>
                      <td className="px-5 py-2.5 text-muted-foreground">{fmtDate(b.issue_date)}</td>
                      <td className="px-5 py-2.5 text-right tabular-nums">{format(Number(b.total))}</td>
                      <td className="px-5 py-2.5 text-right tabular-nums">{format(Number(b.balance_due))}</td>
                      <td className="px-5 py-2.5 text-center"><span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium capitalize", b.status === "paid" ? "bg-emerald-100 text-emerald-700" : b.status === "draft" ? "bg-slate-100 text-slate-600" : "bg-amber-100 text-amber-700")}>{display}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </WidgetCard>
    </div>
  );
}
