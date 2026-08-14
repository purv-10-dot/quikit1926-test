"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, Package } from "lucide-react";
import { formatGeneric } from "@/lib/services/opportunities/currency";
import type { SerializedProduct } from "@/lib/services/products/serialize";

export type ProductTabKey =
  | "overview"
  | "pricing"
  | "inventory"
  | "quotes"
  | "orders"
  | "documents"
  | "analytics";

const TABS: { key: ProductTabKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "pricing", label: "Pricing" },
  { key: "inventory", label: "Inventory" },
  { key: "quotes", label: "Quotes" },
  { key: "orders", label: "Orders" },
  { key: "documents", label: "Documents" },
  { key: "analytics", label: "Analytics" },
];

export interface ProductFullRecord {
  product: SerializedProduct;
  variants: {
    id: string;
    sku: string;
    name: string | null;
    barcode: string | null;
    listPrice: number | null;
    attributes: unknown;
    isActive: boolean;
  }[];
  images: { id: string; url: string; label: string | null; isPrimary: boolean }[];
  priceLists: {
    id: string;
    unitPrice: number;
    discountPct: number;
    minQuantity: number;
    priceList: { id: string; name: string; currency: string; isDefault: boolean };
  }[];
  inventory: {
    id: string;
    warehouse: { id: string; name: string; code: string | null };
    variant: { id: string; sku: string; name: string | null } | null;
    quantityOnHand: number;
    quantityReserved: number;
    quantityAvailable: number;
    lowStockThreshold: number | null;
    isLowStock: boolean;
  }[];
  stockMovements: {
    id: string;
    movementType: string;
    quantity: number;
    reference: string | null;
    notes: string | null;
    createdAt: string;
    warehouse: { id: string; name: string };
  }[];
  lowStockAlerts: unknown[];
  analytics: {
    quoteLineCount: number;
    orderLineCount: number;
    quotedRevenue: number;
    orderedRevenue: number;
  };
  quotes: {
    id: string;
    quoteId: string;
    productName: string;
    quantity: unknown;
    lineTotal: unknown;
    quote: { quoteNumber: string; status: string };
  }[];
  orders: {
    id: string;
    orderId: string;
    productName: string;
    quantity: unknown;
    lineTotal: unknown;
    order: { orderNumber: string; status: string };
  }[];
  documents: { id: string; fileName: string; contentType: string; createdAt: string }[];
}

export function ProductDashboardShell({ record }: { record: ProductFullRecord }) {
  const [tab, setTab] = useState<ProductTabKey>("overview");
  const p = record.product;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-3">
        <Link
          href="/products"
          className="inline-flex items-center gap-1 text-sm text-crm-muted hover:text-crm-text"
        >
          <ChevronLeft size={16} />
          Products
        </Link>
      </div>

      <div className="crm-card p-5">
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent-100 text-accent-700">
            <Package size={24} />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-semibold text-crm-text">{p.name}</h1>
            <p className="text-sm text-crm-muted">
              SKU {p.sku}
              {p.barcode ? ` · Barcode ${p.barcode}` : ""}
              {p.categoryName ? ` · ${p.categoryName}` : ""}
              {p.brandName ? ` · ${p.brandName}` : ""}
            </p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-accent-50 px-2 py-0.5 text-accent-800 ring-1 ring-accent-200">
                GST {p.gstRate}% (CGST {p.cgstRate}% / SGST {p.sgstRate}%)
              </span>
              {p.hsnCode && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">
                  HSN {p.hsnCode}
                </span>
              )}
              <span
                className={
                  "rounded-full px-2 py-0.5 " +
                  (p.isActive ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600")
                }
              >
                {p.isActive ? "Active" : "Inactive"}
              </span>
              {record.lowStockAlerts.length > 0 && (
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-800">
                  Low stock
                </span>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="text-lg font-semibold text-crm-text">
              {formatGeneric(p.listPrice, p.currency)}
            </div>
            <div className="text-xs text-crm-muted">List price</div>
          </div>
        </div>
      </div>

      <nav className="flex flex-wrap gap-1 border-b border-crm-border pb-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={
              "rounded-t-lg px-3 py-2 text-sm font-medium " +
              (tab === t.key
                ? "border-b-2 border-accent-600 text-accent-700"
                : "text-crm-muted hover:text-crm-text")
            }
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "overview" && <OverviewTab record={record} />}
      {tab === "pricing" && <PricingTab record={record} />}
      {tab === "inventory" && <InventoryTab record={record} />}
      {tab === "quotes" && <QuotesTab record={record} />}
      {tab === "orders" && <OrdersTab record={record} />}
      {tab === "documents" && <DocumentsTab record={record} />}
      {tab === "analytics" && <AnalyticsTab record={record} />}
    </div>
  );
}

