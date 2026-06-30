"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, X, ChevronDown, Mail, MessageSquare, Share2, Printer, FileText, CheckCircle2, FilePlus2, MoreHorizontal, Copy, PackageCheck, Ban, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils/cn";

type PO = Record<string, unknown> & {
  purchase_order_number?: string; status?: string; reference_number?: string | null;
  issue_date?: string; expected_delivery_date?: string | null; payment_terms?: string | null;
  delivery_method?: string | null; location?: string | null;
  vendor_name?: string; vendor_email?: string | null; bill_id?: string | null; bill_no?: string | null;
  billing_address?: Record<string, unknown> | null; shipping_address?: Record<string, unknown> | null;
  subtotal?: number | string; discount_total?: number | string; adjustment?: number | string; total?: number | string;
  notes?: string | null; terms?: string | null; line_items?: Array<Record<string, unknown>>;
};

const TABS = ["Purchase Order Details", "Activity Logs"] as const;
type Tab = (typeof TABS)[number];

const STATUS_TONE: Record<string, "secondary" | "default" | "success" | "warning" | "destructive"> = {
  draft: "secondary", issued: "default", received: "success", billed: "success", partially_received: "warning", cancelled: "destructive", closed: "secondary"
};
const STATUS_LABEL: Record<string, string> = {
  draft: "Draft", issued: "Issued", received: "Received", billed: "Billed", partially_received: "Partially Received", cancelled: "Cancelled", closed: "Closed"
};

async function getJson(path: string) {
  const r = await fetch(path);
  return r.ok ? r.json() : null;
}
function addrLines(a?: Record<string, unknown> | null): string[] {
  if (!a) return [];
  return [a.line1, a.line2, a.landmark, [a.city, a.state].filter(Boolean).join(", "), [a.country, a.postal_code].filter(Boolean).join(" "), a.phone]
    .map((x) => (x ? String(x) : "")).filter(Boolean);
}

