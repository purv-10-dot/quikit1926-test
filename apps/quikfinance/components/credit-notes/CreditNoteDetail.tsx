"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, X, ChevronDown, Mail, Printer, FileText, RotateCcw, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useCurrency } from "@/lib/currency";
import { cn as cx } from "@/lib/utils/cn";

type CreditNote = Record<string, unknown> & {
  credit_note_number?: string; reference_number?: string | null; issue_date?: string; status?: string; salesperson?: string | null;
  contact_id?: string; customer_name?: string; customer_email?: string | null; location?: string | null; invoice_id?: string | null; invoice_no?: string | null;
  billing_address?: Record<string, unknown> | null;
  subtotal?: number | string; discount_total?: number | string; tax_total?: number | string; round_off?: number | string; total?: number | string; balance?: number | string;
  notes?: string | null; line_items?: Array<Record<string, unknown>>; journal?: Array<Record<string, unknown>>;
};

async function getJson(path: string) { const r = await fetch(path); return r.ok ? r.json() : null; }
function addrLines(a?: Record<string, unknown> | null): string[] {
  if (!a) return [];
  return [a.line1, a.line2, a.landmark, [a.city, a.state].filter(Boolean).join(", "), [a.country, a.postal_code].filter(Boolean).join(" "), a.phone].map((x) => (x ? String(x) : "")).filter(Boolean);
}

