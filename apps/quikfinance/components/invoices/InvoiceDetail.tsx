"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, X, ChevronDown, Mail, MessageSquare, Share2, Printer, FileText, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils/cn";

type Invoice = Record<string, unknown> & {
  invoice_number?: string; order_number?: string | null; status?: string;
  issue_date?: string; due_date?: string; salesperson?: string | null; location?: string | null;
  contact_id?: string; customer_name?: string; customer_email?: string | null;
  billing_address?: Record<string, unknown> | null; shipping_address?: Record<string, unknown> | null;
  subtotal?: number | string; discount_total?: number | string; tax_total?: number | string;
  round_off?: number | string; tcs_amount?: number | string; total?: number | string; balance_due?: number | string;
  notes?: string | null; terms?: string | null;
  line_items?: Array<Record<string, unknown>>;
  journal?: Array<Record<string, unknown>>;
  payments?: Array<Record<string, unknown>>;
};

const TABS = ["Invoice Details", "Journal"] as const;
type Tab = (typeof TABS)[number];

async function getJson(path: string) {
  const r = await fetch(path);
  return r.ok ? r.json() : null;
}
function addrLines(a?: Record<string, unknown> | null): string[] {
  if (!a) return [];
  return [a.line1, a.line2, a.landmark, [a.city, a.state].filter(Boolean).join(", "), [a.country, a.postal_code].filter(Boolean).join(" "), a.phone]
    .map((x) => (x ? String(x) : "")).filter(Boolean);
}

