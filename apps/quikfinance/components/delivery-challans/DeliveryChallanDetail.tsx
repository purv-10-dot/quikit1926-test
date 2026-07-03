"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, X, ChevronDown, Printer, FileText, CheckCircle2, FilePlus2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils/cn";

type Challan = Record<string, unknown> & {
  challan_number?: string; reference?: string | null; challan_date?: string; challan_type?: string; status?: string;
  contact_id?: string; customer_name?: string; location?: string | null; invoice_id?: string | null;
  billing_address?: Record<string, unknown> | null; shipping_address?: Record<string, unknown> | null;
  subtotal?: number | string; discount_total?: number | string; adjustment?: number | string; total?: number | string;
  notes?: string | null; lines?: Array<Record<string, unknown>>;
};

const CHALLAN_TYPE_LABELS: Record<string, string> = {
  supply_on_approval: "Supply on Approval", job_work: "Job Work", supply_of_liquid_gas: "Supply of Liquid Gas", lines_sales: "Line Sales", others: "Others"
};

async function getJson(path: string) { const r = await fetch(path); return r.ok ? r.json() : null; }
function addrLines(a?: Record<string, unknown> | null): string[] {
  if (!a) return [];
  return [a.line1, a.line2, a.landmark, [a.city, a.state].filter(Boolean).join(", "), [a.country, a.postal_code].filter(Boolean).join(" "), a.phone].map((x) => (x ? String(x) : "")).filter(Boolean);
}

