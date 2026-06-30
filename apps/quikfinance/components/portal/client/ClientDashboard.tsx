"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Wallet, Receipt, FileText, ShoppingCart, CreditCard, Megaphone } from "lucide-react";
import { useCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils/cn";
import { Kpi, WidgetCard, SectionHeader, EmptyState, QuickActions, Timeline } from "@/components/portal/widgets";

type Dash = {
  noContact?: boolean;
  kpis: { outstanding: number; openInvoices: number; openQuotes: number; openOrders: number; recentPaid: number };
  recentInvoices: Array<{ id: string; invoice_number: string; total: string; balance_due: string; status: string; issue_date: string | null; due_date: string | null }>;
  recentPayments: Array<{ id: string; payment_number: string; amount: string; payment_date: string | null; status: string }>;
  openQuotes: Array<{ id: string; quotation_number: string; total: string; status: string }>;
  openOrders: Array<{ id: string; total: string; status: string }>;
};

const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString() : "—");

export function ClientDashboard() {
  const { format } = useCurrency();
  const { data, isPending } = useQuery({
    queryKey: ["client-dashboard"],
    queryFn: async () => {
      const r = await fetch("/api/v1/portal/client/dashboard");
      return r.ok ? ((await r.json()).data as Dash) : null;
    }
  });

  if (data?.noContact) {
    return <EmptyState icon={Wallet} title="No customer account linked" hint="Your login isn't yet linked to a customer record. Contact your account manager." />;
  }

  const k = data?.kpis;

  return (
    <div className="space-y-6 animate-fade-up">
      <SectionHeader title="Welcome back" description="Your account at a glance" actions={
        <QuickActions actions={[
          { label: "Pay now", href: "/client/finance/payments", icon: CreditCard },
          { label: "View invoices", href: "/client/sales/invoices", icon: Receipt },
          { label: "Statement", href: "/client/finance/statement", icon: FileText }
        ]} />
      } />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Outstanding balance" value={format(k?.outstanding ?? 0)} sub={`${k?.openInvoices ?? 0} open invoices`} icon={Wallet} tone={(k?.outstanding ?? 0) > 0 ? "rose" : "emerald"} loading={isPending} />
        <Kpi label="Paid recently" value={format(k?.recentPaid ?? 0)} sub="Last 5 payments" icon={CreditCard} tone="emerald" loading={isPending} />
        <Kpi label="Open quotes" value={k?.openQuotes ?? 0} sub="Awaiting your decision" icon={FileText} tone="indigo" loading={isPending} />
        <Kpi label="Open orders" value={k?.openOrders ?? 0} sub="In progress" icon={ShoppingCart} tone="amber" loading={isPending} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <WidgetCard title="Recent invoices" href="/client/sales/invoices">
          {(data?.recentInvoices ?? []).length === 0 ? <EmptyState icon={Receipt} title="No invoices yet" /> : (
            <table className="w-full text-sm">
              <tbody className="divide-y">
                {data!.recentInvoices.map((i) => (
                  <tr key={i.id} className="hover:bg-muted/40">
                    <td className="px-5 py-2.5"><Link href={`/client/sales/invoices`} className="font-medium text-primary hover:underline">{i.invoice_number}</Link><p className="text-xs text-muted-foreground">{fmtDate(i.issue_date)}</p></td>
                    <td className="px-5 py-2.5 text-right tabular-nums">{format(Number(i.total))}</td>
                    <td className="px-5 py-2.5 text-right"><StatusPill status={Number(i.balance_due) > 0 ? "due" : "paid"} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </WidgetCard>

        <WidgetCard title="Recent payments" href="/client/finance/payments">
          {(data?.recentPayments ?? []).length === 0 ? <EmptyState icon={CreditCard} title="No payments yet" /> : (
            <table className="w-full text-sm">
              <tbody className="divide-y">
                {data!.recentPayments.map((p) => (
                  <tr key={p.id} className="hover:bg-muted/40">
                    <td className="px-5 py-2.5"><span className="font-medium">{p.payment_number ?? "Payment"}</span><p className="text-xs text-muted-foreground">{fmtDate(p.payment_date)}</p></td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-emerald-600">{format(Number(p.amount))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </WidgetCard>

        <WidgetCard title="Open quotes" href="/client/sales/quotes">
          {(data?.openQuotes ?? []).length === 0 ? <EmptyState icon={FileText} title="No open quotes" /> : (
            <table className="w-full text-sm">
              <tbody className="divide-y">
                {data!.openQuotes.map((q) => (
                  <tr key={q.id} className="hover:bg-muted/40">
                    <td className="px-5 py-2.5"><Link href="/client/sales/quotes" className="font-medium text-primary hover:underline">{q.quotation_number}</Link></td>
                    <td className="px-5 py-2.5 text-right tabular-nums">{format(Number(q.total))}</td>
                    <td className="px-5 py-2.5 text-right"><StatusPill status={q.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </WidgetCard>

        <WidgetCard title="Announcements">
          <Timeline items={[
            { title: "Welcome to your self-service portal", meta: "QuikFinance", time: "Today", tone: "emerald" },
            { title: "Online payments are now available", meta: "Finance", time: "This week" }
          ]} />
        </WidgetCard>
      </div>

      <WidgetCard title="Announcements & updates" action={<span className="text-xs text-muted-foreground">From your supplier</span>}>
        <div className="flex items-start gap-3 px-5 py-4 text-sm">
          <Megaphone className="mt-0.5 h-5 w-5 text-primary" />
          <p className="text-muted-foreground">Keep your billing and shipping addresses up to date in <Link href="/client/profile" className="text-primary hover:underline">Profile</Link> to avoid delivery delays.</p>
        </div>
      </WidgetCard>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const s = status.toLowerCase();
  const tone = ["paid", "accepted", "completed"].includes(s) ? "emerald" : ["due", "overdue", "rejected", "declined"].includes(s) ? "rose" : "amber";
  const cls = { emerald: "bg-emerald-100 text-emerald-700", rose: "bg-rose-100 text-rose-700", amber: "bg-amber-100 text-amber-700" }[tone];
  return <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium capitalize", cls)}>{status}</span>;
}