function OverviewTab({ record }: { record: ProductFullRecord }) {
  const p = record.product;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="Product details">
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <Dt label="Manufacturer" value={p.manufacturer} />
          <Dt label="Warranty" value={p.warrantyMonths != null ? `${p.warrantyMonths} mo` : null} />
          <Dt label="SAC" value={p.sacCode} />
          <Dt label="Weight" value={p.weightKg != null ? `${p.weightKg} kg` : null} />
          <Dt
            label="Dimensions"
            value={
              p.lengthCm != null
                ? `${p.lengthCm} × ${p.widthCm} × ${p.heightCm} cm`
                : null
            }
          />
          <Dt label="Serial tracked" value={p.serialTracked ? "Yes" : "No"} />
          <Dt label="Family" value={p.familyName} />
          <Dt label="Subcategory" value={p.subcategoryName} />
        </dl>
        {p.description && (
          <p className="mt-3 text-sm text-crm-muted whitespace-pre-wrap">{p.description}</p>
        )}
      </Panel>
      <Panel title="Variants">
        {record.variants.length === 0 ? (
          <p className="text-sm text-crm-muted">No variants — base SKU only.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {record.variants.map((v) => (
              <li key={v.id} className="flex justify-between gap-2 border-b border-crm-border pb-2">
                <span>
                  <span className="font-medium">{v.sku}</span>
                  {v.name ? ` — ${v.name}` : ""}
                </span>
                <span className="text-crm-muted">
                  {v.listPrice != null ? formatGeneric(v.listPrice, p.currency) : "—"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      {record.images.length > 0 && (
        <Panel title="Images" className="lg:col-span-2">
          <div className="flex flex-wrap gap-3">
            {record.images.map((img) => (
              <a
                key={img.id}
                href={img.url}
                target="_blank"
                rel="noreferrer"
                className="block overflow-hidden rounded-lg border border-crm-border"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.url} alt={img.label ?? p.name} className="h-24 w-24 object-cover" />
              </a>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}

function PricingTab({ record }: { record: ProductFullRecord }) {
  const p = record.product;
  return (
    <Panel title="Price lists">
      {record.priceLists.length === 0 ? (
        <p className="text-sm text-crm-muted">
          No price list entries. Add this product to a{" "}
          <Link href="/price-lists" className="text-accent-700 hover:underline">
            price list
          </Link>
          .
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-crm-muted">
              <th className="pb-2">List</th>
              <th className="pb-2">Unit price</th>
              <th className="pb-2">Min qty</th>
            </tr>
          </thead>
          <tbody>
            {record.priceLists.map((row) => (
              <tr key={row.id} className="border-t border-crm-border">
                <td className="py-2">
                  <Link href={`/price-lists/${row.priceList.id}`} className="text-accent-700 hover:underline">
                    {row.priceList.name}
                    {row.priceList.isDefault ? " (default)" : ""}
                  </Link>
                </td>
                <td className="py-2">{formatGeneric(row.unitPrice, row.priceList.currency)}</td>
                <td className="py-2">{row.minQuantity}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="mt-3 text-xs text-crm-muted">
        Base list: {formatGeneric(p.listPrice, p.currency)} · GST {p.gstRate}%
      </p>
    </Panel>
  );
}

function InventoryTab({ record }: { record: ProductFullRecord }) {
  return (
    <div className="space-y-4">
      <Panel title="Stock by warehouse">
        {record.inventory.length === 0 ? (
          <p className="text-sm text-crm-muted">No inventory rows yet. Record a stock movement to initialize.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-crm-muted">
                <th className="pb-2">Warehouse</th>
                <th className="pb-2">On hand</th>
                <th className="pb-2">Reserved</th>
                <th className="pb-2">Available</th>
              </tr>
            </thead>
            <tbody>
              {record.inventory.map((row) => (
                <tr key={row.id} className="border-t border-crm-border">
                  <td className="py-2">{row.warehouse.name}</td>
                  <td className="py-2">{row.quantityOnHand}</td>
                  <td className="py-2">{row.quantityReserved}</td>
                  <td className={"py-2 " + (row.isLowStock ? "font-medium text-amber-700" : "")}>
                    {row.quantityAvailable}
                    {row.isLowStock ? " · Low" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
      <Panel title="Recent movements">
        {record.stockMovements.length === 0 ? (
          <p className="text-sm text-crm-muted">No movements logged.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {record.stockMovements.map((m) => (
              <li key={m.id} className="flex flex-wrap justify-between gap-2 border-b border-crm-border pb-2">
                <span>
                  {m.movementType} {m.quantity > 0 ? "+" : ""}
                  {m.quantity} @ {m.warehouse.name}
                </span>
                <span className="text-crm-muted">{new Date(m.createdAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function QuotesTab({ record }: { record: ProductFullRecord }) {
  return (
    <Panel title="Quote lines">
      {record.quotes.length === 0 ? (
        <p className="text-sm text-crm-muted">Not used on any quotes yet.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {record.quotes.map((q) => (
            <li key={q.id}>
              <Link href={`/quotes/${q.quoteId}`} className="text-accent-700 hover:underline">
                {q.quote.quoteNumber}
              </Link>{" "}
              — {q.quote.status}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function OrdersTab({ record }: { record: ProductFullRecord }) {
  return (
    <Panel title="Order lines">
      {record.orders.length === 0 ? (
        <p className="text-sm text-crm-muted">Not on any orders yet.</p>
      ) : (
        <ul className="space-y-2 text-sm">
          {record.orders.map((o) => (
            <li key={o.id}>
              <Link href={`/orders/${o.orderId}`} className="text-accent-700 hover:underline">
                {o.order.orderNumber}
              </Link>{" "}
              — {o.order.status}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function DocumentsTab({ record }: { record: ProductFullRecord }) {
  return (
    <Panel title="Attachments">
      {record.documents.length === 0 ? (
        <p className="text-sm text-crm-muted">
          No documents linked. Upload from the global Documents module with ref type{" "}
          <code className="text-xs">product</code>.
        </p>
      ) : (
        <ul className="space-y-2 text-sm">
          {record.documents.map((d) => (
            <li key={d.id}>{d.fileName}</li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

function AnalyticsTab({ record }: { record: ProductFullRecord }) {
  const a = record.analytics;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Metric label="Quote lines" value={String(a.quoteLineCount)} />
      <Metric label="Order lines" value={String(a.orderLineCount)} />
      <Metric label="Quoted revenue" value={formatGeneric(a.quotedRevenue, record.product.currency)} />
      <Metric label="Ordered revenue" value={formatGeneric(a.orderedRevenue, record.product.currency)} />
    </div>
  );
}

function Panel({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={"crm-card p-4 " + className}>
      <h2 className="mb-3 text-sm font-semibold text-crm-text">{title}</h2>
      {children}
    </section>
  );
}

function Dt({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <>
      <dt className="text-crm-muted">{label}</dt>
      <dd className="text-crm-text">{value}</dd>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="crm-card p-4">
      <div className="text-xs uppercase tracking-wide text-crm-muted">{label}</div>
      <div className="mt-1 text-lg font-semibold text-crm-text">{value}</div>
    </div>
  );
}
