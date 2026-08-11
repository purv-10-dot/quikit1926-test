"use client";

/**
 * @deprecated Use OrderDashboardShell via /orders/[id] server page.
 * Order detail — read-only line view + a thin status-change action bar.
 *
 * Why read-only on lines: orders are snapshotted at conversion time.
 * Editing lines after that would silently change a financial commitment
 * — instead, the rep would cancel the order and re-quote.
 *
 * Status changes (Open → Confirmed → Fulfilled → Closed, or → Cancelled)
 * are the only edit surface on the order itself.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, FileText, X } from "lucide-react";
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
import { EntityDocumentsCard } from "@/components/documents/entity-documents-card";

type OrderStatus = "Open" | "Confirmed" | "Fulfilled" | "Closed" | "Cancelled";

interface OrderLine {
  id: string;
  lineNumber: number;
  productName: string;
  sku: string | null;
  hsnCode: string | null;
  quantity: number;
  unit: string;
  unitPrice: number;
  discountPct: number;
  taxableAmount: number;
  gstRate: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  lineTotal: number;
}

interface Order {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  currency: string;
  orderDate: string;
  expectedDeliveryDate: string | null;
  confirmedAt: string | null;
  fulfilledAt: string | null;
  closedAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  termsText: string | null;
  internalNotes: string | null;
  ownerName: string | null;
  subtotal: number;
  totalDiscount: number;
  taxableAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  freightAmount: number;
  grandTotal: number;
  grandTotalInWords: string | null;
  quote: { id: string; quoteNumber: string; versionNumber: number };
  lines: OrderLine[];
}

const STATUS_STYLE: Record<OrderStatus, string> = {
  Open: "bg-blue-100 text-blue-700",
  Confirmed: "bg-purple-100 text-purple-700",
  Fulfilled: "bg-green-100 text-green-700",
  Closed: "bg-gray-100 text-gray-700",
  Cancelled: "bg-red-100 text-red-700",
};

export function OrderDetailClient({ orderId }: { orderId: string }) {
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/orders/${orderId}`);
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.error ?? "Failed to load");
      setOrder(body.data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load order");
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function setStatus(status: OrderStatus, extra?: Record<string, unknown>) {
    if (!order) return;
    try {
      const res = await fetch(`/api/orders/${order.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status, ...(extra ?? {}) }),
      });
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.error ?? "Failed to update");
      void load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to update status");
    }
  }

  if (loading && !order) return <p className="text-sm text-crm-muted">Loading…</p>;
  if (!order) return <p className="text-sm text-red-600">{error ?? "Order not found"}</p>;

  const fmt = (n: number) =>
    n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtDate = (d: string | null) =>
    d
      ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
      : "—";

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-crm-border bg-white px-4 py-3">
        <Link href="/orders" className="crm-btn-ghost h-8 w-8 p-0" aria-label="Back to orders">
          <ArrowLeft size={16} />
        </Link>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold text-crm-text">{order.orderNumber}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[order.status]}`}
            >
              {order.status}
            </span>
          </div>
          <p className="text-xs text-crm-muted">
            From quote{" "}
            <Link href={`/quotes/${order.quote.id}`} className="hover:underline">
              {order.quote.quoteNumber}
            </Link>
            {order.quote.versionNumber > 1 && ` (v${order.quote.versionNumber})`}
            {order.ownerName && ` · Owner: ${order.ownerName}`}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {order.status === "Open" && (
            <Button onClick={() => void setStatus("Confirmed")}>Mark Confirmed</Button>
          )}
          {order.status === "Confirmed" && (
            <Button onClick={() => void setStatus("Fulfilled")}>Mark Fulfilled</Button>
          )}
          {order.status === "Fulfilled" && (
            <Button onClick={() => void setStatus("Closed")}>Mark Closed</Button>
          )}
          {(order.status === "Open" || order.status === "Confirmed") && (
            <Button variant="danger" onClick={() => setCancelling(true)}>
              Cancel
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <EntityDocumentsCard refType="order" entityId={order.id} className="mt-2" />

      {/* Timeline + totals */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-lg border border-crm-border bg-white p-4 lg:col-span-2">
          <h3 className="mb-3 text-sm font-semibold text-crm-text">Timeline</h3>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <Row label="Order date" value={fmtDate(order.orderDate)} />
            <Row label="Expected delivery" value={fmtDate(order.expectedDeliveryDate)} />
            <Row label="Confirmed" value={fmtDate(order.confirmedAt)} />
            <Row label="Fulfilled" value={fmtDate(order.fulfilledAt)} />
            <Row label="Closed" value={fmtDate(order.closedAt)} />
            <Row label="Cancelled" value={fmtDate(order.cancelledAt)} />
            {order.cancellationReason && (
              <div className="col-span-2">
                <dt className="text-xs uppercase tracking-wider text-crm-muted">
                  Cancellation reason
                </dt>
                <dd className="text-crm-text">{order.cancellationReason}</dd>
              </div>
            )}
          </dl>
          {order.termsText && (
            <>
              <h3 className="mb-1 mt-4 text-sm font-semibold text-crm-text">Terms</h3>
              <p className="whitespace-pre-wrap text-sm text-crm-muted">{order.termsText}</p>
            </>
          )}
        </div>

        <div className="rounded-lg border border-crm-border bg-white p-4">
          <h3 className="mb-3 text-sm font-semibold text-crm-text">Totals (snapshotted)</h3>
          <TotalRow label="Subtotal" value={`₹${fmt(order.subtotal)}`} />
          <TotalRow label="Total discount" value={`₹${fmt(order.totalDiscount)}`} />
          <TotalRow label="Taxable amount" value={`₹${fmt(order.taxableAmount)}`} />
          {order.cgstAmount > 0 ? (
            <>
              <TotalRow label="CGST" value={`₹${fmt(order.cgstAmount)}`} />
              <TotalRow label="SGST" value={`₹${fmt(order.sgstAmount)}`} />
            </>
          ) : (
            <TotalRow label="IGST" value={`₹${fmt(order.igstAmount)}`} />
          )}
          {order.freightAmount > 0 && (
            <TotalRow label="Freight" value={`₹${fmt(order.freightAmount)}`} />
          )}
          <div className="my-2 border-t border-crm-border" />
          <TotalRow label="Grand total" value={`₹${fmt(order.grandTotal)}`} strong />
          {order.grandTotalInWords && (
            <p className="mt-2 text-xs text-crm-muted">
              <span className="font-medium">In words:</span> {order.grandTotalInWords}
            </p>
          )}
        </div>
      </div>

      {/* Lines */}
      <div className="rounded-lg border border-crm-border bg-white">
        <div className="border-b border-crm-border px-4 py-3">
          <h3 className="text-sm font-semibold text-crm-text">
            Line items ({order.lines.length})
          </h3>
          <p className="text-xs text-crm-muted">
            Read-only — snapshotted from quote {order.quote.quoteNumber} at conversion.
          </p>
        </div>
        <TableScroll minWidth={760}>
          <Table>
            <THead>
              <TR>
                <TH className="w-10 text-right">#</TH>
                <TH>Product</TH>
                <TH className="text-right">Qty</TH>
                <TH className="text-right">Unit price</TH>
                <TH className="text-right" hideBelow="sm">Disc%</TH>
                <TH className="text-right" hideBelow="md">GST%</TH>
                <TH className="text-right">Line total</TH>
              </TR>
            </THead>
            <TBody>
              {order.lines.map((l) => (
                <TR key={l.id}>
                  <TD className="text-right text-crm-muted">{l.lineNumber}</TD>
                  <TD>
                    <div className="font-medium text-crm-text">{l.productName}</div>
                    {l.sku && <div className="text-xs text-crm-muted">SKU: {l.sku}</div>}
                  </TD>
                  <TD className="text-right tabular-nums">
                    {l.quantity} {l.unit}
                  </TD>
                  <TD className="text-right tabular-nums">₹{fmt(l.unitPrice)}</TD>
                  <TD className="text-right tabular-nums" hideBelow="sm">
                    {l.discountPct}%
                  </TD>
                  <TD className="text-right tabular-nums" hideBelow="md">
                    {l.gstRate}%
                  </TD>
                  <TD className="text-right tabular-nums font-medium">
                    ₹{fmt(l.lineTotal)}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableScroll>
      </div>

      {cancelling && (
        <CancelModal
          open={cancelling}
          onClose={() => setCancelling(false)}
          onConfirm={async (reason) => {
            await setStatus("Cancelled", { cancellationReason: reason });
            setCancelling(false);
          }}
        />
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-crm-muted">{label}</dt>
      <dd className="text-crm-text">{value}</dd>
    </div>
  );
}

function TotalRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span
        className={"text-sm " + (strong ? "font-semibold text-crm-text" : "text-crm-muted")}
      >
        {label}
      </span>
      <span
        className={
          "tabular-nums " +
          (strong ? "text-base font-semibold text-crm-text" : "text-sm text-crm-text")
        }
      >
        {value}
      </span>
    </div>
  );
}

function CancelModal({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  return (
    <Modal open={open} onClose={onClose} title="Cancel order">
      <p className="text-sm text-crm-muted">
        Cancelling an order is reversible only via a new conversion from the source quote.
        Please record the reason — it&apos;s required for the audit log.
      </p>
      <label className="mt-3 block">
        <span className="mb-1 block text-sm font-medium text-crm-text">
          Cancellation reason <span className="text-red-500">*</span>
        </span>
        <Input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
      </label>
      <div className="mt-5 flex flex-row-reverse gap-2 border-t border-crm-border pt-4">
        <Button
          variant="danger"
          onClick={async () => {
            if (!reason.trim()) return;
            setSubmitting(true);
            await onConfirm(reason.trim());
            setSubmitting(false);
          }}
          disabled={submitting || !reason.trim()}
        >
          <X size={14} /> Confirm cancel
        </Button>
        <Button variant="secondary" onClick={onClose} disabled={submitting}>
          Back
        </Button>
      </div>
    </Modal>
  );
}
