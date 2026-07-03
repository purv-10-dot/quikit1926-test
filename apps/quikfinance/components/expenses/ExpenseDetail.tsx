"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil, X, Trash2, Copy, BookOpen, FilePlus2, Paperclip, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCurrency } from "@/lib/currency";

type Expense = Record<string, unknown> & {
  account_name?: string; amount?: number | string; tax_amount?: number | string; expense_date?: string;
  paid_through?: string | null; vendor_name?: string | null; vendor_id?: string | null;
  customer_name?: string | null; customer_id?: string | null; project_name?: string | null; location?: string | null;
  reference?: string | null; description?: string | null; is_billable?: boolean; is_billed?: boolean; billed_invoice_id?: string | null;
  journal?: Array<Record<string, unknown>>; attachments?: Array<Record<string, unknown>>;
};

async function getJson(path: string) { const r = await fetch(path); return r.ok ? r.json() : null; }

export function ExpenseDetail({ id }: { id: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const { format } = useCurrency();
  const [busy, setBusy] = useState(false);
  const [showJournal, setShowJournal] = useState(false);

  const { data: e, isPending } = useQuery<Expense | null>({
    queryKey: ["expense", id],
    queryFn: async () => (await getJson(`/api/v1/expenses/${id}`))?.data ?? null
  });

  if (isPending) return <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!e) return <div className="rounded-lg border bg-card p-6 text-sm"><p className="font-medium">Expense not found.</p><Link href="/expenses" className="mt-3 inline-block text-primary hover:underline">← Back to expenses</Link></div>;

  const journal = e.journal ?? [];
  const attachments = e.attachments ?? [];
  const amount = Number(e.amount ?? 0);
  const billable = Boolean(e.is_billable);
  const billed = Boolean(e.is_billed);

  const remove = async () => {
    if (!window.confirm("Delete this expense? This cannot be undone.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/expenses/${id}`, { method: "DELETE" });
      if (!res.ok) { toast.error("Could not delete the expense."); return; }
      toast.success("Expense deleted.");
      qc.invalidateQueries({ queryKey: ["module", "expenses"] });
      router.push("/expenses");
    } finally { setBusy(false); }
  };
  const convert = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/expenses/${id}/convert`, { method: "POST" });
      const body = (await res.json().catch(() => null)) as { data?: { invoice_id?: string; redirect?: string; invoice_number?: string }; error?: { message?: string } } | null;
      if (!res.ok) { toast.error(body?.error?.message ?? "Could not create the invoice."); return; }
      toast.success(`Created ${body?.data?.invoice_number ?? "invoice"} from this expense.`);
      qc.invalidateQueries({ queryKey: ["expense", id] });
      if (body?.data?.redirect) router.push(body.data.redirect);
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-5 animate-fade-up">
      <div className="flex items-start justify-between gap-4">
        <div>
          {e.location ? <p className="text-xs text-muted-foreground">Location: {String(e.location)}</p> : null}
          <h1 className="text-2xl font-bold">Expense Details</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild size="sm" variant="secondary"><Link href={`/expenses/${id}/edit`}><Pencil className="mr-1 h-4 w-4" />Edit</Link></Button>
          {billable && !billed ? <Button type="button" size="sm" disabled={busy} onClick={convert}><FilePlus2 className="mr-1 h-4 w-4" />Convert to Invoice</Button> : null}
          <Menu items={[
            { label: "Clone", icon: <Copy className="h-4 w-4" />, onSelect: () => router.push(`/expenses/new?clone=${id}`) },
            { label: "View Journal", icon: <BookOpen className="h-4 w-4" />, onSelect: () => setShowJournal((v) => !v) },
            { label: "Delete", icon: <Trash2 className="h-4 w-4" />, onSelect: remove }
          ]} />
          <Button asChild size="sm" variant="ghost"><Link href="/expenses" aria-label="Close"><X className="h-4 w-4" /></Link></Button>
        </div>
      </div>

      <div className="space-y-6 rounded-lg border bg-card p-6">
        <div>
          <p className="text-sm text-muted-foreground">Expense Amount</p>
          <p className="text-2xl font-bold tabular-nums text-primary">{format(amount)} <span className="text-sm font-normal text-muted-foreground">on {String(e.expense_date ?? "")}</span></p>
          <div className="mt-2 flex items-center gap-2">
            <Badge variant={billable ? "success" : "muted"}>{billable ? "BILLABLE" : "NON-BILLABLE"}</Badge>
            {billed && e.billed_invoice_id ? <Link href={`/invoices/${e.billed_invoice_id}`} className="text-xs text-primary hover:underline">Invoiced →</Link> : null}
          </div>
          {e.account_name ? <span className="mt-3 inline-block rounded bg-muted px-2 py-1 text-sm">{String(e.account_name)}</span> : null}
        </div>

        <div className="grid gap-4 text-sm sm:grid-cols-2">
          <Field k="Paid Through" v={e.paid_through} />
          <Field k="Reference / Invoice#" v={e.reference} />
          <div><p className="text-muted-foreground">Customer</p>{e.customer_id ? <Link href={`/customers/${e.customer_id}`} className="text-primary hover:underline">{String(e.customer_name ?? "—")}</Link> : <p>{String(e.customer_name ?? "—")}</p>}</div>
          <div><p className="text-muted-foreground">Paid To (Vendor)</p>{e.vendor_id ? <Link href={`/vendors/${e.vendor_id}`} className="text-primary hover:underline">{String(e.vendor_name ?? "—")}</Link> : <p>{String(e.vendor_name ?? "—")}</p>}</div>
          {e.project_name ? <Field k="Project" v={e.project_name} /> : null}
          {Number(e.tax_amount ?? 0) ? <Field k="Input Tax" v={format(Number(e.tax_amount))} /> : null}
        </div>
        {e.description ? <p className="text-sm text-muted-foreground">{String(e.description)}</p> : null}

        {attachments.length ? (
          <div>
            <p className="mb-2 text-sm font-semibold">Receipts <span className="text-muted-foreground">({attachments.length})</span></p>
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

        <div className="border-t pt-4">
          <button type="button" className="mb-2 flex items-center gap-1 text-sm font-semibold text-primary" onClick={() => setShowJournal((v) => !v)}><BookOpen className="h-4 w-4" />Journal</button>
          {showJournal ? (
            journal.length ? (
              <div className="overflow-hidden rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-2 text-left">Account</th><th className="px-4 py-2 text-right">Debit</th><th className="px-4 py-2 text-right">Credit</th></tr></thead>
                  <tbody className="divide-y">
                    {journal.map((j, i) => (
                      <tr key={i}><td className="px-4 py-2">{String(j.account ?? "—")}</td><td className="px-4 py-2 text-right tabular-nums">{Number(j.debit ?? 0) ? format(Number(j.debit)) : "—"}</td><td className="px-4 py-2 text-right tabular-nums">{Number(j.credit ?? 0) ? format(Number(j.credit)) : "—"}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="text-sm text-muted-foreground">No journal entry (draft/void expenses are not posted).</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Field({ k, v }: { k: string; v: unknown }) {
  return <div><p className="text-muted-foreground">{k}</p><p>{v != null && v !== "" ? String(v) : "—"}</p></div>;
}

function Menu({ items }: { items: { label: string; icon?: React.ReactNode; onSelect: () => void }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <Button type="button" size="sm" variant="secondary" onClick={() => setOpen((o) => !o)} onBlur={() => setTimeout(() => setOpen(false), 150)}><span className="px-1 text-base leading-none">⋯</span><ChevronDown className="ml-1 h-4 w-4" /></Button>
      {open ? (
        <div className="absolute right-0 z-10 mt-1 min-w-[170px] rounded-md border bg-popover p-1 shadow-md">
          {items.map((it) => (
            <button key={it.label} type="button" onMouseDown={() => { it.onSelect(); setOpen(false); }} className="flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm hover:bg-muted">{it.icon}{it.label}</button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
