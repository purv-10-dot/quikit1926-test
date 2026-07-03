"use client";
import { ClientResponsiveContainer } from "@/components/design/ClientResponsiveContainer";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileText, CreditCard, FilePlus2, Mail, Pencil, ChevronDown, ChevronRight, Plus, Sparkles, ArrowRight } from "lucide-react";
import { Bento, BentoCard, Metric, HealthRing, Pill } from "@/components/design/bento";
import { useAiDock } from "@/lib/stores/ai-dock";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils/cn";

const TABS = ["Overview", "Comments", "Transactions", "Mails", "Statement"] as const;
type Tab = (typeof TABS)[number];

type Financials = { outstanding_balance: number; unused_credits: number; total_invoices: number; total_revenue: number; last_payment_date: string | null; credit_utilization: number };
type Customer = Record<string, unknown> & {
  display_name?: string; customer_code?: string; status?: string; credit_limit?: number | null; notes?: string | null;
  email?: string | null; mobile?: string | null; phone?: string | null; tax_id?: string | null; pan?: string | null; currency?: string;
  contact_kind?: string; customer_language?: string; portal_enabled?: boolean; payment_terms?: number; opening_balance?: number;
  billing_address?: Record<string, unknown>; shipping_address?: Record<string, unknown>;
  custom_fields?: Array<{ label: string; value: string }>;
  financials?: Financials; monthly_income?: Array<{ month: string; total: number }>;
  contacts_people?: Array<Record<string, unknown>>; documents?: Array<Record<string, unknown>>;
};

async function getJson(path: string) {
  const r = await fetch(path);
  return r.ok ? r.json() : null;
}

function addrLines(a?: Record<string, unknown>): string[] {
  if (!a) return [];
  return [a.line1, a.line2, a.landmark, [a.city, a.state].filter(Boolean).join(", "), [a.country, a.postal_code].filter(Boolean).join(" "), a.phone]
    .map((x) => (x ? String(x) : "")).filter(Boolean);
}

export function CustomerOverview({ id, kind = "customer" }: { id: string; kind?: "customer" | "vendor" }) {
  const [tab, setTab] = useState<Tab>("Overview");
  const isVendor = kind === "vendor";
  const base = isVendor ? "/api/v1/vendors" : "/api/v1/customers";
  const listPath = isVendor ? "/vendors" : "/customers";

  const { data: customer, isPending } = useQuery<Customer | null>({
    queryKey: ["party-overview", kind, id],
    queryFn: async () => (await getJson(`${base}/${id}`))?.data ?? null
  });

  if (isPending) return <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!customer)
    return (
      <div className="rounded-lg border bg-card p-6 text-sm">
        <p className="font-medium">{isVendor ? "Vendor" : "Customer"} not found.</p>
        <p className="mt-1 text-muted-foreground">It may have been deleted, or the link is invalid.</p>
        <Link href={listPath} className="mt-3 inline-block text-primary hover:underline">← Back to {isVendor ? "vendors" : "customers"}</Link>
      </div>
    );

  const fin = customer.financials ?? { outstanding_balance: 0, unused_credits: 0, total_invoices: 0, total_revenue: 0, last_payment_date: null, credit_utilization: 0 };
  const creditLimit = customer.credit_limit != null ? Number(customer.credit_limit) : null;

  return (
    <CustomerWorkspace customer={customer} fin={fin} creditLimit={creditLimit} kind={kind} id={id} base={base} listPath={listPath} tab={tab} setTab={setTab} isPending={false} notFound={false} />
  );
}