export function DeliveryChallanDetail({ id }: { id: string }) {
  const { format } = useCurrency();

  const { data: dc, isPending } = useQuery<Challan | null>({
    queryKey: ["delivery-challan", id],
    queryFn: async () => (await getJson(`/api/v1/delivery-challans/${id}`))?.data ?? null
  });

  if (isPending) return <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!dc) return <div className="rounded-lg border bg-card p-6 text-sm"><p className="font-medium">Delivery challan not found.</p><Link href="/delivery-challans" className="mt-3 inline-block text-primary hover:underline">← Back to delivery challans</Link></div>;

  const lines = dc.lines ?? [];
  const billing = addrLines(dc.billing_address);
  const invoiced = Boolean(dc.invoice_id);

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex items-start justify-between gap-4">
        <div>
          {dc.location ? <p className="text-xs text-muted-foreground">Location: {String(dc.location)}</p> : null}
          <h1 className="text-2xl font-bold">{String(dc.challan_number ?? "Delivery Challan")}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild size="sm" variant="secondary"><Link href={`/delivery-challans/${id}/edit`}><Pencil className="mr-1 h-4 w-4" />Edit</Link></Button>
          <PdfMenu id={id} />
          <OpenButton id={id} status={String(dc.status ?? "")} />
          <ConvertButton id={id} invoiced={invoiced} />
          <Button asChild size="sm" variant="ghost"><Link href="/delivery-challans" aria-label="Close"><X className="h-4 w-4" /></Link></Button>
        </div>
      </div>

      <div className="space-y-6 rounded-lg border bg-card p-6">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold">{String(dc.challan_number ?? "")}</h2>
          <Badge variant={dc.status === "draft" ? "secondary" : "default"}>{String(dc.status ?? "draft")}</Badge>
          <span className="ml-auto text-sm text-muted-foreground">Total : <span className="font-semibold text-foreground">{format(Number(dc.total ?? 0))}</span></span>
        </div>

        <div className="grid gap-4 text-sm sm:grid-cols-2">
          <Field k="Delivery Challan#" v={dc.challan_number} />
          <Field k="Challan Date" v={dc.challan_date} />
          <Field k="Reference#" v={dc.reference} />
          <Field k="Challan Type" v={dc.challan_type ? CHALLAN_TYPE_LABELS[String(dc.challan_type)] ?? String(dc.challan_type) : null} />
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold">Deliver To</p>
          <div className="text-sm">
            {dc.contact_id ? <Link href={`/customers/${dc.contact_id}`} className="text-primary hover:underline">{String(dc.customer_name ?? "—")}</Link> : <p>{String(dc.customer_name ?? "—")}</p>}
            {billing.length ? billing.map((l, i) => <p key={i} className="text-muted-foreground">{l}</p>) : null}
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold">Items <span className="text-muted-foreground">({lines.length})</span></p>
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-2 text-left">#</th><th className="px-4 py-2 text-left">Item & Description</th><th className="px-4 py-2 text-right">Qty</th><th className="px-4 py-2 text-right">Rate</th><th className="px-4 py-2 text-right">Discount</th><th className="px-4 py-2 text-right">Amount</th></tr></thead>
              <tbody className="divide-y">
                {lines.map((l, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2">{i + 1}</td>
                    <td className="px-4 py-2 text-primary">{String(l.item_name ?? l.description ?? "—")}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{Number(l.quantity ?? 0)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{format(Number(l.rate ?? 0))}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{Number(l.discount ?? 0) ? format(Number(l.discount)) : "—"}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{format(Number(l.line_total ?? Number(l.quantity ?? 0) * Number(l.rate ?? 0)))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex justify-end">
            <div className="w-full max-w-xs space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Sub Total</span><span className="tabular-nums">{format(Number(dc.subtotal ?? 0))}</span></div>
              {Number(dc.discount_total ?? 0) ? <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span className="tabular-nums">−{format(Number(dc.discount_total))}</span></div> : null}
              {Number(dc.adjustment ?? 0) ? <div className="flex justify-between"><span className="text-muted-foreground">Adjustment</span><span className="tabular-nums">{format(Number(dc.adjustment))}</span></div> : null}
              <div className="flex justify-between border-t pt-1 text-base font-bold"><span>Total</span><span className="tabular-nums">{format(Number(dc.total ?? 0))}</span></div>
            </div>
          </div>
        </div>

        {dc.notes ? <div><p className="mb-1 text-sm font-semibold">Notes</p><p className="text-sm text-muted-foreground">{String(dc.notes)}</p></div> : null}
        {invoiced ? <p className="text-sm text-muted-foreground">Invoiced — <Link href={`/invoices/${dc.invoice_id}`} className="text-primary hover:underline">view invoice</Link>.</p> : null}
      </div>
    </div>
  );
}

function Field({ k, v }: { k: string; v: unknown }) {
  return <div><p className="text-muted-foreground">{k}</p><p>{v != null && v !== "" ? String(v) : "—"}</p></div>;
}

function PdfMenu({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const url = `/api/v1/delivery-challans/${id}/pdf`;
  const print = () => { const w = window.open(url, "_blank"); if (w) w.addEventListener("load", () => { try { w.print(); } catch { /* viewer print available */ } }); };
  return (
    <div className="relative">
      <Button type="button" size="sm" variant="secondary" onClick={() => setOpen((o) => !o)} onBlur={() => setTimeout(() => setOpen(false), 150)}><FileText className="mr-1 h-4 w-4" />PDF/Print<ChevronDown className="ml-1 h-4 w-4" /></Button>
      {open ? (
        <div className="absolute left-0 z-10 mt-1 min-w-[160px] rounded-md border bg-popover p-1 shadow-md">
          <button type="button" onMouseDown={() => { window.open(url, "_blank", "noopener"); setOpen(false); }} className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm hover:bg-muted"><FileText className="h-4 w-4" />PDF</button>
          <button type="button" onMouseDown={() => { print(); setOpen(false); }} className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm hover:bg-muted"><Printer className="h-4 w-4" />Print</button>
        </div>
      ) : null}
    </div>
  );
}

function OpenButton({ id, status }: { id: string; status: string }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  if (status !== "draft") return <Button type="button" size="sm" variant="secondary" disabled><CheckCircle2 className="mr-1 h-4 w-4" />{status === "open" ? "Open" : "Opened"}</Button>;
  const open = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/delivery-challans/${id}/open`, { method: "POST" });
      if (!res.ok) { toast.error("Could not mark as open."); return; }
      toast.success("Delivery challan marked as open.");
      qc.invalidateQueries({ queryKey: ["delivery-challan", id] });
      qc.invalidateQueries({ queryKey: ["delivery-challans"] });
    } finally { setBusy(false); }
  };
  return <Button type="button" size="sm" onClick={open} disabled={busy}><CheckCircle2 className="mr-1 h-4 w-4" />{busy ? "…" : "Convert to Open"}</Button>;
}

function ConvertButton({ id, invoiced }: { id: string; invoiced: boolean }) {
  const router = useRouter();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  if (invoiced) return <Button type="button" size="sm" variant="secondary" disabled><FilePlus2 className="mr-1 h-4 w-4" />Invoiced</Button>;
  const convert = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/delivery-challans/${id}/invoice`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
      const body = (await res.json().catch(() => null)) as { data?: { invoiceId?: string }; error?: { message?: string } } | null;
      if (!res.ok) { toast.error(body?.error?.message ?? "Could not convert to invoice."); return; }
      toast.success("Invoice created from delivery challan.");
      qc.invalidateQueries({ queryKey: ["delivery-challan", id] });
      router.push(body?.data?.invoiceId ? `/invoices/${body.data.invoiceId}` : "/invoices");
    } finally { setBusy(false); }
  };
  return <Button type="button" size="sm" variant="secondary" onClick={convert} disabled={busy}><FilePlus2 className="mr-1 h-4 w-4" />{busy ? "Converting…" : "Convert to Invoice"}</Button>;
}
