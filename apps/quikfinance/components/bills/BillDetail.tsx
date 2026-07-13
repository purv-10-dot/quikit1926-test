"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, X, Trash2, CreditCard, FileText, Printer, ChevronDown, Copy, Repeat2, FilePlus2, BookOpen, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCurrency } from "@/lib/currency";

type Payment = { amount: number | string; payment_date?: string; reference?: string | null; method?: string | null; payment_number?: string | null };
type Attachment = { id: string; file_name: string; file_path: string; content_type?: string | null; size_bytes?: number | string };
type JournalLine = { account: string; code?: string; debit: number | string; credit: number | string };
type Bill = Record<string, unknown> & {
  bill_number?: string; status?: string; reference_number?: string | null; order_number?: string | null;
  issue_date?: string; due_date?: string; payment_terms?: string | null; subject?: string | null; location?: string | null;
  vendor_name?: string; vendor_email?: string | null; billing_address?: Record<string, unknown> | null;
  subtotal?: number | string; discount_total?: number | string; tax_total?: number | string; tds_amount?: number | string;
  total?: number | string; balance_due?: number | string;
  notes?: string | null; line_items?: Array<Record<string, unknown>>; payments?: Payment[];
  attachments?: Attachment[]; journal?: JournalLine[]; journal_entry_id?: string | null;
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
const STATUS_TONE: Record<string, "secondary" | "default" | "success" | "warning" | "destructive"> = {
  draft: "secondary", open: "default", submitted: "default", approved: "default", partial: "warning", paid: "success", void: "destructive"
};

export function BillDetail({ id }: { id: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { format } = useCurrency();
  const [deleting, setDeleting] = useState(false);
  const [showJournal, setShowJournal] = useState(false);
  const [busy, setBusy] = useState(false);

  const { data: bill, isPending } = useQuery<Bill | null>({
    queryKey: ["bill", id],
    queryFn: async () => (await getJson(`/api/v1/bills/${id}`))?.data ?? null
  });

  if (isPending) return <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!bill)
    return <div className="rounded-lg border bg-card p-6 text-sm"><p className="font-medium">Bill not found.</p><Link href="/bills" className="mt-3 inline-block text-primary hover:underline">← Back to bills</Link></div>;

  const lines = bill.line_items ?? [];
  const payments = bill.payments ?? [];
  const attachments = bill.attachments ?? [];
  const journal = bill.journal ?? [];
  const billing = addrLines(bill.billing_address);
  const status = String(bill.status ?? "draft");
  const balanceDue = Number(bill.balance_due ?? 0);
  const pdfUrl = `/api/v1/bills/${id}/pdf`;

  const remove = async () => {
    if (!window.confirm("Delete this bill? This cannot be undone.")) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/v1/bills/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        toast.error(body?.error?.message ?? "Could not delete the bill.");
        return;
      }
      toast.success("Bill deleted.");
      qc.invalidateQueries({ queryKey: ["module", "bills"] });
      router.push("/bills");
    } finally { setDeleting(false); }
  };

  const print = () => { const w = window.open(pdfUrl, "_blank"); if (w) w.addEventListener("load", () => { try { w.print(); } catch { /* viewer print available */ } }); };

  const createVendorCredit = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/v1/vendor-credits", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact_id: bill.contact_id, bill_id: id, issue_date: bill.issue_date, subtotal: Number(bill.total ?? 0), tax_total: 0, total: Number(bill.total ?? 0), status: "draft", currency: (bill.currency as string) ?? "INR" })
      });
      const body = (await res.json().catch(() => null)) as { data?: { id?: string }; error?: { message?: string } } | null;
      if (!res.ok) { toast.error(body?.error?.message ?? "Could not create the vendor credit."); return; }
      toast.success("Vendor credit created.");
      if (body?.data?.id) router.push(`/vendor-credits/${body.data.id}`);
    } finally { setBusy(false); }
  };

  const makeRecurring = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/v1/recurring", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_type: "bill", source_id: id, frequency: "monthly", start_date: bill.issue_date ?? undefined })
      });
      if (!res.ok) { toast.error("Could not create the recurring profile."); return; }
      toast.success("Recurring bill profile created (monthly).");
      router.push("/recurring");
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex items-start justify-between gap-4">
        <div>
          {bill.location ? <p className="text-xs text-muted-foreground">Location: {String(bill.location)}</p> : null}
          <h1 className="text-2xl font-bold">{String(bill.bill_number ?? "Bill")}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {balanceDue > 0 && status !== "draft" ? (
            <Button asChild size="sm"><Link href="/payments/made/new"><CreditCard className="mr-1 h-4 w-4" />Record Payment</Link></Button>
          ) : null}
          <Button asChild size="sm" variant="secondary"><Link href={`/bills/${id}/edit`}><Pencil className="mr-1 h-4 w-4" />Edit</Link></Button>
          <Menu trigger={<><FileText className="mr-1 h-4 w-4" />PDF/Print</>} items={[
            { label: "View PDF", icon: <FileText className="h-4 w-4" />, onSelect: () => window.open(pdfUrl, "_blank", "noopener") },
            { label: "Print", icon: <Printer className="h-4 w-4" />, onSelect: print }
          ]} />
          <Menu trigger={<span className="px-1 text-base leading-none">⋯</span>} items={[
            { label: "Clone", icon: <Copy className="h-4 w-4" />, onSelect: () => router.push(`/bills/new?clone=${id}`) },
            { label: busy ? "Working…" : "Make Recurring", icon: <Repeat2 className="h-4 w-4" />, onSelect: makeRecurring },
            { label: busy ? "Working…" : "Create Vendor Credits", icon: <FilePlus2 className="h-4 w-4" />, onSelect: createVendorCredit },
            { label: "View Journal", icon: <BookOpen className="h-4 w-4" />, onSelect: () => setShowJournal((v) => !v) }
          ]} />
          <Button type="button" size="sm" variant="secondary" onClick={remove} disabled={deleting}><Trash2 className="mr-1 h-4 w-4" />{deleting ? "Deleting…" : "Delete"}</Button>
          <Button asChild size="sm" variant="ghost"><Link href="/bills" aria-label="Close"><X className="h-4 w-4" /></Link></Button>
        </div>
      </div>

      <div className="space-y-6 rounded-lg border bg-card p-6">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold">{String(bill.bill_number ?? "")}</h2>
          <Badge variant={STATUS_TONE[status] ?? "default"}>{status}</Badge>
          <span className="ml-auto text-sm text-muted-foreground">Balance Due : <span className="font-semibold text-foreground">{format(balanceDue)}</span></span>
        </div>

        <div className="grid gap-4 text-sm sm:grid-cols-2">
          <Field k="Bill#" v={bill.bill_number} />
          <Field k="Order Number" v={bill.order_number} />
          <Field k="Bill Date" v={bill.issue_date} />
          <Field k="Due Date" v={bill.due_date} />
          <Field k="Reference#" v={bill.reference_number} />
          <Field k="Payment Terms" v={bill.payment_terms} />
          {bill.subject ? <Field k="Subject" v={bill.subject} /> : null}
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold">Vendor Details</p>
          <div className="grid gap-4 text-sm sm:grid-cols-2">
            <Field k="Name" v={bill.vendor_name} />
            <Field k="Email" v={bill.vendor_email} />
            <div className="sm:col-span-2"><p className="text-muted-foreground">Billing Address</p>{billing.length ? billing.map((l, i) => <p key={i}>{l}</p>) : <p>—</p>}</div>
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold">Items <span className="text-muted-foreground">({lines.length})</span></p>
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr><th className="px-4 py-2 text-left">#</th><th className="px-4 py-2 text-left">Item &amp; Description</th><th className="px-4 py-2 text-right">Qty</th><th className="px-4 py-2 text-right">Rate</th><th className="px-4 py-2 text-right">Discount</th><th className="px-4 py-2 text-right">Amount</th></tr>
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
              <div className="flex justify-between"><span className="text-muted-foreground">Sub Total</span><span className="tabular-nums">{format(Number(bill.subtotal ?? 0))}</span></div>
              {Number(bill.discount_total ?? 0) ? <div className="flex justify-between"><span className="text-muted-foreground">Discount</span><span className="tabular-nums">−{format(Number(bill.discount_total))}</span></div> : null}
              {Number(bill.tax_total ?? 0) ? <div className="flex justify-between"><span className="text-muted-foreground">Input Tax</span><span className="tabular-nums">{format(Number(bill.tax_total))}</span></div> : null}
              <div className="flex justify-between border-t pt-1 text-base font-bold"><span>Total</span><span className="tabular-nums">{format(Number(bill.total ?? 0))}</span></div>
              {Number(bill.tds_amount ?? 0) ? <div className="flex justify-between"><span className="text-muted-foreground">TDS withheld</span><span className="tabular-nums">−{format(Number(bill.tds_amount))}</span></div> : null}
              {payments.length ? <div className="flex justify-between text-emerald-600"><span>Payments Made</span><span className="tabular-nums">−{format(payments.reduce((s, p) => s + Number(p.amount || 0), 0))}</span></div> : null}
              <div className="flex justify-between border-t pt-1 text-base font-bold"><span>Balance Due</span><span className="tabular-nums">{format(balanceDue)}</span></div>
            </div>
          </div>
        </div>

        {payments.length ? (
          <div>
            <p className="mb-2 text-sm font-semibold">Payments Made <span className="text-muted-foreground">({payments.length})</span></p>
            <div className="overflow-hidden rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                  <tr><th className="px-4 py-2 text-left">Date</th><th className="px-4 py-2 text-left">Payment#</th><th className="px-4 py-2 text-left">Method</th><th className="px-4 py-2 text-left">Reference</th><th className="px-4 py-2 text-right">Amount</th></tr>
                </thead>
                <tbody className="divide-y">
                  {payments.map((p, i) => (
                    <tr key={i}>
                      <td className="px-4 py-2">{p.payment_date ?? "—"}</td>
                      <td className="px-4 py-2">{p.payment_number ?? "—"}</td>
                      <td className="px-4 py-2">{p.method ?? "—"}</td>
                      <td className="px-4 py-2">{p.reference ?? "—"}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{format(Number(p.amount ?? 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        {attachments.length ? (
          <div>
            <p className="mb-2 text-sm font-semibold">Attachments <span className="text-muted-foreground">({attachments.length})</span></p>
            <ul className="divide-y rounded-md border">
              {attachments.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="flex items-center gap-2 truncate"><Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" /><span className="truncate">{a.file_name}</span></span>
                  <a href={a.file_path} download={a.file_name} target="_blank" rel="noreferrer" className="shrink-0 text-primary hover:underline">Download</a>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {bill.notes ? <div><p className="mb-1 text-sm font-semibold">Notes</p><p className="text-sm text-muted-foreground">{String(bill.notes)}</p></div> : null}

        {showJournal ? (
          <div className="border-t pt-4">
            <p className="mb-2 text-sm font-semibold">Journal</p>
            {journal.length ? (
              <div className="overflow-hidden rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                    <tr><th className="px-4 py-2 text-left">Account</th><th className="px-4 py-2 text-right">Debit</th><th className="px-4 py-2 text-right">Credit</th></tr>
                  </thead>
                  <tbody className="divide-y">
                    {journal.map((l, i) => (
                      <tr key={i}>
                        <td className="px-4 py-2">{l.account}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{Number(l.debit) ? format(Number(l.debit)) : "—"}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{Number(l.credit) ? format(Number(l.credit)) : "—"}</td>
                      </tr>
                    ))}
                    <tr className="font-semibold">
                      <td className="px-4 py-2 text-right">Total</td>
                      <td className="px-4 py-2 text-right tabular-nums">{format(journal.reduce((s, l) => s + Number(l.debit || 0), 0))}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{format(journal.reduce((s, l) => s + Number(l.credit || 0), 0))}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : <p className="text-sm text-muted-foreground">No journal entry (draft bills are not posted).</p>}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Menu({ trigger, items }: { trigger: React.ReactNode; items: { label: string; icon?: React.ReactNode; onSelect: () => void }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <Button type="button" size="sm" variant="secondary" onClick={() => setOpen((o) => !o)} onBlur={() => setTimeout(() => setOpen(false), 150)}>{trigger}<ChevronDown className="ml-1 h-4 w-4" /></Button>
      {open ? (
        <div className="absolute right-0 z-10 mt-1 min-w-[200px] rounded-md border bg-popover p-1 shadow-md">
          {items.map((it) => (
            <button key={it.label} type="button" onMouseDown={() => { it.onSelect(); setOpen(false); }} className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm hover:bg-muted">{it.icon}{it.label}</button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Field({ k, v }: { k: string; v: unknown }) {
  return <div><p className="text-muted-foreground">{k}</p><p>{v != null && v !== "" ? String(v) : "—"}</p></div>;
}