export function PurchaseOrderDetail({ id }: { id: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { format } = useCurrency();
  const [tab, setTab] = useState<Tab>("Purchase Order Details");
  const [busy, setBusy] = useState(false);

  const { data: po, isPending } = useQuery<PO | null>({
    queryKey: ["purchase-order", id],
    queryFn: async () => (await getJson(`/api/v1/purchase-orders/${id}`))?.data ?? null
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["purchase-order", id] });
    qc.invalidateQueries({ queryKey: ["module", "purchase-orders"] });
    qc.invalidateQueries({ queryKey: ["purchase-order-history", id] });
  };

  const act = async (path: string, msg: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/purchase-orders/${id}/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const payload = (await res.json().catch(() => null)) as { data?: { redirect?: string; number?: string }; error?: { message?: string } } | null;
      if (!res.ok) { toast.error(payload?.error?.message ?? "Action failed."); return; }
      toast.success(payload?.data?.number ? `${msg} ${payload.data.number}.` : msg);
      refresh();
      if (payload?.data?.redirect) router.push(payload.data.redirect);
    } finally { setBusy(false); }
  };

  if (isPending) return <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!po)
    return <div className="rounded-lg border bg-card p-6 text-sm"><p className="font-medium">Purchase order not found.</p><Link href="/purchase-orders" className="mt-3 inline-block text-primary hover:underline">← Back to purchase orders</Link></div>;

  const lines = po.line_items ?? [];
  const billing = addrLines(po.billing_address);
  const status = String(po.status ?? "draft");
  const isDraft = status === "draft";
  const isBilled = status === "billed" || Boolean(po.bill_id);
  const isCancelled = status === "cancelled";

  const sendEmail = async () => {
    const t = toast.loading("Sending purchase order…");
    try {
      const res = await fetch(`/api/v1/purchase-orders/${id}/send`, { method: "POST" });
      const payload = (await res.json().catch(() => null)) as { data?: { delivery?: { status?: string } }; error?: { message?: string } } | null;
      if (!res.ok) { toast.error(payload?.error?.message ?? "Could not send.", { id: t }); return; }
      const s = payload?.data?.delivery?.status;
      toast.success(s === "sent" ? "Purchase order emailed." : s === "failed" ? "Send failed — logged." : "Logged (email provider not configured).", { id: t });
      refresh();
    } catch { toast.error("Could not send.", { id: t }); }
  };

  const remove = async () => {
    if (!window.confirm("Delete this purchase order? This cannot be undone.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/purchase-orders/${id}`, { method: "DELETE" });
      if (!res.ok) { toast.error("Could not delete the purchase order."); return; }
      toast.success("Purchase order deleted.");
      qc.invalidateQueries({ queryKey: ["module", "purchase-orders"] });
      router.push("/purchase-orders");
    } finally { setBusy(false); }
  };

  const pdfUrl = `/api/v1/purchase-orders/${id}/pdf`;
  const print = () => { const w = window.open(pdfUrl, "_blank"); if (w) w.addEventListener("load", () => { try { w.print(); } catch { /* viewer print available */ } }); };
  const share = async () => {
    const url = `${window.location.origin}${pdfUrl}`;
    try {
      if (navigator.share) { await navigator.share({ title: "Purchase Order", url }); return; }
      await navigator.clipboard.writeText(url);
      toast.success("Purchase order PDF link copied to clipboard.");
    } catch { toast.error("Could not share."); }
  };

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex items-start justify-between gap-4">
        <div>
          {po.location ? <p className="text-xs text-muted-foreground">Location: {String(po.location)}</p> : null}
          <h1 className="text-2xl font-bold">{String(po.purchase_order_number ?? "Purchase Order")}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild size="sm" variant="secondary"><Link href={`/purchase-orders/${id}/edit`}><Pencil className="mr-1 h-4 w-4" />Edit</Link></Button>
          <Menu trigger={<><Mail className="mr-1 h-4 w-4" />Send</>} items={[
            { label: "Send Email", icon: <Mail className="h-4 w-4" />, onSelect: sendEmail },
            { label: "Send SMS", icon: <MessageSquare className="h-4 w-4" />, onSelect: () => toast("SMS sending isn't configured for this workspace.") }
          ]} />
          <Button type="button" size="sm" variant="secondary" onClick={share}><Share2 className="mr-1 h-4 w-4" />Share</Button>
          <Menu trigger={<><FileText className="mr-1 h-4 w-4" />PDF/Print</>} items={[
            { label: "View PDF", icon: <FileText className="h-4 w-4" />, onSelect: () => window.open(pdfUrl, "_blank", "noopener") },
            { label: "Print", icon: <Printer className="h-4 w-4" />, onSelect: print }
          ]} />
          {isDraft ? <Button type="button" size="sm" onClick={() => act("issue", "Purchase order marked as issued.")} disabled={busy}><CheckCircle2 className="mr-1 h-4 w-4" />Mark as Issued</Button> : null}
          {isBilled ? (
            po.bill_id ? <Button asChild size="sm" variant="secondary"><Link href={`/bills/${po.bill_id}`}><FileText className="mr-1 h-4 w-4" />View Bill</Link></Button> : null
          ) : !isDraft && !isCancelled ? (
            <Button type="button" size="sm" variant="secondary" onClick={() => act("convert", "Created bill")} disabled={busy}><FilePlus2 className="mr-1 h-4 w-4" />Convert to Bill</Button>
          ) : null}
          <Menu trigger={<MoreHorizontal className="h-4 w-4" />} items={[
            ...(isDraft && !isCancelled ? [{ label: "Mark as Issued", icon: <CheckCircle2 className="h-4 w-4" />, onSelect: () => act("issue", "Purchase order marked as issued.") }] : []),
            ...(!isDraft && !isBilled && !isCancelled ? [{ label: "Convert to Bill", icon: <FilePlus2 className="h-4 w-4" />, onSelect: () => act("convert", "Created bill") }] : []),
            ...(!isDraft && !isCancelled && status !== "received" ? [{ label: "Mark as Received", icon: <PackageCheck className="h-4 w-4" />, onSelect: () => act("receive", "Purchase order marked as received.") }] : []),
            { label: "Clone", icon: <Copy className="h-4 w-4" />, onSelect: () => act("clone", "Cloned to") },
            ...(!isBilled && !isCancelled ? [{ label: "Cancel", icon: <Ban className="h-4 w-4" />, onSelect: () => act("cancel", "Purchase order cancelled.") }] : []),
            { label: "Delete", icon: <Trash2 className="h-4 w-4" />, onSelect: remove, danger: true }
          ]} />
          <Button asChild size="sm" variant="ghost"><Link href="/purchase-orders" aria-label="Close"><X className="h-4 w-4" /></Link></Button>
        </div>
      </div>

      {isDraft ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
          <span className="font-medium">✨ What&apos;s next?</span>
          <span className="text-muted-foreground">Send this purchase order to your vendor or simply mark it as issued.</span>
          <Button size="sm" onClick={sendEmail} disabled={busy}>Send Purchase Order</Button>
          <Button size="sm" variant="secondary" onClick={() => act("issue", "Purchase order marked as issued.")} disabled={busy}>Mark as Issued</Button>
        </div>
      ) : null}

      <div role="tablist" className="flex flex-wrap gap-1 border-b">
        {TABS.map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={cn("-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors", tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {t}
          </button>
        ))}
      </div>

      {tab === "Purchase Order Details" ? (
        <div className="space-y-6 rounded-lg border bg-card p-6">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold">{String(po.purchase_order_number ?? "")}</h2>
            <Badge variant={STATUS_TONE[status] ?? "default"}>{STATUS_LABEL[status] ?? status}</Badge>
            <span className="ml-auto text-sm text-muted-foreground">Total : <span className="font-semibold text-foreground">{format(Number(po.total ?? 0))}</span></span>
          </div>

          <div className="grid gap-4 text-sm sm:grid-cols-2">
            <Field k="Purchase Order#" v={po.purchase_order_number} />
            <Field k="Order Date" v={po.issue_date} />
            <Field k="Reference#" v={po.reference_number} />
            <Field k="Expected Delivery" v={po.expected_delivery_date} />
            <Field k="Payment Terms" v={po.payment_terms} />
            <Field k="Delivery Method" v={po.delivery_method} />
            <div><p className="text-muted-foreground">Bill</p>{po.bill_id ? <Link href={`/bills/${po.bill_id}`} className="text-primary hover:underline">{String(po.bill_no ?? "View bill")}</Link> : <p>—</p>}</div>
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold">Vendor Details</p>
            <div className="grid gap-4 text-sm sm:grid-cols-2">
              <Field k="Name" v={po.vendor_name} />
              <Field k="Email" v={po.vendor_email} />
              <div className="sm:col-span-2"><p className="text-muted-foreground">Address</p>{billing.length ? billing.map((l, i) => <p key={i}>{l}</p>) : <p>—</p>}</div>
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold">Items <span className="text-muted-foreground">({lines.length})</span></p>
            <div className="overflow-hidden rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr><th className="px-4 py-2 text-left">S.No</th><th className="px-4 py-2 text-left">Item &amp; Description</th><th className="px-4 py-2 text-right">Qty</th><th className="px-4 py-2 text-right">Rate</th><th className="px-4 py-2 text-right">Discount</th><th className="px-4 py-2 text-right">Amount</th></tr>
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
                <div className="flex justify-between"><span className="text-muted-foreground">Sub Total</span><span className="tabular-nums">{format(Number(po.subtotal ?? 0))}</span></div>
                {Number(po.discount_total ?? 0) ? <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span className="tabular-nums">−{format(Number(po.discount_total))}</span></div> : null}
                <div className="flex justify-between"><span className="text-muted-foreground">Adjustment</span><span className="tabular-nums">{format(Number(po.adjustment ?? 0))}</span></div>
                <div className="flex justify-between border-t pt-1 text-base font-bold"><span>Total</span><span className="tabular-nums">{format(Number(po.total ?? 0))}</span></div>
              </div>
            </div>
          </div>

          {po.notes ? <div><p className="mb-1 text-sm font-semibold">Notes</p><p className="text-sm text-muted-foreground">{String(po.notes)}</p></div> : null}
          {po.terms ? <div><p className="mb-1 text-sm font-semibold">Terms &amp; Conditions</p><p className="text-sm text-muted-foreground">{String(po.terms)}</p></div> : null}
        </div>
      ) : (
        <ActivityLogs id={id} />
      )}
    </div>
  );
}

