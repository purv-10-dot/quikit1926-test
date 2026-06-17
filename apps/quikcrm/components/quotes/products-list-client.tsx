"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Plus, Search, Pencil, Upload, Download } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/shared/pagination";
import {
  Table,
  TableScroll,
  THead,
  TBody,
  TR,
  TH,
  TD,
} from "@/components/ui/table";
import { ProductFormModal, type ProductRow } from "@/components/quotes/product-form-modal";
import { ProductCsvImportModal } from "@/components/quotes/product-csv-import-modal";
import { StatsBar } from "@/components/shared/stats-bar";

/**
 * Aggregate stats for the Products list — computed server-side in
 * `app/(dashboard)/products/page.tsx::computeProductStats` and passed in
 * as `initialStats`. Reflects ALL products in the tenant.
 */
export interface ProductsStats {
  total: number;
  active: number;
  inactive: number;
  categories: number;
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

export function ProductsListClient({ initialStats }: { initialStats?: ProductsStats }) {
  const [items, setItems] = useState<ProductRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [hsnFilter, setHsnFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<ProductRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (search.trim()) params.set("q", search.trim());
      if (hsnFilter.trim()) params.set("hsnCode", hsnFilter.trim());
      const res = await fetch(`/api/products?${params.toString()}`);
      const body = await res.json();
      if (!res.ok || !body.success) {
        throw new Error(body.error ?? "Failed to load products");
      }
      setItems(body.data.items);
      setTotal(body.data.total);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load products");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, search, hsnFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  function handleSaved() {
    setCreating(false);
    setEditing(null);
    void load();
  }

  return (
    <div className="space-y-3">
      {initialStats && (
        <StatsBar
          items={[
            { label: "total", value: initialStats.total.toLocaleString("en-IN") },
            {
              label: "active",
              value: initialStats.active.toLocaleString("en-IN"),
              accent: initialStats.active > 0,
            },
            { label: "inactive", value: initialStats.inactive.toLocaleString("en-IN") },
            {
              label: "categories",
              value: initialStats.categories.toLocaleString("en-IN"),
            },
          ]}
        />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative max-w-xs flex-1">
          <Search
            size={16}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-crm-muted"
          />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search SKU, barcode, HSN, description…"
            className="!pl-8"
            aria-label="Search products"
          />
        </div>
        <Input
          value={hsnFilter}
          onChange={(e) => {
            setHsnFilter(e.target.value);
            setPage(1);
          }}
          placeholder="HSN filter"
          className="max-w-[120px]"
          aria-label="Filter by HSN"
        />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <a href="/api/products/export" className="crm-btn-secondary inline-flex items-center gap-1.5">
            <Download size={14} /> Export
          </a>
          <Button variant="secondary" onClick={() => setImporting(true)}>
            <Upload size={14} /> Import CSV
          </Button>
          <Button onClick={() => setCreating(true)}>
            <Plus size={16} /> Add product
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-lg border border-crm-border bg-white">
        <TableScroll minWidth={760}>
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>SKU</TH>
                <TH hideBelow="md">Category</TH>
                <TH hideBelow="md">HSN</TH>
                <TH className="text-right">List price (₹)</TH>
                <TH className="text-right">GST %</TH>
                <TH hideBelow="lg">Type</TH>
                <TH hideBelow="sm">Status</TH>
                <TH aria-label="Actions" />
              </TR>
            </THead>
            <TBody>
              {loading && items.length === 0 ? (
                <TR>
                  <TD colSpan={9} className="py-6 text-center text-sm text-crm-muted">
                    Loading…
                  </TD>
                </TR>
              ) : items.length === 0 ? (
                <TR>
                  <TD colSpan={9} className="py-12 text-center text-sm text-crm-muted">
                    <div className="mx-auto max-w-sm space-y-1">
                      <p className="font-medium text-crm-text">No products yet</p>
                      <p>
                        Add products + GST rates here. They become the catalog the Quote
                        Builder picks from.
                      </p>
                    </div>
                  </TD>
                </TR>
              ) : (
                items.map((p) => (
                  <TR key={p.id} className="hover:bg-blue-50/30">
                    <TD className="font-medium text-crm-text">
                      <Link href={`/products/${p.id}`} className="hover:text-accent-700 hover:underline">
                        {p.name}
                      </Link>
                    </TD>
                    <TD className="text-crm-muted">{p.sku}</TD>
                    <TD hideBelow="md">{p.categoryName ?? p.category ?? "—"}</TD>
                    <TD hideBelow="md">{p.hsnCode ?? "—"}</TD>
                    <TD className="text-right tabular-nums">
                      {p.listPrice.toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                      })}
                    </TD>
                    <TD className="text-right tabular-nums">{p.gstRate}%</TD>
                    <TD hideBelow="lg">{p.productType}</TD>
                    <TD hideBelow="sm">
                      {p.isActive ? (
                        <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                          Active
                        </span>
                      ) : (
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                          Inactive
                        </span>
                      )}
                    </TD>
                    <TD className="text-right">
                      <button
                        type="button"
                        onClick={() => setEditing(p)}
                        className="crm-btn-ghost h-8 w-8 p-0"
                        aria-label={`Edit ${p.name}`}
                      >
                        <Pencil size={14} />
                      </button>
                    </TD>
                  </TR>
                ))
              )}
            </TBody>
          </Table>
        </TableScroll>
        <Pagination
          page={page}
          pageSize={pageSize}
          total={total}
          onPage={setPage}
          pageSizeOptions={PAGE_SIZE_OPTIONS}
          onPageSizeChange={(s) => {
            setPageSize(s);
            setPage(1);
          }}
        />
      </div>

      {creating && (
        <ProductFormModal
          open={creating}
          onClose={() => setCreating(false)}
          onSaved={handleSaved}
          product={null}
        />
      )}
      {importing && (
        <ProductCsvImportModal
          open={importing}
          onClose={() => setImporting(false)}
          onImported={() => {
            // Refresh the list as imports land. Don't close the modal —
            // user may want to see the result summary first.
            void load();
          }}
        />
      )}
      {editing && (
        <ProductFormModal
          open={!!editing}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
          product={editing}
        />
      )}
    </div>
  );
}
