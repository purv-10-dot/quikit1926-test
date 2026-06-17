"use client";

import { useCallback, useMemo, useState } from "react";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
} from "@tanstack/react-table";
import { Copy, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import type { PriceListItemRow } from "@/components/price-lists/types";

interface Props {
  priceListId: string;
  items: PriceListItemRow[];
  canEdit: boolean;
  onChanged: () => void;
  onSelectionChange?: (ids: string[]) => void;
}

type EditableField = "unitPrice" | "discountPct" | "minQuantity" | "floorPrice" | "notes";

export function PriceListItemsTable({
  priceListId,
  items,
  canEdit,
  onChanged,
  onSelectionChange,
}: Props) {
  const toast = useToast();
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const patchItem = useCallback(
    async (itemId: string, patch: Partial<PriceListItemRow>) => {
      setSavingId(itemId);
      try {
        const res = await fetch(`/api/price-lists/${priceListId}/items/${itemId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          credentials: "include",
          body: JSON.stringify(patch),
        });
        const j = await res.json();
        if (!res.ok || !j.success) throw new Error(j.error ?? "Update failed");
        onChanged();
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Update failed");
      } finally {
        setSavingId(null);
      }
    },
    [onChanged, priceListId, toast],
  );

  const columns = useMemo<ColumnDef<PriceListItemRow>[]>(
    () => [
      {
        id: "select",
        header: () => null,
        cell: ({ row }) => (
          <input
            type="checkbox"
            checked={!!selected[row.original.id]}
            disabled={!canEdit}
            onChange={(e) => {
              const next = { ...selected, [row.original.id]: e.target.checked };
              setSelected(next);
              onSelectionChange?.(Object.keys(next).filter((k) => next[k]));
            }}
            className="rounded border-gray-300"
          />
        ),
        size: 40,
      },
      {
        accessorKey: "product.name",
        header: "Product",
        cell: ({ row }) => (
          <div>
            <div className="font-medium text-crm-text">{row.original.product?.name ?? "—"}</div>
            <div className="text-xs text-crm-muted">{row.original.product?.sku}</div>
          </div>
        ),
      },
      {
        id: "catalog",
        header: "Catalog",
        cell: ({ row }) => (
          <span className="tabular-nums text-crm-muted">
            {row.original.product?.listPrice != null
              ? row.original.product.listPrice.toLocaleString("en-IN", { minimumFractionDigits: 2 })
              : "—"}
          </span>
        ),
      },
      {
        accessorKey: "unitPrice",
        header: "Unit price",
        cell: ({ row }) =>
          canEdit ? (
            <InlineNumber
              value={row.original.unitPrice}
              disabled={savingId === row.original.id}
              onCommit={(v) => void patchItem(row.original.id, { unitPrice: v })}
            />
          ) : (
            <span className="tabular-nums">{row.original.unitPrice}</span>
          ),
      },
      {
        accessorKey: "discountPct",
        header: "Disc %",
        cell: ({ row }) =>
          canEdit ? (
            <InlineNumber
              value={row.original.discountPct}
              disabled={savingId === row.original.id}
              onCommit={(v) => void patchItem(row.original.id, { discountPct: v })}
            />
          ) : (
            <span>{row.original.discountPct}%</span>
          ),
      },
      {
        accessorKey: "minQuantity",
        header: "Min qty",
        cell: ({ row }) =>
          canEdit ? (
            <InlineNumber
              value={row.original.minQuantity}
              disabled={savingId === row.original.id}
              integer
              onCommit={(v) => void patchItem(row.original.id, { minQuantity: Math.max(1, Math.floor(v)) })}
            />
          ) : (
            <span>{row.original.minQuantity}</span>
          ),
      },
      {
        accessorKey: "floorPrice",
        header: "Floor",
        cell: ({ row }) =>
          canEdit ? (
            <InlineNumber
              value={row.original.floorPrice ?? 0}
              disabled={savingId === row.original.id}
              allowEmpty
              onCommit={(v) => void patchItem(row.original.id, { floorPrice: v > 0 ? v : null })}
            />
          ) : (
            <span className="tabular-nums">{row.original.floorPrice ?? "—"}</span>
          ),
      },
      {
        id: "variance",
        header: "vs catalog",
        cell: ({ row }) => {
          const cat = row.original.product?.listPrice;
          if (cat == null || cat === 0) return <span className="text-crm-muted">—</span>;
          const pct = ((row.original.unitPrice - cat) / cat) * 100;
          const cls = pct < 0 ? "text-green-700" : pct > 0 ? "text-amber-700" : "text-crm-muted";
          return <span className={`tabular-nums text-xs font-medium ${cls}`}>{pct.toFixed(1)}%</span>;
        },
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) =>
          canEdit ? (
            <div className="flex justify-end gap-1">
              <button
                type="button"
                title="Duplicate bracket"
                className="crm-btn-ghost h-8 w-8 p-0"
                onClick={async () => {
                  const res = await fetch(
                    `/api/price-lists/${priceListId}/items/${row.original.id}/duplicate`,
                    { method: "POST", credentials: "include" },
                  );
                  const j = await res.json();
                  if (!res.ok || !j.success) {
                    toast.error(j.error ?? "Duplicate failed");
                    return;
                  }
                  toast.success("Bracket duplicated");
                  onChanged();
                }}
              >
                <Copy size={14} />
              </button>
              <button
                type="button"
                title="Remove"
                className="crm-btn-ghost h-8 w-8 p-0 text-red-600"
                onClick={async () => {
                  if (!confirm("Remove this pricing row?")) return;
                  const res = await fetch(`/api/price-lists/${priceListId}/items/${row.original.id}`, {
                    method: "DELETE",
                    credentials: "include",
                  });
                  const j = await res.json();
                  if (!res.ok || !j.success) {
                    toast.error(j.error ?? "Delete failed");
                    return;
                  }
                  toast.success("Row removed");
                  onChanged();
                }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          ) : null,
      },
    ],
    [canEdit, onChanged, onSelectionChange, patchItem, priceListId, savingId, selected, toast],
  );

  const table = useReactTable({
    data: items,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  if (items.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-crm-border bg-crm-panel/30 py-16 text-center">
        <p className="font-medium text-crm-text">No products on this list</p>
        <p className="mt-1 text-sm text-crm-muted">Add products or import a CSV to build your price book.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-crm-border bg-white">
      <table className="min-w-[900px] w-full text-sm">
        <thead className="bg-accent-50 text-left text-xs font-semibold uppercase tracking-wide text-crm-muted">
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id}>
              {hg.headers.map((h) => (
                <th key={h.id} className="px-3 py-2.5">
                  {h.isPlaceholder ? null : flexRender(h.column.columnDef.header, h.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody className="divide-y divide-crm-border">
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} className="hover:bg-blue-50/20">
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="px-3 py-2 align-middle">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InlineNumber({
  value,
  onCommit,
  disabled,
  integer,
  allowEmpty,
}: {
  value: number;
  onCommit: (v: number) => void;
  disabled?: boolean;
  integer?: boolean;
  allowEmpty?: boolean;
}) {
  const [local, setLocal] = useState(String(value));
  return (
    <Input
      type="number"
      className="h-8 w-24 tabular-nums"
      value={local}
      disabled={disabled}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => {
        if (allowEmpty && local.trim() === "") {
          onCommit(0);
          return;
        }
        const n = integer ? parseInt(local, 10) : parseFloat(local);
        if (Number.isFinite(n)) {
          onCommit(n);
          setLocal(String(n));
        } else {
          setLocal(String(value));
        }
      }}
    />
  );
}

export function PriceListBulkToolbar({
  priceListId,
  selectedIds,
  onDone,
}: {
  priceListId: string;
  selectedIds: string[];
  onDone: () => void;
}) {
  const toast = useToast();
  const [pct, setPct] = useState("5");
  const [busy, setBusy] = useState(false);
  if (selectedIds.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-accent-200 bg-accent-50/80 px-3 py-2 text-sm">
      <span className="font-medium text-accent-800">{selectedIds.length} selected</span>
      <Input
        type="number"
        className="h-8 w-20"
        value={pct}
        onChange={(e) => setPct(e.target.value)}
        aria-label="Percent change"
      />
      <span className="text-crm-muted">%</span>
      <Button
        size="sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            const res = await fetch(`/api/price-lists/${priceListId}/items/bulk-update`, {
              method: "POST",
              headers: { "content-type": "application/json" },
              credentials: "include",
              body: JSON.stringify({
                itemIds: selectedIds,
                mode: "percent",
                value: Number(pct),
              }),
            });
            const j = await res.json();
            if (!res.ok || !j.success) throw new Error(j.error ?? "Bulk update failed");
            toast.success(`Updated ${j.data.updated} row(s)`);
            onDone();
          } catch (e: unknown) {
            toast.error(e instanceof Error ? e.message : "Bulk update failed");
          } finally {
            setBusy(false);
          }
        }}
      >
        Apply % change
      </Button>
    </div>
  );
}
