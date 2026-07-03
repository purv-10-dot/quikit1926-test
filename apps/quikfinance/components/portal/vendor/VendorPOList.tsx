"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Package, Check, X, SplitSquareHorizontal, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils/cn";
import { Skeleton } from "@/components/ui/skeleton";
import { SectionHeader, EmptyState } from "@/components/portal/widgets";

type PO = { id: string; purchase_order_number: string; issue_date: string | null; due_date: string | null; total: string; status: string };

const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString() : "—");
const RESPONDED = ["accepted", "rejected", "partially_accepted", "billed", "cancelled"];

export function VendorPOList() {
  const { format } = useCurrency();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const { data, isPending } = useQuery({
    queryKey: ["vendor-pos"],
    queryFn: async () => {
      const r = await fetch("/api/v1/portal/vendor/list?type=pos");
      return r.ok ? ((await r.json()).data as PO[]) : [];
    }
  });

  const respond = async (id: string, action: "accept" | "reject" | "partial") => {
    setBusy(id + action);
    try {
      const r = await fetch(`/api/v1/portal/vendor/po/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
      if (!r.ok) throw new Error((await r.json())?.error?.message ?? "Failed");
      toast.success(`Purchase order ${action === "accept" ? "accepted" : action === "reject" ? "rejected" : "partially accepted"}.`);
      qc.invalidateQueries({ queryKey: ["vendor-pos"] });
      qc.invalidateQueries({ queryKey: ["vendor-dashboard"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(null); }
  };

  return (
    <div className="space-y-5 animate-fade-up">
      <SectionHeader title="Purchase Orders" description="Accept, reject or partially accept POs raised to you" />
      <div className="overflow-hidden rounded-2xl border bg-card shadow-card">
        {isPending ? (
          <div className="space-y-2 p-5">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : (data ?? []).length === 0 ? (
          <EmptyState icon={Package} title="No purchase orders yet" hint="POs raised to you will appear here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr><th className="px-5 py-2.5 text-left">PO #</th><th className="px-5 py-2.5 text-left">Date</th><th className="px-5 py-2.5 text-right">Amount</th><th className="px-5 py-2.5 text-center">Status</th><th className="px-5 py-2.5 text-right">Respond</th></tr>
              </thead>
              <tbody className="divide-y">
                {data!.map((po) => {
                  const responded = RESPONDED.includes(po.status);
                  return (
                    <tr key={po.id} className="hover:bg-muted/40">
                      <td className="px-5 py-2.5 font-medium text-primary">{po.purchase_order_number}</td>
                      <td className="px-5 py-2.5 text-muted-foreground">{fmtDate(po.issue_date)}</td>
                      <td className="px-5 py-2.5 text-right tabular-nums">{format(Number(po.total))}</td>
                      <td className="px-5 py-2.5 text-center"><span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium capitalize", po.status === "accepted" ? "bg-emerald-100 text-emerald-700" : po.status === "rejected" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700")}>{po.status?.replace(/_/g, " ")}</span></td>
                      <td className="px-5 py-2.5">
                        {responded ? <span className="block text-right text-xs text-muted-foreground">Responded</span> : (
                          <div className="flex justify-end gap-1.5">
                            <button onClick={() => respond(po.id, "accept")} disabled={!!busy} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50">{busy === po.id + "accept" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}Accept</button>
                            <button onClick={() => respond(po.id, "partial")} disabled={!!busy} className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50">{busy === po.id + "partial" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <SplitSquareHorizontal className="h-3.5 w-3.5" />}Partial</button>
                            <button onClick={() => respond(po.id, "reject")} disabled={!!busy} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50">{busy === po.id + "reject" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}Reject</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
