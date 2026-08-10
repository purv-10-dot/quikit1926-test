"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import {
  Table,
  TableScroll,
  THead,
  TBody,
  TR,
  TH,
  TD,
} from "@/components/ui/table";

interface PriceListItem {
  id: string;
  productId: string;
  unitPrice: number;
  discountPct: number;
  minQuantity: number;
  product: {
    id: string;
    name: string;
    sku: string;
    gstRate: number;
  } | null;
}

interface PriceListDetail {
  id: string;
  name: string;
  description: string | null;
  currency: string;
  isActive: boolean;
  isDefault: boolean;
  items: PriceListItem[];
}

interface ProductOption {
  id: string;
  name: string;
  sku: string;
  listPrice: number;
}

export function PriceListDetailClient({ priceListId }: { priceListId: string }) {
  const [pl, setPl] = useState<PriceListDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/price-lists/${priceListId}`);
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.error ?? "Failed to load");
      setPl(body.data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load price list");
    } finally {
      setLoading(false);
    }
  }, [priceListId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function removeItem(itemId: string) {
    if (!confirm("Remove this product from the price list?")) return;
    const res = await fetch(`/api/price-lists/${priceListId}/items/${itemId}`, {
      method: "DELETE",
    });
    if (res.ok) void load();
  }

  if (loading && !pl) return <p className="text-sm text-crm-muted">Loading…</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!pl) return null;

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-crm-border bg-white p-4">
        <h2 className="text-lg font-semibold text-crm-text">{pl.name}</h2>
        {pl.description && <p className="text-sm text-crm-muted">{pl.description}</p>}
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-700">
            {pl.currency}
          </span>
          {pl.isDefault && (
            <span className="rounded-full bg-accent-100 px-2 py-0.5 font-medium text-accent-700">
              Default
            </span>
          )}
          {pl.isActive ? (
            <span className="rounded-full bg-green-50 px-2 py-0.5 text-green-700">
              Active
            </span>
          ) : (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-gray-600">
              Inactive
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-crm-text">Products on this list</h3>
        <Button size="sm" onClick={() => setAdding(true)}>
          <Plus size={14} /> Add product
        </Button>
      </div>

      <div className="rounded-lg border border-crm-border bg-white">
        <TableScroll minWidth={600}>
          <Table>
            <THead>
              <TR>
                <TH>Product</TH>
                <TH hideBelow="sm">SKU</TH>
                <TH className="text-right">Unit price (₹)</TH>
                <TH className="text-right" hideBelow="sm">
                  Discount %
                </TH>
                <TH className="text-right" hideBelow="md">
                  Min qty
                </TH>
                <TH aria-label="Actions" />
              </TR>
            </THead>
            <TBody>
              {pl.items.length === 0 ? (
                <TR>
                  <TD colSpan={6} className="py-8 text-center text-sm text-crm-muted">
                    No products yet — add one to override its catalog price.
                  </TD>
                </TR>
              ) : (
                pl.items.map((it) => (
                  <TR key={it.id} className="hover:bg-blue-50/30">
                    <TD className="font-medium text-crm-text">
                      {it.product?.name ?? "—"}
                    </TD>
                    <TD hideBelow="sm" className="text-crm-muted">
                      {it.product?.sku ?? "—"}
                    </TD>
                    <TD className="text-right tabular-nums">
                      {it.unitPrice.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </TD>
                    <TD className="text-right tabular-nums" hideBelow="sm">
                      {it.discountPct}%
                    </TD>
                    <TD className="text-right tabular-nums" hideBelow="md">
                      {it.minQuantity}
                    </TD>
                    <TD className="text-right">
                      <button
                        type="button"
                        onClick={() => removeItem(it.id)}
                        className="crm-btn-ghost h-8 w-8 p-0 text-red-600 hover:bg-red-50"
                        aria-label="Remove from price list"
                      >
                        <Trash2 size={14} />
                      </button>
                    </TD>
                  </TR>
                ))
              )}
            </TBody>
          </Table>
        </TableScroll>
      </div>

      {adding && (
        <AddItemModal
          open={adding}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            void load();
          }}
          priceListId={priceListId}
        />
      )}
    </div>
  );
}

function AddItemModal({
  open,
  onClose,
  onSaved,
  priceListId,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  priceListId: string;
}) {
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [productId, setProductId] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [discountPct, setDiscountPct] = useState("0");
  const [minQuantity, setMinQuantity] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    void fetch("/api/products?page=1&pageSize=100&isActive=true")
      .then((r) => r.json())
      .then((body) => {
        if (body.success) setProducts(body.data.items);
      });
  }, [open]);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/price-lists/${priceListId}/items`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          productId,
          unitPrice: Number(unitPrice),
          discountPct: Number(discountPct),
          minQuantity: Number(minQuantity),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? "Failed to add");
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to add product");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add product to price list">
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-crm-text">
            Product <span className="text-red-500">*</span>
          </span>
          <select
            className="crm-input pr-8"
            value={productId}
            onChange={(e) => {
              const id = e.target.value;
              setProductId(id);
              const p = products.find((x) => x.id === id);
              if (p && !unitPrice) setUnitPrice(String(p.listPrice));
            }}
          >
            <option value="">— Select a product —</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.sku})
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-3 gap-3">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-crm-text">
              Unit price (₹)
            </span>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-crm-text">Discount %</span>
            <Input
              type="number"
              min={0}
              max={100}
              value={discountPct}
              onChange={(e) => setDiscountPct(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-crm-text">Min qty</span>
            <Input
              type="number"
              min={1}
              value={minQuantity}
              onChange={(e) => setMinQuantity(e.target.value)}
            />
          </label>
        </div>
      </div>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-5 flex flex-row-reverse gap-2 border-t border-crm-border pt-4">
        <Button onClick={handleSubmit} disabled={submitting || !productId || !unitPrice}>
          {submitting ? "Adding…" : "Add"}
        </Button>
        <Button variant="secondary" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
      </div>
    </Modal>
  );
}
