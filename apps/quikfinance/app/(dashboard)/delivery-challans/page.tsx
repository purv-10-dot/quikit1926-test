"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { PageHeader } from "@/components/shared/PageHeader";
import { Badge } from "@/components/ui/badge";
import { useCurrency } from "@/lib/currency";

const STATUS_COLORS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "secondary",
  open: "default",
  delivered: "default",
  invoiced: "outline",
  returned: "secondary",
  cancelled: "destructive"
};

const TYPE_LABELS: Record<string, string> = {
  supply_on_approval: "Supply on approval",
  job_work: "Job work",
  supply_of_liquid_gas: "Liquid gas",
  lines_sales: "Line sales",
  others: "Others"
};

export default function DeliveryChallansPage() {
  const { format } = useCurrency();
  const { data, isLoading } = useQuery({
    queryKey: ["delivery-challans"],
    queryFn: async () => {
      const res = await fetch("/api/v1/delivery-challans?limit=100");
      return res.json();
    }
  });

  const rows = (data?.data ?? []) as Array<Record<string, unknown>>;

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader
        title="Delivery Challans"
        description="Dispatch notes for goods sent to customers. Non-posting until converted to an invoice."
        actionLabel="New challan"
        actionHref="/delivery-challans/new"
      />

      <div className="overflow-hidden rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Date</th>
              <th className="px-4 py-3 text-left font-medium">Location</th>
              <th className="px-4 py-3 text-left font-medium">Challan #</th>
              <th className="px-4 py-3 text-left font-medium">Reference#</th>
              <th className="px-4 py-3 text-left font-medium">Customer Name</th>
              <th className="px-4 py-3 text-left font-medium">Challan Type</th>
              <th className="px-4 py-3 text-center font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading && <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">Loading…</td></tr>}
            {!isLoading && rows.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-12 text-center text-muted-foreground">
                <p className="font-medium">No delivery challans yet.</p>
                <p className="mt-1 text-xs">Create a challan when you dispatch goods before invoicing.</p>
              </td></tr>
            )}
            {rows.map((r) => (
              <tr key={String(r.id)} className="transition-colors hover:bg-muted/30">
                <td className="px-4 py-3 text-muted-foreground">{String(r.challan_date)}</td>
                <td className="px-4 py-3 text-muted-foreground">{r.location ? String(r.location) : "—"}</td>
                <td className="px-4 py-3">
                  <Link href={`/delivery-challans/${r.id}`} className="font-medium text-primary hover:underline">{String(r.challan_number)}</Link>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{r.reference ? String(r.reference) : "—"}</td>
                <td className="px-4 py-3">{String(r.customer ?? "—")}</td>
                <td className="px-4 py-3 text-muted-foreground">{TYPE_LABELS[String(r.challan_type)] ?? String(r.challan_type)}</td>
                <td className="px-4 py-3 text-center">
                  <Badge variant={STATUS_COLORS[String(r.status)] ?? "secondary"}>{String(r.status)}</Badge>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{format(Number(r.total ?? 0))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