function CustomerWorkspace({ customer, fin, creditLimit, kind, id, base, listPath, tab, setTab }: {
  customer: Customer; fin: Financials; creditLimit: number | null; kind: "customer" | "vendor"; id: string; base: string; listPath: string;
  tab: Tab; setTab: (t: Tab) => void; isPending: boolean; notFound: boolean;
}) {
  const { format } = useCurrency();
  const openDock = useAiDock((s) => s.openDock);
  const isVendor = kind === "vendor";
  const name = customer.display_name ?? "Customer";

  // Relationship score — transparent heuristic over real financial signals.
  const score = useMemo(() => {
    let s = 72;
    if (fin.total_revenue > 0) s += 8;
    if (fin.outstanding_balance <= 0) s += 14;
    else if (creditLimit && fin.outstanding_balance > creditLimit) s -= 22;
    else s -= 6;
    if (fin.last_payment_date) s += 6;
    if (fin.credit_utilization > 90) s -= 14;
    return Math.max(10, Math.min(100, s));
  }, [fin, creditLimit]);

  const summary = `${name} has ${fin.total_invoices} ${isVendor ? "bill(s)" : "invoice(s)"} and ${format(fin.total_revenue)} lifetime ${isVendor ? "spend" : "revenue"}. ${
    fin.outstanding_balance > 0 ? `${format(fin.outstanding_balance)} is currently outstanding${creditLimit && fin.outstanding_balance > creditLimit ? " — over the credit limit." : "."}` : "There is no outstanding balance."
  }${fin.last_payment_date ? ` Last payment ${fin.last_payment_date}.` : ""}`;

  return (
    <div className="space-y-5 animate-fade-up">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold uppercase">{customer.display_name}</h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            <Badge variant={customer.status === "active" ? "default" : "secondary"}>{customer.status ?? "active"}</Badge>
            <span>{customer.customer_code ?? "—"}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild size="sm" variant="secondary"><Link href={`${listPath}/${id}/edit`}><Pencil className="mr-1 h-4 w-4" />Edit</Link></Button>
          {isVendor ? (
            <>
              <Button asChild size="sm"><Link href="/bills/new"><FileText className="mr-1 h-4 w-4" />New Bill</Link></Button>
              <Button asChild size="sm" variant="secondary"><Link href="/payments/made"><CreditCard className="mr-1 h-4 w-4" />Make Payment</Link></Button>
              <Button asChild size="sm" variant="secondary"><Link href="/purchase-orders/new"><FilePlus2 className="mr-1 h-4 w-4" />New PO</Link></Button>
            </>
          ) : (
            <>
              <Button asChild size="sm"><Link href={`/invoices/new?customer=${id}`}><FileText className="mr-1 h-4 w-4" />New Invoice</Link></Button>
              <Button asChild size="sm" variant="secondary"><Link href="/payments/received"><CreditCard className="mr-1 h-4 w-4" />Receive Payment</Link></Button>
              <Button asChild size="sm" variant="secondary"><Link href="/quotations/new"><FilePlus2 className="mr-1 h-4 w-4" />New Quote</Link></Button>
            </>
          )}
        </div>
      </div>

      {/* 360 snapshot */}
      <Bento className="lg:grid-cols-12">
        <BentoCard span="col-span-1 lg:col-span-3"><Metric label={isVendor ? "Outstanding payables" : "Outstanding"} value={format(fin.outstanding_balance)} /></BentoCard>
        <BentoCard span="col-span-1 lg:col-span-3"><Metric label="Unused credits" value={format(fin.unused_credits)} /></BentoCard>
        <BentoCard span="col-span-1 lg:col-span-3"><Metric label={isVendor ? "Lifetime spend" : "Lifetime revenue"} value={format(fin.total_revenue)} sub={`${fin.total_invoices} ${isVendor ? "bills" : "invoices"}`} /></BentoCard>
        <BentoCard span="col-span-1 lg:col-span-3">
          <p className="text-[12px] font-medium text-muted-foreground">Relationship score</p>
          <div className="mt-1 flex items-center gap-3">
            <HealthRing score={score} size={64} />
            <Pill tone={score >= 75 ? "emerald" : score >= 50 ? "amber" : "red"}>{score >= 75 ? "Strong" : score >= 50 ? "Fair" : "At risk"}</Pill>
          </div>
        </BentoCard>
        <BentoCard span="col-span-2 lg:col-span-12" interactive={false} tone="indigo">
          <p className="flex items-center gap-1.5 text-[12px] font-medium text-muted-foreground"><Sparkles className="h-4 w-4 text-indigo-500" />AI Summary</p>
          <p className="mt-1 text-[13px] leading-relaxed text-foreground/90">{summary}</p>
          <button type="button" onClick={() => openDock(`Summarize my relationship with ${name} and suggest next steps`)} className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-indigo-600 hover:underline">Ask AI for next steps <ArrowRight className="h-3.5 w-3.5" /></button>
        </BentoCard>
      </Bento>

      {/* Tabs */}
      <div role="tablist" className="flex flex-wrap gap-1 rounded-2xl border bg-card p-1 shadow-card">
        {TABS.map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={cn("rounded-xl px-4 py-1.5 text-sm font-medium transition-colors", tab === t ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground")}>
            {t}
          </button>
        ))}
      </div>

      {tab === "Overview" ? <OverviewTab id={id} customer={customer} fin={fin} creditLimit={creditLimit} kind={kind} base={base} listPath={listPath} /> : null}
      {tab === "Comments" ? <CommentsTab id={id} base={base} /> : null}
      {tab === "Transactions" ? <TransactionsTab id={id} kind={kind} base={base} /> : null}
      {tab === "Mails" ? <MailsTab id={id} customer={customer} base={base} /> : null}
      {tab === "Statement" ? <StatementTab id={id} base={base} /> : null}
    </div>
  );
}

