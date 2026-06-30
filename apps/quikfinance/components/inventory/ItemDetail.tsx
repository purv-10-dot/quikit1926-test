"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Pencil, X, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useCurrency } from "@/lib/currency";
import { cn } from "@/lib/utils/cn";
import { ItemCodes } from "@/components/inventory/ItemCodes";

const TABS = ["Overview", "Transactions", "History"] as const;
type Tab = (typeof TABS)[number];

type Item = Record<string, unknown>;
type Account = { id: string; name: string };
type Vendor = { id: string; display_name: string };
type Txn = { id: string; number?: string; date?: string; status?: string; quantity?: number | string; amount?: number | string };

const TXN_TYPES: { key: string; label: string }[] = [
  { key: "invoices", label: "Invoices" },
  { key: "bills", label: "Bills" },
  { key: "delivery_challans", label: "Delivery Challans" },
  { key: "goods_receipts", label: "Goods Receipts" }
];

async function getJson(path: string) {
  const r = await fetch(path);
  return r.ok ? r.json() : null;
}

export function ItemDetail({ id }: { id: string }) {
  const router = useRouter();
  const { format } = useCurrency();
  const [tab, setTab] = useState<Tab>("Overview");

  const { data: item, isPending } = useQuery<Item | null>({
    queryKey: ["item", id],
    queryFn: async () => (await getJson(`/api/v1/inventory/${id}`))?.data ?? null
  });
  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ["accounts-for-items"],
    queryFn: async () => ((await getJson("/api/v1/accounts?per_page=200"))?.data ?? []) as Account[]
  });
  const { data: vendors = [] } = useQuery<Vendor[]>({
    queryKey: ["vendors-for-items"],
    queryFn: async () => ((await getJson("/api/v1/vendors?per_page=200"))?.data ?? []) as Vendor[]
  });
  const { data: categories = [] } = useQuery<{ id: string; name: string }[]>({
    queryKey: ["item-categories"],
    queryFn: async () => ((await getJson("/api/v1/inventory/categories?all=1"))?.data ?? []) as { id: string; name: string }[]
  });

  const accountName = (aid: unknown) => accounts.find((a) => a.id === aid)?.name ?? "—";
  const vendorName = (vid: unknown) => vendors.find((v) => v.id === vid)?.display_name ?? "—";
  const categoryName = (cid: unknown) => categories.find((c) => c.id === cid)?.name;
  const TYPE_LABELS: Record<string, string> = { inventory: "Inventory", non_inventory: "Non-Inventory", service: "Service", bundle: "Bundle", goods: "Inventory" };

  if (isPending) return <div className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!item)
    return (
      <div className="rounded-lg border bg-card p-6 text-sm">
        <p className="font-medium">Item not found.</p>
        <Link href="/inventory" className="mt-3 inline-block text-primary hover:underline">← Back to items</Link>
      </div>
    );

  const isService = item.item_type === "service";
  const tagList = String(item.tags ?? "").split(",").map((t) => t.trim()).filter(Boolean);

  return (
    <div className="space-y-5 animate-fade-up">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-2xl font-bold uppercase">{String(item.name ?? "")}</h1>
        <div className="flex items-center gap-2">
          <Button asChild size="sm" variant="secondary"><Link href={`/inventory/${id}/edit`}><Pencil className="mr-1 h-4 w-4" />Edit</Link></Button>
          <Button asChild size="sm" variant="ghost"><Link href="/inventory" aria-label="Close"><X className="h-4 w-4" /></Link></Button>
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

      {tab === "Overview" ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,360px)_1fr]">
          <Card><CardContent className="space-y-3 pt-5">
            {item.image_url ? (
              <img src={String(item.image_url)} alt={String(item.name ?? "")} className="mb-2 h-40 w-full rounded-lg border object-cover" />
            ) : null}
            <p className="text-xs font-semibold uppercase text-muted-foreground">Item Details</p>
            <Row k="Type" v={TYPE_LABELS[String(item.item_type ?? "")] ?? "—"} />
            <Row k="Item Code / SKU" v={String(item.sku ?? "—")} />
            {item.short_name ? <Row k="Short Name" v={String(item.short_name)} /> : null}
            <Row k="Unit" v={String(item.unit || "—")} />
            {categoryName(item.category_id) ? <Row k="Category" v={String(categoryName(item.category_id))} /> : null}
            {categoryName(item.subcategory_id) ? <Row k="Sub Category" v={String(categoryName(item.subcategory_id))} /> : null}
            {item.brand ? <Row k="Brand" v={String(item.brand)} /> : null}
            {item.manufacturer ? <Row k="Manufacturer" v={String(item.manufacturer)} /> : null}
            <Row k="Status" v={<Badge variant={item.is_active ? "default" : "secondary"}>{item.is_active ? "Active" : "Inactive"}</Badge>} />
            {tagList.length ? (
              <Row k="Tags" v={<span className="flex flex-wrap justify-end gap-1">{tagList.map((t) => <Badge key={t} variant="secondary">{t}</Badge>)}</span>} />
            ) : null}
            {item.barcode ? <Row k="Barcode" v={String(item.barcode)} /> : null}
            {!isService ? <Row k="Stock on hand" v={String(item.quantity_on_hand ?? 0)} /> : null}
            <div className="pt-1"><ItemCodes code={String(item.barcode || item.sku || "")} name={String(item.name ?? "")} /></div>
          </CardContent></Card>

          <div className="space-y-6">
            <div>
              <p className="mb-2 text-base font-semibold">Sales Information</p>
              <div className="overflow-hidden rounded-lg border">
                <table className="w-full text-sm">
                  <tbody className="divide-y">
                    <tr><td className="px-4 py-2 text-muted-foreground">Selling Price</td><td className="px-4 py-2 text-right tabular-nums">{format(Number(item.sales_price ?? 0))}</td></tr>
                    <tr><td className="px-4 py-2 text-muted-foreground">Account</td><td className="px-4 py-2 text-right">{accountName(item.income_account_id)}</td></tr>
                    <tr><td className="px-4 py-2 text-muted-foreground align-top">Description</td><td className="px-4 py-2 text-right">{item.description ? String(item.description) : "—"}</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
            <div>
              <p className="mb-2 text-base font-semibold">Purchase Information</p>
              <div className="overflow-hidden rounded-lg border">
                <table className="w-full text-sm">
                  <tbody className="divide-y">
                    <tr><td className="px-4 py-2 text-muted-foreground">Cost Price</td><td className="px-4 py-2 text-right tabular-nums">{format(Number(item.purchase_price ?? 0))}</td></tr>
                    <tr><td className="px-4 py-2 text-muted-foreground">Account</td><td className="px-4 py-2 text-right">{accountName(item.expense_account_id)}</td></tr>
                    <tr><td className="px-4 py-2 text-muted-foreground align-top">Description</td><td className="px-4 py-2 text-right">{item.purchase_description ? String(item.purchase_description) : "—"}</td></tr>
                    <tr><td className="px-4 py-2 text-muted-foreground">Preferred Vendor</td><td className="px-4 py-2 text-right">{vendorName(item.preferred_vendor_id)}</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {tab === "Transactions" ? <TransactionsTab id={id} /> : null}
      {tab === "History" ? <HistoryTab id={id} /> : null}
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-4 text-sm"><dt className="text-muted-foreground">{k}</dt><dd className="text-right">{v != null && v !== "" ? v : "—"}</dd></div>;
}