export function InvoiceDetail({ id }: { id: string }) {
  const { format } = useCurrency();
  const [tab, setTab] = useState<Tab>("Invoice Details");

  const { data: invoice, isPending } = useQuery<Invoice | null>({
    queryKey: ["invoice", id],
    queryFn: async () => (await getJson(`/api/v1/invoices/${id}`))?.data ?? null
  });

  if (isPending) return <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!invoice)
    return <div className="rounded-lg border bg-card p-6 text-sm"><p className="font-medium">Invoice not found.</p><Link href="/invoices" className="mt-3 inline-block text-primary hover:underline">← Back to invoices</Link></div>;

  const lines = invoice.line_items ?? [];
  const journal = invoice.journal ?? [];
  const payments = invoice.payments ?? [];
  const billing = addrLines(invoice.billing_address);
  const shipping = addrLines(invoice.shipping_address);
  const balance = Number(invoice.balance_due ?? 0);
  const roundOff = Number(invoice.round_off ?? 0);

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex items-start justify-between gap-4">
        <div>
          {invoice.location ? <p className="text-xs text-muted-foreground">Location: {String(invoice.location)}</p> : null}
          <h1 className="text-2xl font-bold">{String(invoice.invoice_number ?? "Invoice")}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild size="sm" variant="secondary"><Link href={`/invoices/${id}/edit`}><Pencil className="mr-1 h-4 w-4" />Edit</Link></Button>
          <SendMenu id={id} />
          <ShareButton id={id} />
          <PdfMenu id={id} />
          <RecordPaymentButton id={id} contactId={String(invoice.contact_id ?? "")} balance={balance} disabled={balance <= 0} />
          <Button asChild size="sm" variant="ghost"><Link href="/invoices" aria-label="Close"><X className="h-4 w-4" /></Link></Button>
        </div>
      </div>

      <div role="tablist" className="flex flex-wrap gap-1 border-b">
        {TABS.map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={cn("-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors", tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {t}
          </button>
        ))}
      </div>

      {tab === "Invoice Details" ? (
        <div className="space-y-6 rounded-lg border bg-card p-6">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold">{String(invoice.invoice_number ?? "")}</h2>
            <Badge variant={invoice.status === "paid" ? "default" : invoice.status === "draft" ? "secondary" : "default"}>{String(invoice.status ?? "draft")}</Badge>
            <span className="ml-auto text-sm text-muted-foreground">Balance Due : <span className="font-semibold text-foreground">{format(balance)}</span></span>
          </div>

          <div className="grid gap-4 text-sm sm:grid-cols-2">
            <Field k="Invoice#" v={invoice.invoice_number} />
            <Field k="Invoice Date" v={invoice.issue_date} />
            <Field k="Order Number" v={invoice.order_number} />
            <Field k="Due Date" v={invoice.due_date} />
            <Field k="Salesperson" v={invoice.salesperson} />
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold">Customer Details</p>
            <div className="grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <p className="text-muted-foreground">Name</p>
                {invoice.contact_id ? <Link href={`/customers/${invoice.contact_id}`} className="text-primary hover:underline">{String(invoice.customer_name ?? "—")}</Link> : <p>{String(invoice.customer_name ?? "—")}</p>}
              </div>
              <div />
              <div><p className="text-muted-foreground">Billing Address</p>{billing.length ? billing.map((l, i) => <p key={i}>{l}</p>) : <p>—</p>}</div>
              <div><p className="text-muted-foreground">Shipping Address</p>{shipping.length ? shipping.map((l, i) => <p key={i}>{l}</p>) : <p>—</p>}</div>
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold">Items <span className="text-muted-foreground">({lines.length})</span></p>
            <div className="overflow-hidden rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr><th className="px-4 py-2 text-left">S.No</th><th className="px-4 py-2 text-left">Item & Description</th><th className="px-4 py-2 text-right">Qty</th><th className="px-4 py-2 text-right">Rate</th><th className="px-4 py-2 text-right">Tax</th><th className="px-4 py-2 text-right">Amount</th></tr>
                </thead>
                <tbody className="divide-y">
                  {lines.map((l, i) => (
                    <tr key={i}>
                      <td className="px-4 py-2">{i + 1}</td>
                      <td className="px-4 py-2 text-primary">{String(l.item_name ?? l.description ?? "—")}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{Number(l.quantity ?? 0)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{format(Number(l.rate ?? 0))}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{Number(l.tax_amount ?? 0) ? format(Number(l.tax_amount)) : "—"}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{format(Number(l.line_total ?? 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex justify-end">
              <div className="w-full max-w-xs space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Sub Total</span><span className="tabular-nums">{format(Number(invoice.subtotal ?? 0))}</span></div>
                {Number(invoice.discount_total ?? 0) ? <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span className="tabular-nums">−{format(Number(invoice.discount_total))}</span></div> : null}
                {Number(invoice.tax_total ?? 0) ? <div className="flex justify-between"><span className="text-muted-foreground">Tax</span><span className="tabular-nums">{format(Number(invoice.tax_total))}</span></div> : null}
                {roundOff ? <div className="flex justify-between"><span className="text-muted-foreground">Adjustment</span><span className="tabular-nums">{format(roundOff)}</span></div> : null}
                {Number(invoice.tcs_amount ?? 0) ? <div className="flex justify-between"><span className="text-muted-foreground">TCS</span><span className="tabular-nums">{format(Number(invoice.tcs_amount))}</span></div> : null}
                <div className="flex justify-between border-t pt-1 text-base font-bold"><span>Total</span><span className="tabular-nums">{format(Number(invoice.total ?? 0))}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Balance Due</span><span className="tabular-nums font-semibold">{format(balance)}</span></div>
              </div>
            </div>
          </div>

          {payments.length ? (
            <div>
              <p className="mb-2 text-sm font-semibold">Payments Applied</p>
              <div className="overflow-hidden rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-2 text-left">Date</th><th className="px-4 py-2 text-left">Method</th><th className="px-4 py-2 text-right">Applied</th></tr></thead>
                  <tbody className="divide-y">
                    {payments.map((p, i) => (
                      <tr key={i}><td className="px-4 py-2">{String(p.date ?? "—")}</td><td className="px-4 py-2">{String(p.method ?? "—")}</td><td className="px-4 py-2 text-right tabular-nums">{format(Number(p.applied ?? 0))}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {invoice.notes ? <div><p className="mb-1 text-sm font-semibold">Notes</p><p className="text-sm text-muted-foreground">{String(invoice.notes)}</p></div> : null}
          {invoice.customer_email ? <div><p className="mb-1 text-sm font-semibold">Email Recipients</p><Badge variant="secondary">{String(invoice.customer_email)}</Badge></div> : null}
        </div>
      ) : (
        <div className="rounded-lg border bg-card p-6">
          {journal.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Journal entries are not available for invoices in the draft state.</p>
          ) : (
            <div className="overflow-hidden rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-2 text-left">Account</th><th className="px-4 py-2 text-right">Debit</th><th className="px-4 py-2 text-right">Credit</th></tr></thead>
                <tbody className="divide-y">
                  {journal.map((j, i) => (
                    <tr key={i}>
                      <td className="px-4 py-2">{String(j.account ?? "—")}{j.account_code ? <span className="ml-1 text-xs text-muted-foreground">({String(j.account_code)})</span> : null}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{Number(j.debit ?? 0) ? format(Number(j.debit)) : ""}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{Number(j.credit ?? 0) ? format(Number(j.credit)) : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Field({ k, v }: { k: string; v: unknown }) {
  return <div><p className="text-muted-foreground">{k}</p><p>{v != null && v !== "" ? String(v) : "—"}</p></div>;
}

function Menu({ trigger, items }: { trigger: React.ReactNode; items: { label: string; icon?: React.ReactNode; onSelect: () => void }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <Button type="button" size="sm" variant="secondary" onClick={() => setOpen((o) => !o)} onBlur={() => setTimeout(() => setOpen(false), 150)}>{trigger}<ChevronDown className="ml-1 h-4 w-4" /></Button>
      {open ? (
        <div className="absolute left-0 z-10 mt-1 min-w-[180px] rounded-md border bg-popover p-1 shadow-md">
          {items.map((it) => <button key={it.label} type="button" onMouseDown={() => { it.onSelect(); setOpen(false); }} className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm hover:bg-muted">{it.icon}{it.label}</button>)}
        </div>
      ) : null}
    </div>
  );
}

function SendMenu({ id }: { id: string }) {
  const qc = useQueryClient();
  const sendEmail = async () => {
    const t = toast.loading("Sending invoice…");
    try {
      const res = await fetch(`/api/v1/invoices/${id}/send`, { method: "POST" });
      const payload = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!res.ok) { toast.error(payload?.error?.message ?? "Could not send the invoice.", { id: t }); return; }
      toast.success("Invoice emailed to the customer.", { id: t });
      qc.invalidateQueries({ queryKey: ["invoice", id] });
    } catch { toast.error("Could not send the invoice.", { id: t }); }
  };
  return <Menu trigger={<><Mail className="mr-1 h-4 w-4" />Send</>} items={[
    { label: "Send Email", icon: <Mail className="h-4 w-4" />, onSelect: sendEmail },
    { label: "Send SMS", icon: <MessageSquare className="h-4 w-4" />, onSelect: () => toast("SMS sending isn't configured for this workspace.") }
  ]} />;
}

function ShareButton({ id }: { id: string }) {
  const share = async () => {
    const url = `${window.location.origin}/api/v1/invoices/${id}/pdf`;
    try {
      if (navigator.share) { await navigator.share({ title: "Invoice", url }); return; }
      await navigator.clipboard.writeText(url);
      toast.success("Invoice PDF link copied to clipboard.");
    } catch { toast.error("Could not share."); }
  };
  return <Button type="button" size="sm" variant="secondary" onClick={share}><Share2 className="mr-1 h-4 w-4" />Share</Button>;
}

function PdfMenu({ id }: { id: string }) {
  const url = `/api/v1/invoices/${id}/pdf`;
  const print = () => { const w = window.open(url, "_blank"); if (w) w.addEventListener("load", () => { try { w.print(); } catch { /* viewer print available */ } }); };
  return <Menu trigger={<><FileText className="mr-1 h-4 w-4" />PDF/Print</>} items={[
    { label: "PDF", icon: <FileText className="h-4 w-4" />, onSelect: () => window.open(url, "_blank", "noopener") },
    { label: "Print", icon: <Printer className="h-4 w-4" />, onSelect: print }
  ]} />;
}

function RecordPaymentButton({ id, contactId, balance, disabled }: { id: string; contactId: string; balance: number; disabled: boolean }) {
  const href = `/payments/received/new?invoice=${id}&contact=${contactId}&amount=${balance}`;
  if (disabled) return <Button type="button" size="sm" variant="secondary" disabled title="This invoice is fully paid."><CreditCard className="mr-1 h-4 w-4" />Record Payment</Button>;
  return <Button asChild size="sm"><Link href={href}><CreditCard className="mr-1 h-4 w-4" />Record Payment</Link></Button>;
}