function OverviewTab({ id, customer, fin, creditLimit, kind, base, listPath }: { id: string; customer: Customer; fin: Financials; creditLimit: number | null; kind: "customer" | "vendor"; base: string; listPath: string }) {
  const { format, currency: baseCurrency } = useCurrency();
  const isVendor = kind === "vendor";
  const editHref = `${listPath}/${id}/edit`;
  const { data: timeline = [] } = useQuery({
    queryKey: ["party-timeline", kind, id],
    queryFn: async () => ((await getJson(`${base}/${id}/timeline`))?.data ?? []) as Array<{ type: string; label: string; date: string; amount?: number }>
  });
  const income = customer.monthly_income ?? [];
  const totalIncome = income.reduce((sum, m) => sum + m.total, 0);
  const initial = (customer.display_name ?? "?").trim().charAt(0).toUpperCase();
  const cust = customer.currency ?? baseCurrency;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,360px)_1fr]">
      {/* Left: profile + address + other details */}
      <div className="space-y-4">
        <Card><CardContent className="space-y-2 pt-5">
          <p className="text-sm font-semibold uppercase">{customer.display_name}</p>
          <div className="flex items-start gap-3 pt-1">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-muted text-lg font-semibold text-muted-foreground">{initial}</div>
            <div className="min-w-0 text-sm">
              {customer.email ? <p className="truncate">{customer.email}</p> : <p className="text-muted-foreground">No email</p>}
              {customer.mobile || customer.phone ? <p className="text-muted-foreground">📞 {customer.mobile || customer.phone}</p> : null}
              <div className="mt-1 flex flex-wrap gap-3">
                <Link href={editHref} className="text-primary hover:underline">{customer.portal_enabled ? "Portal enabled" : "Invite to Portal"}</Link>
                {customer.email ? <a className="text-primary hover:underline" href={`mailto:${customer.email}`}>Send Email</a> : null}
              </div>
            </div>
          </div>
        </CardContent></Card>

        <Card><CardContent className="space-y-3 pt-5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Address</p>
            <Link href={editHref} className="text-muted-foreground hover:text-foreground"><Pencil className="h-3.5 w-3.5" /></Link>
          </div>
          <div>
            <p className="text-sm font-medium">Billing Address</p>
            {addrLines(customer.billing_address).length ? addrLines(customer.billing_address).map((l, i) => <p key={i} className="text-sm text-muted-foreground">{l}</p>) : <p className="text-sm text-muted-foreground">—</p>}
          </div>
          <div>
            <p className="text-sm font-medium">Shipping Address</p>
            {addrLines(customer.shipping_address).length ? addrLines(customer.shipping_address).map((l, i) => <p key={i} className="text-sm text-muted-foreground">{l}</p>) : (
              <p className="text-sm"><span className="text-muted-foreground">No Shipping Address - </span><Link href={editHref} className="text-primary hover:underline">New Address</Link></p>
            )}
          </div>
          <Link href={editHref} className="block text-sm text-primary hover:underline">Add additional address</Link>
        </CardContent></Card>

        <Card><CardContent className="space-y-2 pt-5">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Other Details</p>
          <Row k={isVendor ? "Vendor Type" : "Customer Type"} v={customer.contact_kind === "individual" ? "Individual" : "Business"} />
          <Row k="Default Currency" v={customer.currency} />
          <Row k="GSTIN" v={customer.tax_id} />
          <Row k="PAN" v={customer.pan} />
          <Row k="Portal Status" v={customer.portal_enabled ? "Enabled" : "Disabled"} />
          <Row k={isVendor ? "Vendor Language" : "Customer Language"} v={customer.customer_language === "hi" ? "Hindi" : "English"} />
          {(customer.custom_fields ?? []).map((c, i) => <Row key={i} k={c.label} v={c.value} />)}
        </CardContent></Card>
      </div>

      {/* Right: payment terms + receivables + income + timeline */}
      <div className="space-y-6">
        <div>
          <p className="text-sm text-muted-foreground">Payment due period</p>
          <p className="text-lg font-semibold">Net {customer.payment_terms ?? 30}</p>
        </div>

        <div>
          <p className="mb-2 text-base font-semibold">{isVendor ? "Payables" : "Receivables"}</p>
          <div className="overflow-hidden rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr><th className="px-4 py-2 text-left">Currency</th><th className="px-4 py-2 text-right">{isVendor ? "Outstanding Payables" : "Outstanding Receivables"}</th><th className="px-4 py-2 text-right">Unused Credits</th></tr>
              </thead>
              <tbody>
                <tr className="border-t">
                  <td className="px-4 py-2">{cust} — {cust === "INR" ? "Indian Rupee" : cust}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{format(fin.outstanding_balance)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{format(fin.unused_credits)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          {!customer.opening_balance ? <Link href={editHref} className="mt-2 inline-block text-sm text-primary hover:underline">Enter Opening Balance</Link> : null}
          {creditLimit ? <p className="mt-2 text-xs text-muted-foreground">Credit limit {format(creditLimit)} · {fin.credit_utilization.toFixed(0)}% utilized</p> : null}
        </div>

        <div>
          <div className="mb-1 flex items-baseline gap-3">
            <p className="text-base font-semibold">{isVendor ? "Expenses" : "Income"}</p>
            <span className="text-xs text-muted-foreground">Last 6 months · organization base currency</span>
          </div>
          {income.length ? (
            <div className="h-56">
              <ClientResponsiveContainer width="100%" height="100%">
                <BarChart data={income}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="month" fontSize={11} />
                  <YAxis fontSize={11} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))} />
                  <Tooltip formatter={(v: number) => format(v)} />
                  <Bar dataKey="total" fill={isVendor ? "#F59E0B" : "#0EA5E9"} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ClientResponsiveContainer>
            </div>
          ) : <p className="text-sm text-muted-foreground">No data.</p>}
          <p className="mt-1 text-sm">Total {isVendor ? "Expenses" : "Income"} (Last 6 Months) — <span className="font-semibold tabular-nums">{format(totalIncome)}</span></p>
        </div>

        <div>
          <p className="mb-2 text-base font-semibold">Recent activity</p>
          {timeline.length === 0 ? <p className="text-sm text-muted-foreground">No activity yet.</p> : (
            <ol className="relative space-y-3 border-l pl-4">
              {timeline.slice(0, 12).map((e, i) => (
                <li key={i} className="relative">
                  <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-primary" />
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm">{e.label}{typeof e.amount === "number" ? <span className="ml-2 tabular-nums text-muted-foreground">{format(e.amount)}</span> : null}</p>
                    <span className="text-xs text-muted-foreground">{e.date}</span>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: unknown }) {
  return <div className="flex justify-between gap-4 text-sm"><dt className="text-muted-foreground">{k}</dt><dd className="text-right">{v ? String(v) : "—"}</dd></div>;
}

function CommentsTab({ id, base }: { id: string; base: string }) {
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const { data = [] } = useQuery({
    queryKey: ["party-comments", base, id],
    queryFn: async () => ((await getJson(`${base}/${id}/comments`))?.data ?? []) as Array<{ id: string; body: string; created_at: string; user_name?: string }>
  });
  const add = async () => {
    if (!body.trim()) return;
    const r = await fetch(`${base}/${id}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }) });
    if (!r.ok) { toast.error("Could not add comment."); return; }
    setBody(""); qc.invalidateQueries({ queryKey: ["party-comments", base, id] });
  };
  return (
    <Card><CardContent className="space-y-4 pt-6">
      <div className="flex gap-2">
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add a comment…" rows={2} />
        <Button type="button" onClick={add} disabled={!body.trim()}>Comment</Button>
      </div>
      {data.length === 0 ? <p className="text-sm text-muted-foreground">No comments yet.</p> : (
        <ul className="space-y-3">
          {data.map((c) => (
            <li key={c.id} className="rounded-md border p-3">
              <p className="text-sm">{c.body}</p>
              <p className="mt-1 text-xs text-muted-foreground">{c.user_name ?? "User"} · {c.created_at}</p>
            </li>
          ))}
        </ul>
      )}
    </CardContent></Card>
  );
}

const TXN_GROUPS: { key: string; label: string; numberKey: string; numberLabel: string; amountKey?: string; balanceKey?: string; newHref?: (id: string) => string }[] = [
  { key: "invoices", label: "Invoices", numberKey: "number", numberLabel: "Invoice Number", amountKey: "amount", balanceKey: "balance_due", newHref: (id) => `/invoices/new?customer=${id}` },
  { key: "payments", label: "Customer Payments", numberKey: "number", numberLabel: "Reference", amountKey: "amount", newHref: () => "/payments/received" },
  { key: "quotes", label: "Quotes", numberKey: "number", numberLabel: "Quote Number", amountKey: "amount", newHref: () => "/quotations/new" },
  { key: "sales_orders", label: "Sales Orders", numberKey: "number", numberLabel: "Order Number", amountKey: "amount", newHref: () => "/sales-orders/new" },
  { key: "delivery_challans", label: "Delivery Challans", numberKey: "number", numberLabel: "Challan Number", newHref: () => "/delivery-challans/new" },
  { key: "recurring_invoices", label: "Recurring Invoices", numberKey: "frequency", numberLabel: "Frequency", newHref: () => "/recurring" },
  { key: "expenses", label: "Expenses", numberKey: "id", numberLabel: "Reference", amountKey: "amount", newHref: () => "/expenses/new" },
  { key: "recurring_expenses", label: "Recurring Expenses", numberKey: "frequency", numberLabel: "Frequency", newHref: () => "/recurring" },
  { key: "journals", label: "Journals", numberKey: "number", numberLabel: "Entry", newHref: () => "/journal-entries/new" },
  { key: "bills", label: "Bills", numberKey: "number", numberLabel: "Bill Number", amountKey: "amount", balanceKey: "balance_due", newHref: () => "/bills/new" },
  { key: "credit_notes", label: "Credit Notes", numberKey: "number", numberLabel: "Credit Note", amountKey: "amount", newHref: () => "/credit-notes/new" }
];

const VENDOR_TXN_GROUPS: typeof TXN_GROUPS = [
  { key: "bills", label: "Bills", numberKey: "number", numberLabel: "Bill Number", amountKey: "amount", balanceKey: "balance_due", newHref: () => "/bills/new" },
  { key: "payments", label: "Payments Made", numberKey: "number", numberLabel: "Reference", amountKey: "amount", newHref: () => "/payments/made" },
  { key: "purchase_orders", label: "Purchase Orders", numberKey: "number", numberLabel: "PO Number", amountKey: "amount", newHref: () => "/purchase-orders/new" },
  { key: "vendor_credits", label: "Vendor Credits", numberKey: "number", numberLabel: "Vendor Credit", amountKey: "amount", newHref: () => "/vendor-credits/new" },
  { key: "expenses", label: "Expenses", numberKey: "id", numberLabel: "Reference", amountKey: "amount", newHref: () => "/expenses/new" },
  { key: "recurring_bills", label: "Recurring Bills", numberKey: "frequency", numberLabel: "Frequency", newHref: () => "/recurring" },
  { key: "recurring_expenses", label: "Recurring Expenses", numberKey: "frequency", numberLabel: "Frequency", newHref: () => "/recurring" },
  { key: "journals", label: "Journals", numberKey: "number", numberLabel: "Entry", newHref: () => "/journal-entries/new" }
];

function TransactionsTab({ id, kind, base }: { id: string; kind: "customer" | "vendor"; base: string }) {
  const { format } = useCurrency();
  const groups = kind === "vendor" ? VENDOR_TXN_GROUPS : TXN_GROUPS;
  const { data } = useQuery({
    queryKey: ["party-transactions", kind, id],
    queryFn: async () => ((await getJson(`${base}/${id}/transactions`))?.data ?? {}) as Record<string, Array<Record<string, unknown>>>
  });
  const [open, setOpen] = useState<Record<string, boolean>>(kind === "vendor" ? { bills: true, payments: true } : { invoices: true, payments: true });

  if (!data) return <p className="text-sm text-muted-foreground">Loading…</p>;
  const hasLocation = (rows: Array<Record<string, unknown>>) => rows.some((r) => r.location);

  return (
    <div className="space-y-3">
      {groups.map((g) => {
        const rows = data[g.key] ?? [];
        const isOpen = open[g.key] ?? false;
        const showLoc = hasLocation(rows);
        return (
          <Card key={g.key}><CardContent className="p-0">
            <div className="flex w-full items-center justify-between px-4 py-3">
              <button type="button" onClick={() => setOpen((o) => ({ ...o, [g.key]: !isOpen }))} className="flex items-center gap-2 text-left text-sm font-semibold">
                {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}{g.label}
                <span className="ml-1 text-xs font-normal text-muted-foreground">{rows.length}</span>
              </button>
              {g.newHref ? <Link href={g.newHref(id)} className="flex items-center gap-1 text-sm text-primary hover:underline"><Plus className="h-4 w-4" />New</Link> : null}
            </div>
            {isOpen ? (
              rows.length === 0 ? <p className="px-4 pb-4 text-sm text-muted-foreground">No {g.label.toLowerCase()}.</p> : (
                <div className="overflow-x-auto border-t">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2 text-left">Date</th>
                        {showLoc ? <th className="px-4 py-2 text-left">Location</th> : null}
                        <th className="px-4 py-2 text-left">{g.numberLabel}</th>
                        <th className="px-4 py-2 text-right">Amount</th>
                        {g.balanceKey ? <th className="px-4 py-2 text-right">Balance Due</th> : null}
                        <th className="px-4 py-2 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {rows.map((r, i) => (
                        <tr key={i}>
                          <td className="px-4 py-2">{String(r.date ?? r.next_run ?? "—")}</td>
                          {showLoc ? <td className="px-4 py-2 text-muted-foreground">{r.location ? String(r.location) : "—"}</td> : null}
                          <td className="px-4 py-2">{String(r[g.numberKey] ?? "—")}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{g.amountKey && r[g.amountKey] != null ? format(Number(r[g.amountKey])) : "—"}</td>
                          {g.balanceKey ? <td className="px-4 py-2 text-right tabular-nums">{r[g.balanceKey] != null ? format(Number(r[g.balanceKey])) : "—"}</td> : null}
                          <td className="px-4 py-2 text-right text-muted-foreground">{String(r.status ?? (r.is_active ? "Active" : ""))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            ) : null}
          </CardContent></Card>
        );
      })}
    </div>
  );
}

type EmailRow = { id: string; to_email: string; subject: string; body?: string; status: string; error?: string | null; created_at: string };

const EMAIL_STATUS: Record<string, "default" | "secondary" | "destructive" | "outline"> = { sent: "default", queued: "secondary", failed: "destructive" };

function MailsTab({ id, customer, base }: { id: string; customer: Customer; base: string }) {
  const qc = useQueryClient();
  const [composing, setComposing] = useState(false);
  const [to, setTo] = useState(customer.email ?? "");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  const { data = [] } = useQuery({
    queryKey: ["party-emails", base, id],
    queryFn: async () => ((await getJson(`${base}/${id}/emails`))?.data ?? []) as EmailRow[]
  });

  const send = async () => {
    if (!subject.trim() || !body.trim()) { toast.error("Subject and message are required."); return; }
    setSending(true);
    try {
      const r = await fetch(`${base}/${id}/emails`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ to: to || undefined, subject, body }) });
      const payload = (await r.json().catch(() => null)) as { data?: { delivery?: { status?: string; message?: string } }; error?: { message?: string } } | null;
      if (!r.ok) { toast.error(payload?.error?.message ?? "Could not send the email."); return; }
      const status = payload?.data?.delivery?.status;
      toast.success(status === "sent" ? "Email sent." : status === "queued" ? "Email logged (provider not configured)." : "Email recorded.");
      setSubject(""); setBody(""); setComposing(false);
      qc.invalidateQueries({ queryKey: ["party-emails", base, id] });
    } finally {
      setSending(false);
    }
  };

  return (
    <Card><CardContent className="space-y-4 pt-6">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Client Emails</p>
        <Button type="button" size="sm" onClick={() => setComposing((c) => !c)}><Mail className="mr-1 h-4 w-4" />{composing ? "Close" : "Compose"}</Button>
      </div>

      {composing ? (
        <div className="space-y-2 rounded-md border p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <div><label className="text-xs text-muted-foreground">To</label><Input className="mt-1" type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder={customer.email ?? "recipient@example.com"} /></div>
            <div><label className="text-xs text-muted-foreground">Subject</label><Input className="mt-1" value={subject} onChange={(e) => setSubject(e.target.value)} /></div>
          </div>
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} placeholder="Write your message…" />
          <div className="flex justify-end"><Button type="button" onClick={send} disabled={sending}>{sending ? "Sending…" : "Send email"}</Button></div>
        </div>
      ) : null}

      {data.length === 0 ? (
        <p className="text-sm text-muted-foreground">No emails yet. Compose one above — it is delivered when a provider (RESEND_API_KEY) is configured, and always logged here.</p>
      ) : (
        <ul className="divide-y">
          {data.map((m) => (
            <li key={m.id} className="flex items-start justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{m.subject}</p>
                <p className="truncate text-xs text-muted-foreground">To {m.to_email}{m.error ? ` · ${m.error}` : ""}</p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <Badge variant={EMAIL_STATUS[m.status] ?? "secondary"}>{m.status}</Badge>
                <span className="text-xs text-muted-foreground">{m.created_at}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </CardContent></Card>
  );
}

function StatementTab({ id, base }: { id: string; base: string }) {
  const { format } = useCurrency();
  const now = new Date();
  const [from, setFrom] = useState(`${now.getFullYear()}-04-01`);
  const [to, setTo] = useState(now.toISOString().slice(0, 10));
  const [outstanding, setOutstanding] = useState(false);
  const [location, setLocation] = useState("");

  const { data: warehouses = [] } = useQuery({
    queryKey: ["statement-locations"],
    queryFn: async () => ((await getJson("/api/v1/warehouses?per_page=100"))?.data ?? []) as Array<Record<string, unknown>>
  });

  const { data } = useQuery({
    queryKey: ["party-statement", base, id, from, to, outstanding],
    queryFn: async () => (await getJson(`${base}/${id}/statement?from=${from}&to=${to}&outstanding=${outstanding}`))?.data ?? null
  });

  return (
    <Card><CardContent className="space-y-4 pt-6">
      <div className="flex flex-wrap items-end gap-3">
        <div><label className="text-xs text-muted-foreground">From</label><Input type="date" className="mt-1 w-40" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><label className="text-xs text-muted-foreground">To</label><Input type="date" className="mt-1 w-40" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <div>
          <label className="text-xs text-muted-foreground">Location</label>
          <select className="mt-1 h-10 w-44 rounded-md border bg-background px-2 text-sm" value={location} onChange={(e) => setLocation(e.target.value)}>
            <option value="">All locations</option>
            {warehouses.map((w) => <option key={String(w.id)} value={String(w.id)}>{String(w.name)}</option>)}
          </select>
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" className="h-4 w-4 accent-sky-600" checked={outstanding} onChange={(e) => setOutstanding(e.target.checked)} />Outstanding only</label>
      </div>

      {!data ? <p className="text-sm text-muted-foreground">Loading…</p> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr><th className="px-3 py-2 text-left">Date</th><th className="px-3 py-2 text-left">Transaction</th><th className="px-3 py-2 text-right">Debit</th><th className="px-3 py-2 text-right">Credit</th><th className="px-3 py-2 text-right">Balance</th></tr>
            </thead>
            <tbody className="divide-y">
              {!outstanding ? (
                <tr className="bg-muted/20 font-medium"><td className="px-3 py-2" colSpan={4}>Opening Balance</td><td className="px-3 py-2 text-right tabular-nums">{format(data.opening_balance)}</td></tr>
              ) : null}
              {data.lines.length === 0 ? (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">No transactions in this period.</td></tr>
              ) : data.lines.map((l: Record<string, unknown>, i: number) => (
                <tr key={i}>
                  <td className="px-3 py-2">{String(l.date)}</td>
                  <td className="px-3 py-2">{String(l.type)} {String(l.number)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{Number(l.debit) ? format(Number(l.debit)) : ""}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{Number(l.credit) ? format(Number(l.credit)) : ""}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{format(Number(l.balance))}</td>
                </tr>
              ))}
              <tr className="border-t-2 font-bold">
                <td className="px-3 py-2" colSpan={2}>Closing Balance</td>
                <td className="px-3 py-2 text-right tabular-nums">{format(data.totals.debit)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{format(data.totals.credit)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{format(data.closing_balance)}</td>
              </tr>
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted-foreground">Location filter applies to transactions tagged to a branch; invoices/payments are shown across all locations.</p>
        </div>
      )}
    </CardContent></Card>
  );
}
