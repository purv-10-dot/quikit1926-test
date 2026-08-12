"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Copy, Plus, Upload, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/utils/date-helpers";
import {
  PriceListBulkToolbar,
  PriceListItemsTable,
} from "@/components/price-lists/price-list-items-table";
import { PriceListCsvModal } from "@/components/price-lists/price-list-csv-modal";
import type { AuditEntry, PriceListDetail, PriceListItemRow } from "@/components/price-lists/types";

const CURRENCY_OPTIONS = ["INR", "USD", "EUR", "GBP", "AED", "SGD"] as const;

export function PriceListDetailShell({
  priceListId,
  canEdit = true,
}: {
  priceListId: string;
  canEdit?: boolean;
}) {
  const toast = useToast();
  const [pl, setPl] = useState<PriceListDetail | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingHeader, setEditingHeader] = useState(false);
  const [adding, setAdding] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [detailRes, auditRes] = await Promise.all([
        fetch(`/api/price-lists/${priceListId}`, { credentials: "include" }),
        fetch(`/api/price-lists/${priceListId}/audit?page=1&pageSize=20`, { credentials: "include" }),
      ]);
      const detailBody = await detailRes.json();
      if (!detailRes.ok || !detailBody.success) throw new Error(detailBody.error ?? "Failed to load");
      setPl(detailBody.data as PriceListDetail);
      const auditBody = await auditRes.json();
      if (auditRes.ok && auditBody.success) {
        setAudit((auditBody.data.items ?? []) as AuditEntry[]);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [priceListId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function duplicateList() {
    const res = await fetch(`/api/price-lists/${priceListId}/duplicate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({}),
    });
    const j = await res.json();
    if (!res.ok || !j.success) {
      toast.error(j.error ?? "Duplicate failed");
      return;
    }
    toast.success("Price list duplicated");
    window.location.href = `/price-lists/${j.data.id}`;
  }

  if (loading && !pl) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-32 rounded-lg bg-gray-100" />
        <div className="h-64 rounded-lg bg-gray-100" />
      </div>
    );
  }
  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!pl) return null;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-crm-border bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-crm-text">{pl.name}</h2>
            {pl.description && <p className="mt-1 text-sm text-crm-muted">{pl.description}</p>}
            <div className="mt-3 flex flex-wrap gap-2 text-xs">
              <Badge>{pl.currency}</Badge>
              {pl.isDefault && <Badge accent>Default</Badge>}
              <Badge>{pl.isActive ? "Active" : "Inactive"}</Badge>
              {pl.regionCode && <Badge>Region: {pl.regionCode}</Badge>}
              {pl.customerTier && <Badge>Tier: {pl.customerTier}</Badge>}
              <Badge>v{pl.versionNumber}</Badge>
            </div>
            <p className="mt-2 text-xs text-crm-muted">
              Valid{" "}
              {pl.effectiveFrom ? formatDate(pl.effectiveFrom) : "always"} →{" "}
              {pl.effectiveTo ? formatDate(pl.effectiveTo) : "open"}
              {" · "}Updated {formatDate(pl.updatedAt)}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canEdit && (
              <>
                <Button variant="secondary" size="sm" onClick={() => setEditingHeader(true)}>
                  <Pencil size={14} /> Edit
                </Button>
                <Button variant="secondary" size="sm" onClick={() => void duplicateList()}>
                  <Copy size={14} /> Duplicate
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setCsvOpen(true)}>
                  <Upload size={14} /> CSV
                </Button>
                <Button size="sm" onClick={() => setAdding(true)}>
                  <Plus size={14} /> Add product
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      <PriceListBulkToolbar
        priceListId={priceListId}
        selectedIds={selectedIds}
        onDone={() => {
          setSelectedIds([]);
          void load();
        }}
      />

      <PriceListItemsTable
        priceListId={priceListId}
        items={pl.items as PriceListItemRow[]}
        canEdit={canEdit}
        onChanged={() => void load()}
        onSelectionChange={setSelectedIds}
      />

      {audit.length > 0 && (
        <div className="rounded-lg border border-crm-border bg-white p-4">
          <h3 className="text-sm font-semibold text-crm-text">Activity</h3>
          <ul className="mt-3 divide-y divide-crm-border text-sm">
            {audit.map((a) => (
              <li key={a.id} className="flex justify-between gap-4 py-2">
                <span>{a.summary}</span>
                <span className="shrink-0 text-xs text-crm-muted">
                  {a.userName ?? "System"} · {formatDate(a.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {editingHeader && (
        <EditHeaderModal
          open={editingHeader}
          pl={pl}
          onClose={() => setEditingHeader(false)}
          onSaved={() => {
            setEditingHeader(false);
            void load();
          }}
        />
      )}
      {adding && (
        <AddProductModal
          open={adding}
          priceListId={priceListId}
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            void load();
          }}
        />
      )}
      {csvOpen && (
        <PriceListCsvModal
          open={csvOpen}
          priceListId={priceListId}
          onClose={() => setCsvOpen(false)}
          onImported={() => {
            setCsvOpen(false);
            void load();
          }}
        />
      )}
    </div>
  );
}

function Badge({ children, accent }: { children: ReactNode; accent?: boolean }) {
  return (
    <span
      className={
        accent
          ? "rounded-full bg-accent-100 px-2 py-0.5 font-medium text-accent-700"
          : "rounded-full bg-gray-100 px-2 py-0.5 text-gray-700"
      }
    >
      {children}
    </span>
  );
}

function EditHeaderModal({
  open,
  pl,
  onClose,
  onSaved,
}: {
  open: boolean;
  pl: PriceListDetail;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState(pl.name);
  const [description, setDescription] = useState(pl.description ?? "");
  const [currency, setCurrency] = useState(pl.currency);
  const [isActive, setIsActive] = useState(pl.isActive);
  const [isDefault, setIsDefault] = useState(pl.isDefault);
  const [regionCode, setRegionCode] = useState(pl.regionCode ?? "");
  const [customerTier, setCustomerTier] = useState(pl.customerTier ?? "");
  const [effectiveFrom, setEffectiveFrom] = useState(pl.effectiveFrom?.slice(0, 10) ?? "");
  const [effectiveTo, setEffectiveTo] = useState(pl.effectiveTo?.slice(0, 10) ?? "");
  const [submitting, setSubmitting] = useState(false);

  async function save() {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/price-lists/${pl.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          currency,
          isActive,
          isDefault,
          regionCode: regionCode.trim() || null,
          customerTier: customerTier.trim() || null,
          effectiveFrom: effectiveFrom ? new Date(effectiveFrom).toISOString() : null,
          effectiveTo: effectiveTo ? new Date(effectiveTo).toISOString() : null,
        }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error ?? "Save failed");
      toast.success("Price list updated");
      onSaved();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Edit price list" width="max-w-xl">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="sm:col-span-2 block">
          <span className="mb-1 block text-sm font-medium">Name</span>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="sm:col-span-2 block">
          <span className="mb-1 block text-sm font-medium">Description</span>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Currency</span>
          <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {CURRENCY_OPTIONS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Region code</span>
          <Input value={regionCode} onChange={(e) => setRegionCode(e.target.value)} placeholder="IN-WEST" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Customer tier</span>
          <Input value={customerTier} onChange={(e) => setCustomerTier(e.target.value)} placeholder="Enterprise" />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Effective from</span>
          <Input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Effective to</span>
          <Input type="date" value={effectiveTo} onChange={(e) => setEffectiveTo(e.target.value)} />
        </label>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          Active
        </label>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
          Tenant default list
        </label>
      </div>
      <div className="mt-5 flex flex-row-reverse gap-2 border-t border-crm-border pt-4">
        <Button onClick={save} disabled={submitting || !name.trim()}>
          {submitting ? "Saving…" : "Save"}
        </Button>
        <Button variant="secondary" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
      </div>
    </Modal>
  );
}

function AddProductModal({
  open,
  priceListId,
  onClose,
  onSaved,
}: {
  open: boolean;
  priceListId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const [products, setProducts] = useState<Array<{ id: string; name: string; sku: string; listPrice: number }>>([]);
  const [productId, setProductId] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [discountPct, setDiscountPct] = useState("0");
  const [minQuantity, setMinQuantity] = useState("1");
  const [floorPrice, setFloorPrice] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      // Products list API allow-list: pageSize ∈ {10, 25, 50, 100}. Paginate to load all.
      const items: Array<{ id: string; name: string; sku: string; listPrice: number }> = [];
      let page = 1;
      let totalPages = 1;
      do {
        const res = await fetch(
          `/api/products?page=${page}&pageSize=100&isActive=true`,
          { credentials: "include" },
        );
        const body = await res.json();
        if (!body.success) break;
        items.push(...body.data.items);
        totalPages = body.data.totalPages ?? 1;
        page += 1;
      } while (page <= totalPages);
      setProducts(items);
    })();
  }, [open]);

  async function submit() {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/price-lists/${priceListId}/items`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          productId,
          unitPrice: Number(unitPrice),
          discountPct: Number(discountPct),
          minQuantity: Number(minQuantity),
          floorPrice: floorPrice ? Number(floorPrice) : null,
          notes: notes.trim() || null,
        }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error ?? "Failed to add");
      toast.success("Product added");
      onSaved();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to add");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add product to price list">
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-sm font-medium">Product</span>
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
            <option value="">— Select —</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.sku})
              </option>
            ))}
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium">Unit price</span>
            <Input type="number" min={0} step="0.01" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium">Discount %</span>
            <Input type="number" value={discountPct} onChange={(e) => setDiscountPct(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium">Min qty</span>
            <Input type="number" min={1} value={minQuantity} onChange={(e) => setMinQuantity(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium">Floor price</span>
            <Input type="number" min={0} value={floorPrice} onChange={(e) => setFloorPrice(e.target.value)} />
          </label>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-medium">Notes</span>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
      </div>
      <div className="mt-5 flex flex-row-reverse gap-2 border-t border-crm-border pt-4">
        <Button onClick={submit} disabled={submitting || !productId || !unitPrice}>
          Add
        </Button>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </Modal>
  );
}
