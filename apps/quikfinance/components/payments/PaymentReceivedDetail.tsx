"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, X, Mail, FileText, RotateCcw, Ban, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCurrency } from "@/lib/currency";

type Payment = Record<string, unknown> & {
  payment_number?: string; payment_date?: string; reference?: string | null; method?: string; status?: string;
  contact_id?: string; customer_name?: string; customer_email?: string | null; location?: string | null; deposit_account?: string | null;
  billing_address?: Record<string, unknown> | null;
  amount?: number | string; unapplied_amount?: number | string; refunded_amount?: number | string;
  allocations?: Array<Record<string, unknown>>; journal?: Array<Record<string, unknown>>;
};

async function getJson(path: string) { const r = await fetch(path); return r.ok ? r.json() : null; }
function addrLines(a?: Record<string, unknown> | null): string[] {
  if (!a) return [];
  return [a.line1, a.line2, a.landmark, [a.city, a.state].filter(Boolean).join(", "), [a.country, a.postal_code].filter(Boolean).join(" "), a.phone].map((x) => (x ? String(x) : "")).filter(Boolean);
}

export function PaymentReceivedDetail({ id }: { id: string }) {
  const { format } = useCurrency();
  const router = useRouter();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  const { data: p, isPending } = useQuery<Payment | null>({
    queryKey: ["payment", id],
    queryFn: async () => (await getJson(`/api/v1/payments/${id}/receipt`))?.data ?? null
  });

  const act = async (path: string, msg: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/payments/${id}/${path}`, { method: "POST" });
      const payload = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!res.ok) { toast.error(payload?.error?.message ?? "Action failed."); return; }
      toast.success(msg);
      qc.invalidateQueries({ queryKey: ["payment", id] });
      qc.invalidateQueries({ queryKey: ["module", "payments-received"] });
    } finally { setBusy(false); }
  };
  const voidPayment = () => { if (window.confirm("Void this payment? Its journal and allocations will be reversed.")) act("void", "Payment voided."); };
  const remove = async () => {
    if (!window.confirm("Delete this payment? This cannot be undone.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/payments/${id}`, { method: "DELETE" });
      if (!res.ok) { toast.error("Could not delete the payment."); return; }
      toast.success("Payment deleted.");
      qc.invalidateQueries({ queryKey: ["module", "payments-received"] });
      router.push("/payments/received");
    } finally { setBusy(false); }
  };

  if (isPending) return <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!p) return <div className="rounded-lg border bg-card p-6 text-sm"><p className="font-medium">Payment not found.</p><Link href="/payments/received" className="mt-3 inline-block text-primary hover:underline">← Back to payments received</Link></div>;

  const allocations = p.allocations ?? [];
  const journal = p.journal ?? [];
  const billing = addrLines(p.billing_address);
  const amount = Number(p.amount ?? 0);
  const unused = Number(p.unapplied_amount ?? 0);

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex items-start justify-between gap-4">
        <div>
          {p.location ? <p className="text-xs text-muted-foreground">Location: {String(p.location)}</p> : null}
          <h1 className="text-2xl font-bold">{String(p.payment_number ?? "Payment")}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild size="sm" variant="secondary"><Link href={`/payments/received/${id}/edit`}><Pencil className="mr-1 h-4 w-4" />Edit</Link></Button>
          <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => act("email", "Receipt emailed to the customer.")}><Mail className="mr-1 h-4 w-4" />Send</Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => window.open(`/api/v1/payments/${id}/pdf`, "_blank", "noopener")}><FileText className="mr-1 h-4 w-4" />PDF/Print</Button>
          <Button type="button" size="sm" variant="secondary" disabled={busy || unused <= 0} onClick={() => act("refund", "Refund recorded.")}><RotateCcw className="mr-1 h-4 w-4" />Refund</Button>
          {p.status !== "void" ? <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={voidPayment}><Ban className="mr-1 h-4 w-4" />Void</Button> : null}
          <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={remove}><Trash2 className="mr-1 h-4 w-4" />Delete</Button>
          <Button asChild size="sm" variant="ghost"><Link href="/payments/received" aria-label="Close"><X className="h-4 w-4" /></Link></Button>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-8">
        <h2 className="mb-6 text-center text-xl font-bold tracking-wide">PAYMENT RECEIPT</h2>
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="space-y-3 text-sm">
            <Field k="Payment Date" v={p.payment_date} strong />
            <Field k="Payment#" v={p.payment_number} />
            <Field k="Reference Number" v={p.reference} />
            <Field k="Payment Mode" v={p.method} strong />
            <Field k="Deposit To" v={p.deposit_account} />
            {Number(p.bank_charges ?? 0) ? <Field k="Bank Charges" v={format(Number(p.bank_charges))} /> : null}
            {Number(p.tds_amount ?? 0) ? <Field k="TDS Deducted" v={format(Number(p.tds_amount))} /> : null}
          </div>
          <div className="rounded-lg bg-emerald-600 px-6 py-4 text-center text-white">
            <p className="text-xs uppercase tracking-wide">Amount Received</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{format(amount)}</p>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap items-start justify-between gap-6">
          <div className="text-sm">
            <p className="text-muted-foreground">Received From</p>
            {p.contact_id ? <Link href={`/customers/${p.contact_id}`} className="font-semibold text-primary hover:underline">{String(p.customer_name ?? "—")}</Link> : <p className="font-semibold">{String(p.customer_name ?? "—")}</p>}
            {billing.map((l, i) => <p key={i} className="text-muted-foreground">{l}</p>)}
          </div>
          <Badge variant={p.status === "void" ? "destructive" : "default"}>{String(p.status ?? "posted")}</Badge>
        </div>

        {allocations.length ? (
          <div className="mt-8">
            <p className="mb-2 text-sm font-semibold">Payment for</p>
            <div className="overflow-hidden rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-2 text-left">Invoice#</th><th className="px-4 py-2 text-left">Date</th><th className="px-4 py-2 text-right">Invoice Amount</th><th className="px-4 py-2 text-right">Payment</th></tr></thead>
                <tbody className="divide-y">
                  {allocations.map((a, i) => (
                    <tr key={i}>
                      <td className="px-4 py-2"><Link href={`/invoices/${a.invoice_id}`} className="text-primary hover:underline">{String(a.invoice_number ?? "—")}</Link></td>
                      <td className="px-4 py-2">{String(a.invoice_date ?? "—")}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{format(Number(a.invoice_total ?? 0))}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{format(Number(a.amount ?? 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {unused > 0 ? <p className="mt-6 text-sm">Over payment <span className="ml-2 font-semibold tabular-nums">{format(unused)}</span> <span className="text-muted-foreground">(unused — can be applied to invoices or refunded)</span></p> : null}
      </div>

      {journal.length ? (
        <div className="rounded-lg border bg-card p-6">
          <p className="mb-2 text-sm font-semibold">Journal</p>
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-2 text-left">Account</th><th className="px-4 py-2 text-right">Debit</th><th className="px-4 py-2 text-right">Credit</th></tr></thead>
              <tbody className="divide-y">
                {journal.map((j, i) => (
                  <tr key={i}><td className="px-4 py-2">{String(j.account ?? "—")}{j.account_code ? <span className="ml-1 text-xs text-muted-foreground">({String(j.account_code)})</span> : null}</td><td className="px-4 py-2 text-right tabular-nums">{Number(j.debit ?? 0) ? format(Number(j.debit)) : ""}</td><td className="px-4 py-2 text-right tabular-nums">{Number(j.credit ?? 0) ? format(Number(j.credit)) : ""}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Field({ k, v, strong }: { k: string; v: unknown; strong?: boolean }) {
  return (
    <div className="flex gap-3">
      <span className="w-36 text-muted-foreground">{k}</span>
      <span className={strong ? "font-semibold" : ""}>{v != null && v !== "" ? String(v) : "—"}</span>
    </div>
  );
}
