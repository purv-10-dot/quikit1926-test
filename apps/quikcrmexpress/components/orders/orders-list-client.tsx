"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
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
import { StatsBar } from "@/components/shared/stats-bar";

export interface OrdersStats {
  total: number;
  byStatus: Record<"Open" | "Confirmed" | "Fulfilled" | "Closed" | "Cancelled", number>;
  openGrandTotal: number;
  fulfilledGrandTotal: number;
}

interface OrderRow {
  id: string;
  orderNumber: string;
  quoteId: string;
  accountId: string;
  accountName: string | null;
  status: "Open" | "Confirmed" | "Fulfilled" | "Closed" | "Cancelled";
  currency: string;
  grandTotal: number;
  orderDate: string;
  expectedDeliveryDate: string | null;
  ownerName: string | null;
}

const STATUS_STYLE: Record<OrderRow["status"], string> = {
  Open: "bg-blue-100 text-blue-700",
  Confirmed: "bg-purple-100 text-purple-700",
  Fulfilled: "bg-green-100 text-green-700",
  Closed: "bg-gray-100 text-gray-700",
  Cancelled: "bg-red-100 text-red-700",
};

const STATUS_DOT: Record<OrderRow["status"], string> = {
  Open: "bg-blue-500",
  Confirmed: "bg-purple-500",
  Fulfilled: "bg-green-500",
  Closed: "bg-gray-400",
  Cancelled: "bg-red-500",
};

function formatINRCompact(n: number): string {
  if (n >= 1_00_00_000) return `₹${(n / 1_00_00_000).toFixed(2).replace(/\.?0+$/u, "")}Cr`;
  if (n >= 1_00_000) return `₹${(n / 1_00_000).toFixed(1).replace(/\.?0+$/u, "")}L`;
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(1).replace(/\.?0+$/u, "")}K`;
  return `₹${n.toLocaleString("en-IN")}`;
}

export function OrdersListClient({ initialStats }: { initialStats?: OrdersStats }) {
  const [items, setItems] = useState<OrderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [status, setStatus] = useState<"" | OrderRow["status"]>("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      if (status) params.set("status", status);
      if (search.trim()) params.set("q", search.trim());
      const res = await fetch(`/api/orders?${params.toString()}`);
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.error ?? "Failed to load");
      setItems(body.data.items);
      setTotal(body.data.total);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load orders");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, status, search]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-3">
      {initialStats && (
        <StatsBar
          items={[
            { label: "total", value: initialStats.total.toLocaleString("en-IN") },
            {
              label: "open",
              value: initialStats.byStatus.Open.toLocaleString("en-IN"),
              hint:
                initialStats.openGrandTotal > 0
                  ? `· ${formatINRCompact(initialStats.openGrandTotal)}`
                  : undefined,
              accent: initialStats.byStatus.Open > 0,
            },
            { label: "confirmed", value: initialStats.byStatus.Confirmed.toLocaleString("en-IN") },
            {
              label: "fulfilled",
              value: initialStats.byStatus.Fulfilled.toLocaleString("en-IN"),
              hint:
                initialStats.fulfilledGrandTotal > 0
                  ? `· ${formatINRCompact(initialStats.fulfilledGrandTotal)}`
                  : undefined,
            },
            { label: "cancelled", value: initialStats.byStatus.Cancelled.toLocaleString("en-IN") },
          ]}
        />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          placeholder="Search by order number…"
          className="max-w-xs"
          aria-label="Search orders"
        />
        <Select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as typeof status);
            setPage(1);
          }}
          aria-label="Filter by status"
          className="max-w-[12rem]"
        >
          <option value="">All statuses</option>
          {(["Open", "Confirmed", "Fulfilled", "Closed", "Cancelled"] as const).map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
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
                <TH>Order #</TH>
                <TH hideBelow="sm">Account</TH>
                <TH hideBelow="md">Order date</TH>
                <TH>Status</TH>
                <TH hideBelow="lg">Expected delivery</TH>
                <TH hideBelow="lg">Owner</TH>
                <TH className="text-right">Grand total (₹)</TH>
                <TH aria-label="Actions" />
              </TR>
            </THead>
            <TBody>
              {loading && items.length === 0 ? (
                <TR>
                  <TD colSpan={8} className="py-6 text-center text-sm text-crm-muted">
                    Loading…
                  </TD>
                </TR>
              ) : items.length === 0 ? (
                <TR>
                  <TD colSpan={8} className="py-12 text-center text-sm text-crm-muted">
                    <div className="mx-auto max-w-sm space-y-1">
                      <p className="font-medium text-crm-text">No orders yet</p>
                      <p>
                        Orders land here when a Won quote is converted. Mark a quote as Won →
                        click <span className="font-medium">Convert to order</span>.
                      </p>
                    </div>
                  </TD>
                </TR>
              ) : (
                items.map((o) => (
                  <TR key={o.id} className="hover:bg-blue-50/30">
                    <TD className="font-medium text-crm-text">
                      <Link href={`/orders/${o.id}`} className="hover:underline">
                        {o.orderNumber}
                      </Link>
                    </TD>
                    <TD hideBelow="sm">
                      {o.accountName ?? <span className="text-crm-muted">—</span>}
                    </TD>
                    <TD hideBelow="md" className="text-crm-muted">
                      {new Date(o.orderDate).toLocaleDateString("en-IN", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </TD>
                    <TD>
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[o.status]}`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[o.status]}`} />
                        {o.status}
                      </span>
                    </TD>
                    <TD hideBelow="lg" className="text-crm-muted">
                      {o.expectedDeliveryDate
                        ? new Date(o.expectedDeliveryDate).toLocaleDateString("en-IN", {
                            day: "2-digit",
                            month: "short",
                          })
                        : "—"}
                    </TD>
                    <TD hideBelow="lg">{o.ownerName ?? "—"}</TD>
                    <TD className="text-right tabular-nums">
                      {o.grandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </TD>
                    <TD className="text-right">
                      <Link
                        href={`/orders/${o.id}`}
                        className="crm-btn-ghost inline-flex h-8 w-8 items-center justify-center p-0"
                        aria-label={`Open ${o.orderNumber}`}
                      >
                        <ExternalLink size={14} />
                      </Link>
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
          pageSizeOptions={[10, 25, 50, 100]}
          onPageSizeChange={(s) => {
            setPageSize(s);
            setPage(1);
          }}
        />
      </div>
    </div>
  );
}