export function CreditNoteDetail({ id }: { id: string }) {
  const { format } = useCurrency();
  const router = useRouter();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"details" | "journal">("details");
  const [applyOpen, setApplyOpen] = useState(false);

  const { data: cn, isPending } = useQuery<CreditNote | null>({
    queryKey: ["credit-note", id],
    queryFn: async () => (await getJson(`/api/v1/credit-notes/${id}`))?.data ?? null
  });

  const act = async (path: string, body?: unknown, msg?: string) => {
    const res = await fetch(`/api/v1/credit-notes/${id}/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const payload = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    if (!res.ok) { toast.error(payload?.error?.message ?? "Action failed."); return false; }
    toast.success(msg ?? "Done.");
    qc.invalidateQueries({ queryKey: ["credit-note", id] });
    qc.invalidateQueries({ queryKey: ["module", "credit-notes"] });
    return true;
  };

  if (isPending) return <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!cn) return <div className="rounded-lg border bg-card p-6 text-sm"><p className="font-medium">Credit note not found.</p><Link href="/credit-notes" className="mt-3 inline-block text-primary hover:underline">← Back to credit notes</Link></div>;

  const lines = cn.line_items ?? [];
  const journal = cn.journal ?? [];
  const billing = addrLines(cn.billing_address);
  const balance = Number(cn.balance ?? 0);
  const isDraft = cn.status === "draft";

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex items-start justify-between gap-4">
        <div>
          {cn.location ? <p className="text-xs text-muted-foreground">Location: {String(cn.location)}</p> : null}
          <h1 className="text-2xl font-bold">{String(cn.credit_note_number ?? "Credit Note")}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild size="sm" variant="secondary"><Link href={`/credit-notes/${id}/edit`}><Pencil className="mr-1 h-4 w-4" />Edit</Link></Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => act("email", undefined, "Credit note emailed.")}><Mail className="mr-1 h-4 w-4" />Email</Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => window.open(`/api/v1/credit-notes/${id}/pdf`, "_blank", "noopener")}><FileText className="mr-1 h-4 w-4" />PDF/Print</Button>
          <Button type="button" size="sm" variant="secondary" disabled={balance <= 0} onClick={() => act("refund", {}, "Refund recorded.")}><RotateCcw className="mr-1 h-4 w-4" />Refund</Button>
          <MoreMenu isDraft={isDraft} onOpen={() => act("open", undefined, "Credit note converted to open.")} onApply={() => setApplyOpen(true)} onVoid={() => act("void", undefined, "Credit note voided.")} onDelete={async () => {
            if (!window.confirm("Delete this credit note?")) return;
            const res = await fetch(`/api/v1/credit-notes/${id}`, { method: "DELETE" });
            if (!res.ok) { toast.error("Could not delete."); return; }
            toast.success("Credit note deleted."); router.push("/credit-notes");
          }} />
          <Button asChild size="sm" variant="ghost"><Link href="/credit-notes" aria-label="Close"><X className="h-4 w-4" /></Link></Button>
        </div>
      </div>

      {isDraft ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 p-3 text-sm">
          <span className="font-medium">What&apos;s next?</span>
          <span className="text-muted-foreground">Email this credit note to your customer or simply convert it to open.</span>
          <Button size="sm" onClick={() => act("email", undefined, "Credit note emailed.")}>Send Credit Note</Button>
          <Button size="sm" variant="secondary" onClick={() => act("open", undefined, "Credit note converted to open.")}>Convert to Open</Button>
        </div>
      ) : null}

      <div role="tablist" className="flex flex-wrap gap-1 border-b">
        {(["details", "journal"] as const).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={cx("-mb-px border-b-2 px-4 py-2 text-sm font-medium capitalize transition-colors", tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}>
            {t === "details" ? "Credit Note Details" : "Journal"}
          </button>
        ))}
      </div>

      {tab === "details" ? (
        <div className="space-y-6 rounded-lg border bg-card p-6">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold">{String(cn.credit_note_number ?? "")}</h2>
            <Badge variant={cn.status === "draft" ? "secondary" : cn.status === "void" ? "destructive" : "default"}>{String(cn.status ?? "draft")}</Badge>
            <span className="ml-auto text-sm text-muted-foreground">Credits Remaining : <span className="font-semibold text-foreground">{format(balance)}</span></span>
          </div>

          <div className="grid gap-4 text-sm sm:grid-cols-2">
            <Field k="Credit Note#" v={cn.credit_note_number} />
            <Field k="Credit Note Date" v={cn.issue_date} />
            <Field k="Reference#" v={cn.reference_number} />
            <div><p className="text-muted-foreground">Invoice#</p>{cn.invoice_id ? <Link href={`/invoices/${cn.invoice_id}`} className="text-primary hover:underline">{String(cn.invoice_no ?? "View")}</Link> : <p>—</p>}</div>
            <Field k="Salesperson" v={cn.salesperson} />
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold">Bill To</p>
            <div className="text-sm">
              {cn.contact_id ? <Link href={`/customers/${cn.contact_id}`} className="text-primary hover:underline">{String(cn.customer_name ?? "—")}</Link> : <p>{String(cn.customer_name ?? "—")}</p>}
              {billing.map((l, i) => <p key={i} className="text-muted-foreground">{l}</p>)}
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-semibold">Items <span className="text-muted-foreground">({lines.length})</span></p>
            <div className="overflow-hidden rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-2 text-left">#</th><th className="px-4 py-2 text-left">Item & Description</th><th className="px-4 py-2 text-right">Qty</th><th className="px-4 py-2 text-right">Rate</th><th className="px-4 py-2 text-right">Amount</th></tr></thead>
                <tbody className="divide-y">
                  {lines.map((l, i) => (
                    <tr key={i}><td className="px-4 py-2">{i + 1}</td><td className="px-4 py-2 text-primary">{String(l.item_name ?? l.description ?? "—")}</td><td className="px-4 py-2 text-right tabular-nums">{Number(l.quantity ?? 0)}</td><td className="px-4 py-2 text-right tabular-nums">{format(Number(l.rate ?? 0))}</td><td className="px-4 py-2 text-right tabular-nums">{format(Number(l.line_total ?? 0))}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex justify-end">
              <div className="w-full max-w-xs space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Sub Total</span><span className="tabular-nums">{format(Number(cn.subtotal ?? 0))}</span></div>
                {Number(cn.discount_total ?? 0) ? <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span className="tabular-nums">−{format(Number(cn.discount_total))}</span></div> : null}
                {Number(cn.tax_total ?? 0) ? <div className="flex justify-between"><span className="text-muted-foreground">Tax</span><span className="tabular-nums">{format(Number(cn.tax_total))}</span></div> : null}
                {Number(cn.round_off ?? 0) ? <div className="flex justify-between"><span className="text-muted-foreground">Adjustment</span><span className="tabular-nums">{format(Number(cn.round_off))}</span></div> : null}
                <div className="flex justify-between border-t pt-1 text-base font-bold"><span>Total</span><span className="tabular-nums">{format(Number(cn.total ?? 0))}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Credits Remaining</span><span className="tabular-nums font-semibold">{format(balance)}</span></div>
              </div>
            </div>
          </div>

          {cn.notes ? <div><p className="mb-1 text-sm font-semibold">Notes</p><p className="text-sm text-muted-foreground">{String(cn.notes)}</p></div> : null}
          {cn.customer_email ? <div><p className="mb-1 text-sm font-semibold">Email Recipients</p><Badge variant="secondary">{String(cn.customer_email)}</Badge></div> : null}
        </div>
      ) : (
        <div className="rounded-lg border bg-card p-6">
          {journal.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">Journal entries are not available for credit notes in the draft state.</p>
          ) : (
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
          )}
        </div>
      )}

      {applyOpen ? <ApplyModal id={id} contactId={String(cn.contact_id ?? "")} balance={balance} onClose={() => setApplyOpen(false)} onApplied={() => { setApplyOpen(false); qc.invalidateQueries({ queryKey: ["credit-note", id] }); }} /> : null}
    </div>
  );
}

function Field({ k, v }: { k: string; v: unknown }) {
  return <div><p className="text-muted-foreground">{k}</p><p>{v != null && v !== "" ? String(v) : "—"}</p></div>;
}

function MoreMenu({ isDraft, onOpen, onApply, onVoid, onDelete }: { isDraft: boolean; onOpen: () => void; onApply: () => void; onVoid: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const item = (label: string, fn: () => void, danger = false) => (
    <button type="button" onMouseDown={() => { fn(); setOpen(false); }} className={cx("block w-full rounded px-3 py-2 text-left text-sm hover:bg-muted", danger && "text-destructive")}>{label}</button>
  );
  return (
    <div className="relative">
      <Button type="button" size="sm" variant="secondary" onClick={() => setOpen((o) => !o)} onBlur={() => setTimeout(() => setOpen(false), 150)}><MoreHorizontal className="h-4 w-4" /><ChevronDown className="ml-1 h-4 w-4" /></Button>
      {open ? (
        <div className="absolute right-0 z-10 mt-1 min-w-[180px] rounded-md border bg-popover p-1 shadow-md">
          {isDraft ? item("Convert to Open", onOpen) : null}
          {item("Apply to Invoices", onApply)}
          {item("Void", onVoid)}
          {item("Delete", onDelete, true)}
        </div>
      ) : null}
    </div>
  );
}

function ApplyModal({ id, contactId, balance, onClose, onApplied }: { id: string; contactId: string; balance: number; onClose: () => void; onApplied: () => void }) {
  const { format } = useCurrency();
  const [invoiceId, setInvoiceId] = useState("");
  const [amount, setAmount] = useState(String(balance));
  const [busy, setBusy] = useState(false);

  const { data: invoices = [] } = useQuery({
    queryKey: ["cn-open-invoices", contactId],
    queryFn: async () => {
      const r = await fetch(`/api/v1/invoices?per_page=200`);
      const all = (r.ok ? ((await r.json()).data as Array<Record<string, unknown>>) : []) ?? [];
      return all.filter((i) => String(i.contact_id) === contactId && Number(i.balance_due ?? 0) > 0);
    }
  });

  const apply = async () => {
    if (!invoiceId) { toast.error("Select an invoice."); return; }
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/credit-notes/${id}/apply`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ invoice_id: invoiceId, amount: Number(amount) || undefined }) });
      const payload = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!res.ok) { toast.error(payload?.error?.message ?? "Could not apply credit."); return; }
      toast.success("Credit applied to invoice.");
      onApplied();
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="mt-24 w-full max-w-md rounded-lg border bg-card p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-4 text-lg font-semibold">Apply credit to an invoice</h2>
        <p className="mb-3 text-sm text-muted-foreground">Credits remaining: <span className="font-medium text-foreground">{format(balance)}</span></p>
        <label className="text-sm">Invoice</label>
        <select className="mt-1 mb-3 h-10 w-full rounded-md border bg-background px-3 text-sm" value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)}>
          <option value="">Select an open invoice</option>
          {invoices.map((i) => <option key={String(i.id)} value={String(i.id)}>{String(i.invoice_number)} — due {format(Number(i.balance_due ?? 0))}</option>)}
        </select>
        <label className="text-sm">Amount</label>
        <Input type="number" step="0.01" className="mt-1" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <div className="mt-5 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="button" onClick={apply} disabled={busy}>{busy ? "Applying…" : "Apply"}</Button>
        </div>
      </div>
    </div>
  );
}
