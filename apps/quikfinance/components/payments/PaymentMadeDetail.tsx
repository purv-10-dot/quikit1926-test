"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, X, FileText, Ban, Trash2, BookOpen, Paperclip, Mail, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCurrency } from "@/lib/currency";

type Payment = Record<string, unknown> & {
  payment_number?: string; payment_date?: string; reference?: string | null; method?: string; status?: string;
  contact_id?: string; customer_name?: string; location?: string | null; deposit_account?: string | null; memo?: string | null;
  billing_address?: Record<string, unknown> | null;
  amount?: number | string; unapplied_amount?: number | string;
  bill_allocations?: Array<Record<string, unknown>>; journal?: Array<Record<string, unknown>>; attachments?: Array<Record<string, unknown>>;
};

async function getJson(path: string) { const r = await fetch(path); return r.ok ? r.json() : null; }
function addrLines(a?: Record<string, unknown> | null): string[] {
  if (!a) return [];
  return [a.line1, a.line2, [a.city, a.state].filter(Boolean).join(", "), [a.country, a.postal_code].filter(Boolean).join(" ")].map((x) => (x ? String(x) : "")).filter(Boolean);
}

export function PaymentMadeDetail({ id }: { id: string }) {
  const { format } = useCurrency();
  const router = useRouter();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [showJournal, setShowJournal] = useState(false);

  const { data: p, isPending } = useQuery<Payment | null>({
    queryKey: ["payment", id],
    queryFn: async () => (await getJson(`/api/v1/payments/${id}/receipt`))?.data ?? null
  });

  if (isPending) return <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!p) return <div className="rounded-lg border bg-card p-6 text-sm"><p className="font-medium">Payment not found.</p><Link href="/payments/made" className="mt-3 inline-block text-primary hover:underline">← Back to payments made</Link></div>;

  const allocations = p.bill_allocations ?? [];
  const journal = p.journal ?? [];
  const attachments = p.attachments ?? [];
  const billing = addrLines(p.billing_address);
  const amount = Number(p.amount ?? 0);
  const status = String(p.status ?? "posted");

  const voidPayment = async () => {
    if (!window.confirm("Void this payment? Its journal and allocations will be reversed.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/payments/${id}/void`, { method: "POST" });
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!res.ok) { toast.error(body?.error?.message ?? "Could not void the payment."); return; }
      toast.success("Payment voided.");
      qc.invalidateQueries({ queryKey: ["payment", id] });
      qc.invalidateQueries({ queryKey: ["module", "payments-made"] });
    } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!window.confirm("Delete this payment? This cannot be undone.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/payments/${id}`, { method: "DELETE" });
      if (!res.ok) { toast.error("Could not delete the payment."); return; }
      toast.success("Payment deleted.");
      qc.invalidateQueries({ queryKey: ["module", "payments-made"] });
      router.push("/payments/made");
    } finally { setBusy(false); }
  };
  const sendEmail = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/payments/${id}/email`, { method: "POST" });
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!res.ok) { toast.error(body?.error?.message ?? "Could not send the email."); return; }
      toast.success("Payment emailed to the vendor.");
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex items-start justify-between gap-4">
        <div>
          {p.location ? <p className="text-xs text-muted-foreground">Location: {String(p.location)}</p> : null}
          <h1 className="text-2xl font-bold">{String(p.payment_number ?? "Payment")}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild size="sm" variant="secondary"><Link href={`/payments/made/${id}/edit`}><Pencil className="mr-1 h-4 w-4" />Edit</Link></Button>
          <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={sendEmail}><Mail className="mr-1 h-4 w-4" />Send Email</Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => window.open(`/api/v1/payments/${id}/pdf`, "_blank", "noopener")}><FileText className="mr-1 h-4 w-4" />PDF/Print</Button>
          <Menu items={[
            { label: "View Journal", icon: <BookOpen className="h-4 w-4" />, onSelect: () => setShowJournal((v) => !v) },
            ...(status !== "void" ? [{ label: "Void", icon: <Ban className="h-4 w-4" />, onSelect: voidPayment }] : []),
            { label: "Delete", icon: <Trash2 className="h-4 w-4" />, onSelect: remove }
          ]} />
          <Button asChild size="sm" variant="ghost"><Link href="/payments/made" aria-label="Close"><X className="h-4 w-4" /></Link></Button>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-8">
        <h2 className="mb-6 text-center text-xl font-bold tracking-wide">PAYMENT MADE</h2>
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="space-y-3 text-sm">
            <Field k="Payment Date" v={p.payment_date} strong />
            <Field k="Payment#" v={p.payment_number} />
            <Field k="Reference Number" v={p.reference} />
            <Field k="Payment Mode" v={p.method} strong />
            <Field k="Paid Through" v={p.deposit_account} />
          </div>
          <div className="rounded-lg bg-sky-600 px-6 py-4 text-center text-white">
            <p className="text-xs uppercase tracking-wide">Amount Paid</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{format(amount)}</p>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap items-start justify-between gap-6">
          <div className="text-sm">
            <p className="text-muted-foreground">Paid To</p>
            {p.contact_id ? <Link href={`/vendors/${p.contact_id}`} className="font-semibold text-primary hover:underline">{String(p.customer_name ?? "—")}</Link> : <p className="font-semibold">{String(p.customer_name ?? "—")}</p>}
            {billing.map((l, i) => <p key={i} className="text-muted-foreground">{l}</p>)}
          </div>
          <Badge variant={status === "void" ? "destructive" : "success"}>{status}</Badge>
        </div>

        {allocations.length ? (
          <div className="mt-8">
            <p className="mb-2 text-sm font-semibold">Payment for</p>
            <div className="overflow-hidden rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-2 text-left">Bill#</th><th className="px-4 py-2 text-left">Date</th><th className="px-4 py-2 text-right">Bill Amount</th><th className="px-4 py-2 text-right">Payment</th></tr></thead>
                <tbody className="divide-y">
                  {allocations.map((a, i) => (
                    <tr key={i}>
                      <td className="px-4 py-2"><Link href={`/bills/${a.bill_id}`} className="text-primary hover:underline">{String(a.bill_number ?? "—")}</Link></td>
                      <td className="px-4 py-2">{String(a.bill_date ?? "—")}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{format(Number(a.bill_total ?? 0))}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{format(Number(a.amount ?? 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {Number(p.unapplied_amount ?? 0) > 0 ? <p className="mt-6 text-sm">Amount in Excess <span className="ml-2 font-semibold tabular-nums">{format(Number(p.unapplied_amount))}</span> <span className="text-muted-foreground">(recorded as a vendor advance)</span></p> : null}
        {p.memo ? <div className="mt-6 text-sm"><p className="text-muted-foreground">Notes</p><p>{String(p.memo)}</p></div> : null}

        {attachments.length ? (
          <div className="mt-6">
            <p className="mb-2 text-sm font-semibold">Attachments <span className="text-muted-foreground">({attachments.length})</span></p>
            <ul className="divide-y rounded-md border">
              {attachments.map((a, i) => (
                <li key={i} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="flex items-center gap-2 truncate"><Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" /><span className="truncate">{String(a.file_name)}</span></span>
                  <a href={String(a.file_path)} download={String(a.file_name)} target="_blank" rel="noreferrer" className="shrink-0 text-primary hover:underline">Download</a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {showJournal ? (
        <div className="rounded-lg border bg-card p-6">
          <p className="mb-2 text-sm font-semibold">Journal</p>
          {journal.length ? (
            <div className="overflow-hidden rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-2 text-left">Account</th><th className="px-4 py-2 text-right">Debit</th><th className="px-4 py-2 text-right">Credit</th></tr></thead>
                <tbody className="divide-y">
                  {journal.map((j, i) => (
                    <tr key={i}><td className="px-4 py-2">{String(j.account ?? "—")}</td><td className="px-4 py-2 text-right tabular-nums">{Number(j.debit ?? 0) ? format(Number(j.debit)) : ""}</td><td className="px-4 py-2 text-right tabular-nums">{Number(j.credit ?? 0) ? format(Number(j.credit)) : ""}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="text-sm text-muted-foreground">No journal entry (voided payments have none).</p>}
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

function Menu({ items }: { items: { label: string; icon?: React.ReactNode; onSelect: () => void }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <Button type="button" size="sm" variant="secondary" onClick={() => setOpen((o) => !o)} onBlur={() => setTimeout(() => setOpen(false), 150)}><span className="px-1 text-base leading-none">⋯</span><ChevronDown className="ml-1 h-4 w-4" /></Button>
      {open ? (
        <div className="absolute right-0 z-10 mt-1 min-w-[180px] rounded-md border bg-popover p-1 shadow-md">
          {items.map((it) => (
            <button key={it.label} type="button" onMouseDown={() => { it.onSelect(); setOpen(false); }} className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm hover:bg-muted">{it.icon}{it.label}</button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
