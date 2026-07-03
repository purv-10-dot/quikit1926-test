"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, X, ChevronDown, Mail, MessageSquare, Share2, Printer, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils/cn";

type Quote = Record<string, unknown> & {
  quotation_number?: string; status?: string; reference_number?: string | null;
  issue_date?: string; expiry_date?: string | null; salesperson?: string | null; location?: string | null;
  customer_name?: string; customer_email?: string | null;
  billing_address?: Record<string, unknown> | null; shipping_address?: Record<string, unknown> | null;
  subtotal?: number | string; discount_total?: number | string; adjustment?: number | string; total?: number | string;
  notes?: string | null; terms?: string | null;
  line_items?: Array<Record<string, unknown>>;
};

const TABS = ["Quote Details", "Activity Logs"] as const;
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

export function QuotationDetail({ id }: { id: string }) {
  const { format } = useCurrency();
  const [tab, setTab] = useState<Tab>("Quote Details");

  const { data: quote, isPending } = useQuery<Quote | null>({
    queryKey: ["quotation", id],
    queryFn: async () => (await getJson(`/api/v1/quotations/${id}`))?.data ?? null
  });
  const { data: settings } = useQuery({
    queryKey: ["quote-settings"],
    queryFn: async () => (await getJson("/api/v1/settings/quotes"))?.data as { hide_zero_value_lines?: boolean; allow_editing_accepted?: boolean } | null
  });

  if (isPending) return <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!quote)
    return (
      <div className="rounded-lg border bg-card p-6 text-sm">
        <p className="font-medium">Quote not found.</p>
        <Link href="/quotations" className="mt-3 inline-block text-primary hover:underline">← Back to quotes</Link>
      </div>
    );

  const allLines = quote.line_items ?? [];
  // Hide zero-value lines on the detail view when enabled (Settings → Quotes),
  // unless the whole quote totals zero.
  const lines = settings?.hide_zero_value_lines && Number(quote.total ?? 0) !== 0
    ? allLines.filter((l) => Number(l.line_total ?? 0) !== 0)
    : allLines;
  const billing = addrLines(quote.billing_address);
  const shipping = addrLines(quote.shipping_address);
  const editLocked = quote.status === "accepted" && !settings?.allow_editing_accepted;

  return (
    <div className="space-y-5 animate-fade-up">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          {quote.location ? <p className="text-xs text-muted-foreground">Location: {String(quote.location)}</p> : null}
          <h1 className="text-2xl font-bold">{String(quote.quotation_number ?? "Quote")}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {editLocked ? (
            <Button type="button" size="sm" variant="secondary" disabled title="Editing of accepted quotes is disabled in Settings → Quotes."><Pencil className="mr-1 h-4 w-4" />Edit</Button>
          ) : (
            <Button asChild size="sm" variant="secondary"><Link href={`/quotations/${id}/edit`}><Pencil className="mr-1 h-4 w-4" />Edit</Link></Button>
          )}
          <SendMenu id={id} />
          <ShareButton id={id} />
          <PdfMenu id={id} />
          <ConvertMenu id={id} />
          <Button asChild size="sm" variant="ghost"><Link href="/quotations" aria-label="Close"><X className="h-4 w-4" /></Link></Button>
        </div>
      </div>

      {/* Tabs */}
      <div role="tablist" className="flex flex-wrap gap-1 border-b">
        {TABS.map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={cn("-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors", tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {t}
          </button>
        ))}
      </div>

      {tab === "Quote Details" ? (
        <div className="space-y-6 rounded-lg border bg-card p-6">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold">{String(quote.quotation_number ?? "")}</h2>
            <Badge variant={quote.status === "draft" ? "secondary" : "default"}>{String(quote.status ?? "draft")}</Badge>
            <span className="ml-auto text-sm text-muted-foreground">Total : <span className="font-semibold text-foreground">{format(Number(quote.total ?? 0))}</span></span>
          </div>

          <div className="grid gap-4 text-sm sm:grid-cols-2">
            <Field k="Quote Number" v={quote.quotation_number} />
            <Field k="Quote Date" v={quote.issue_date} />
            <Field k="Reference#" v={quote.reference_number} />
            <Field k="Expiry Date" v={quote.expiry_date} />
            <Field k="Salesperson" v={quote.salesperson} />
          </div>

          {/* Customer details */}
          <div>
            <p className="mb-2 text-sm font-semibold">Customer Details</p>
            <div className="grid gap-4 text-sm sm:grid-cols-2">
              <Field k="Name" v={quote.customer_name} />
              <div />
              <div>
                <p className="text-muted-foreground">Billing Address</p>
                {billing.length ? billing.map((l, i) => <p key={i}>{l}</p>) : <p>—</p>}
              </div>
              <div>
                <p className="text-muted-foreground">Shipping Address</p>
                {shipping.length ? shipping.map((l, i) => <p key={i}>{l}</p>) : <p>—</p>}
              </div>
            </div>
          </div>

          {/* Items */}
          <div>
            <p className="mb-2 text-sm font-semibold">Items <span className="text-muted-foreground">({lines.length})</span></p>
            <div className="overflow-hidden rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left">S.No</th>
                    <th className="px-4 py-2 text-left">Item</th>
                    <th className="px-4 py-2 text-right">Qty</th>
                    <th className="px-4 py-2 text-right">Price</th>
                    <th className="px-4 py-2 text-right">Discount</th>
                    <th className="px-4 py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {lines.map((l, i) => (
                    <tr key={i}>
                      <td className="px-4 py-2">{i + 1}</td>
                      <td className="px-4 py-2 text-primary">{String(l.item_name ?? l.description ?? "—")}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{Number(l.quantity ?? 0)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{format(Number(l.rate ?? 0))}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{Number(l.discount ?? 0) ? format(Number(l.discount)) : "—"}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{format(Number(l.line_total ?? 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex justify-end">
              <div className="w-full max-w-xs space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Sub Total</span><span className="tabular-nums">{format(Number(quote.subtotal ?? 0))}</span></div>
                {Number(quote.discount_total ?? 0) ? <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span className="tabular-nums">−{format(Number(quote.discount_total))}</span></div> : null}
                <div className="flex justify-between"><span className="text-muted-foreground">Adjustment</span><span className="tabular-nums">{format(Number(quote.adjustment ?? 0))}</span></div>
                <div className="flex justify-between border-t pt-1 text-base font-bold"><span>Total</span><span className="tabular-nums">{format(Number(quote.total ?? 0))}</span></div>
              </div>
            </div>
          </div>

          {quote.customer_email ? (
            <div>
              <p className="mb-1 text-sm font-semibold">Email Recipients</p>
              <Badge variant="secondary">{String(quote.customer_email)}</Badge>
            </div>
          ) : null}

          {quote.notes ? (
            <div>
              <p className="mb-1 text-sm font-semibold">Notes</p>
              <p className="text-sm text-muted-foreground">{String(quote.notes)}</p>
            </div>
          ) : null}
          {quote.terms ? (
            <div>
              <p className="mb-1 text-sm font-semibold">Terms &amp; Conditions</p>
              <p className="text-sm text-muted-foreground">{String(quote.terms)}</p>
            </div>
          ) : null}
        </div>
      ) : (
        <ActivityLogs id={id} />
      )}
    </div>
  );
}

/** Small dropdown menu used by the Send and PDF/Print toolbar buttons. */
function Menu({ trigger, items }: { trigger: React.ReactNode; items: { label: string; icon?: React.ReactNode; onSelect: () => void }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <Button type="button" size="sm" variant="secondary" onClick={() => setOpen((o) => !o)} onBlur={() => setTimeout(() => setOpen(false), 150)}>
        {trigger}<ChevronDown className="ml-1 h-4 w-4" />
      </Button>
      {open ? (
        <div className="absolute left-0 z-10 mt-1 min-w-[180px] rounded-md border bg-popover p-1 shadow-md">
          {items.map((it) => (
            <button key={it.label} type="button" onMouseDown={() => { it.onSelect(); setOpen(false); }}
              className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm hover:bg-muted">
              {it.icon}{it.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Send dropdown: email the quote (via Resend) or note that SMS isn't configured. */
function SendMenu({ id }: { id: string }) {
  const qc = useQueryClient();
  const sendEmail = async () => {
    const t = toast.loading("Sending quote…");
    try {
      const res = await fetch(`/api/v1/quotations/${id}/send`, { method: "POST" });
      const payload = (await res.json().catch(() => null)) as { data?: { delivery?: { status?: string } }; error?: { message?: string } } | null;
      if (!res.ok) { toast.error(payload?.error?.message ?? "Could not send the quote.", { id: t }); return; }
      const status = payload?.data?.delivery?.status;
      toast.success(status === "sent" ? "Quote emailed to the customer." : status === "failed" ? "Send failed — logged for retry." : "Quote logged (email provider not configured).", { id: t });
      qc.invalidateQueries({ queryKey: ["quotation", id] });
    } catch {
      toast.error("Could not send the quote.", { id: t });
    }
  };
  return (
    <Menu
      trigger={<><Mail className="mr-1 h-4 w-4" />Send</>}
      items={[
        { label: "Send Email", icon: <Mail className="h-4 w-4" />, onSelect: sendEmail },
        { label: "Send SMS", icon: <MessageSquare className="h-4 w-4" />, onSelect: () => toast("SMS sending isn't configured for this workspace.") }
      ]}
    />
  );
}

/** Copy a shareable link to the quote PDF. */
function ShareButton({ id }: { id: string }) {
  const share = async () => {
    const url = `${window.location.origin}/api/v1/quotations/${id}/pdf`;
    try {
      if (navigator.share) { await navigator.share({ title: "Quote", url }); return; }
      await navigator.clipboard.writeText(url);
      toast.success("Quote PDF link copied to clipboard.");
    } catch {
      toast.error("Could not share the quote.");
    }
  };
  return <Button type="button" size="sm" variant="secondary" onClick={share}><Share2 className="mr-1 h-4 w-4" />Share</Button>;
}

/** PDF/Print dropdown: open the generated quote PDF, or open it and print. */
function PdfMenu({ id }: { id: string }) {
  const url = `/api/v1/quotations/${id}/pdf`;
  const openPdf = () => window.open(url, "_blank", "noopener");
  const print = () => {
    const w = window.open(url, "_blank");
    if (w) w.addEventListener("load", () => { try { w.print(); } catch { /* viewer print is still available */ } });
  };
  return (
    <Menu
      trigger={<><FileText className="mr-1 h-4 w-4" />PDF/Print</>}
      items={[
        { label: "PDF", icon: <FileText className="h-4 w-4" />, onSelect: openPdf },
        { label: "Print", icon: <Printer className="h-4 w-4" />, onSelect: print }
      ]}
    />
  );
}

/** Convert dropdown: turns this quote into a draft invoice (with line items) or a sales order. */
function ConvertMenu({ id }: { id: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const convert = async (target: "invoice" | "sales_order") => {
    setOpen(false);
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/quotations/${id}/convert`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target })
      });
      const payload = (await res.json().catch(() => null)) as { data?: { redirect?: string; number?: string }; error?: { message?: string } } | null;
      if (!res.ok) {
        toast.error(payload?.error?.message ?? "Could not convert this quote.");
        return;
      }
      toast.success(`Created ${payload?.data?.number ?? (target === "invoice" ? "invoice" : "sales order")}.`);
      qc.invalidateQueries({ queryKey: ["quotation", id] });
      qc.invalidateQueries({ queryKey: ["module", "quotations"] });
      if (payload?.data?.redirect) router.push(payload.data.redirect);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative">
      <Button type="button" size="sm" onClick={() => setOpen((o) => !o)} onBlur={() => setTimeout(() => setOpen(false), 150)} disabled={busy}>
        {busy ? "Converting…" : "Convert"}<ChevronDown className="ml-1 h-4 w-4" />
      </Button>
      {open ? (
        <div className="absolute right-0 z-10 mt-1 min-w-[190px] rounded-md border bg-popover p-1 shadow-md">
          <button type="button" onMouseDown={() => convert("invoice")} className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-muted">Convert to Invoice</button>
          <button type="button" onMouseDown={() => convert("sales_order")} className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-muted">Convert to Sales Order</button>
        </div>
      ) : null}
    </div>
  );
}

function Field({ k, v }: { k: string; v: unknown }) {
  return (
    <div>
      <p className="text-muted-foreground">{k}</p>
      <p>{v != null && v !== "" ? String(v) : "—"}</p>
    </div>
  );
}

function ActivityLogs({ id }: { id: string }) {
  const { data = [], isPending } = useQuery({
    queryKey: ["quotation-history", id],
    queryFn: async () => ((await getJson(`/api/v1/quotations/${id}/history`))?.data ?? []) as Array<{ id: string; action: string; at: string; user_name?: string }>
  });
  if (isPending) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (data.length === 0) return <p className="py-10 text-center text-sm text-muted-foreground">No activity yet.</p>;
  return (
    <ol className="relative space-y-3 border-l pl-4">
      {data.map((e) => (
        <li key={e.id} className="relative">
          <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-primary" />
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm capitalize">{e.action} <span className="text-muted-foreground">by {e.user_name ?? "User"}</span></p>
            <span className="text-xs text-muted-foreground">{e.at}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}