function Field({ k, v }: { k: string; v: unknown }) {
  return <div><p className="text-muted-foreground">{k}</p><p>{v != null && v !== "" ? String(v) : "—"}</p></div>;
}

function Menu({ trigger, items }: { trigger: React.ReactNode; items: { label: string; icon?: React.ReactNode; onSelect: () => void; danger?: boolean }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <Button type="button" size="sm" variant="secondary" onClick={() => setOpen((o) => !o)} onBlur={() => setTimeout(() => setOpen(false), 150)}>{trigger}<ChevronDown className="ml-1 h-4 w-4" /></Button>
      {open ? (
        <div className="absolute right-0 z-10 mt-1 min-w-[190px] rounded-md border bg-popover p-1 shadow-md">
          {items.map((it) => (
            <button key={it.label} type="button" onMouseDown={() => { it.onSelect(); setOpen(false); }} className={cn("flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm hover:bg-muted", it.danger && "text-destructive")}>{it.icon}{it.label}</button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ActivityLogs({ id }: { id: string }) {
  const { data = [], isPending } = useQuery({
    queryKey: ["purchase-order-history", id],
    queryFn: async () => ((await getJson(`/api/v1/purchase-orders/${id}/history`))?.data ?? []) as Array<{ id: string; action: string; at: string; user_name?: string }>
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