function Dropdown({ label, value, options, onSelect }: { label: string; value: string; options: { key: string; label: string }[]; onSelect: (key: string) => void }) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.key === value)?.label ?? value;
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm hover:bg-muted/50">
        <span className="text-muted-foreground">{label}:</span><span className="font-medium">{current}</span><ChevronDown className="h-4 w-4" />
      </button>
      {open ? (
        <div className="absolute z-10 mt-1 min-w-[200px] rounded-md border bg-popover p-1 shadow-md">
          {options.map((o) => (
            <button key={o.key} type="button" onMouseDown={() => { onSelect(o.key); setOpen(false); }}
              className={cn("block w-full rounded px-3 py-2 text-left text-sm hover:bg-muted", o.key === value && "bg-primary/10 font-medium text-primary")}>
              {o.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TransactionsTab({ id }: { id: string }) {
  const { format } = useCurrency();
  const [type, setType] = useState("invoices");
  const [status, setStatus] = useState("all");

  const { data, isPending } = useQuery({
    queryKey: ["item-transactions", id],
    queryFn: async () => ((await getJson(`/api/v1/inventory/${id}/transactions`))?.data ?? {}) as Record<string, Txn[]>
  });

  const rows = useMemo(() => (data?.[type] ?? []), [data, type]);
  const statuses = useMemo(() => Array.from(new Set(rows.map((r) => String(r.status ?? "")).filter(Boolean))), [rows]);
  const filtered = status === "all" ? rows : rows.filter((r) => String(r.status) === status);
  const typeLabel = TXN_TYPES.find((t) => t.key === type)?.label ?? "transactions";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Dropdown label="Filter By" value={type} options={TXN_TYPES} onSelect={(k) => { setType(k); setStatus("all"); }} />
        <Dropdown label="Status" value={status} options={[{ key: "all", label: "All" }, ...statuses.map((s) => ({ key: s, label: s }))]} onSelect={setStatus} />
      </div>

      {isPending ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">There are no {typeLabel.toLowerCase()}.</p>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left">Date</th>
                <th className="px-4 py-2 text-left">{typeLabel.replace(/s$/, "")} #</th>
                <th className="px-4 py-2 text-right">Quantity</th>
                <th className="px-4 py-2 text-right">Amount</th>
                <th className="px-4 py-2 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2">{r.date ?? "—"}</td>
                  <td className="px-4 py-2">{r.number ?? "—"}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{Number(r.quantity ?? 0)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{format(Number(r.amount ?? 0))}</td>
                  <td className="px-4 py-2 text-right text-muted-foreground">{r.status ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function HistoryTab({ id }: { id: string }) {
  const { data = [], isPending } = useQuery({
    queryKey: ["item-history", id],
    queryFn: async () => ((await getJson(`/api/v1/inventory/${id}/history`))?.data ?? []) as Array<{ id: string; action: string; at: string; user_name?: string }>
  });

  if (isPending) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (data.length === 0) return <p className="py-10 text-center text-sm text-muted-foreground">No history yet.</p>;

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
