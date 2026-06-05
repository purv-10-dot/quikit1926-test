"use client";

import { AlertTriangle, ArrowRight } from "lucide-react";
import { formatDateTime } from "@/lib/utils/date-helpers";
import type { OrderDashboardSnapshot } from "@/lib/services/orders/dashboard-snapshot";
import type { Order360Row } from "@/lib/services/orders/full-record";
import type { TabKey } from "@/components/orders/order-detail-tabs";

export interface OrderOverviewActivity {
  id: string;
  type: string;
  subject: string | null;
  outcome: string | null;
  ownerName: string | null;
  occurredAt: string | null;
}

function fmtINR(n: number): string {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function SectionHeader({
  title,
  tab,
  onNavigateTab,
}: {
  title: string;
  tab: TabKey;
  onNavigateTab: (tab: TabKey) => void;
}) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <h3 className="text-sm font-semibold text-crm-text">{title}</h3>
      <button
        type="button"
        onClick={() => onNavigateTab(tab)}
        className="inline-flex items-center gap-0.5 text-xs font-medium text-crm-blue hover:underline"
      >
        View all <ArrowRight size={12} />
      </button>
    </div>
  );
}

export function OrderDashboardOverview({
  order,
  snapshot,
  activities,
  onNavigateTab,
}: {
  order: Order360Row;
  snapshot: OrderDashboardSnapshot;
  activities: OrderOverviewActivity[];
  onNavigateTab: (tab: TabKey) => void;
}) {
  const isIntraState = order.cgstAmount > 0 || order.sgstAmount > 0;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {snapshot.isOverdueDelivery ? (
        <div className="lg:col-span-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <p>Expected delivery date has passed — update status or adjust the delivery date.</p>
        </div>
      ) : null}

      <section>
        <SectionHeader title="Recent activity" tab="timeline" onNavigateTab={onNavigateTab} />
        {activities.length === 0 ? (
          <p className="text-sm text-crm-muted">No activities yet.</p>
        ) : (
          <ul className="space-y-2">
            {activities.slice(0, 5).map((a) => (
              <li key={a.id} className="rounded border border-crm-border px-3 py-2 text-sm">
                <p className="font-medium text-crm-text">{a.subject ?? a.type}</p>
                <p className="text-xs text-crm-muted">
                  {a.type}
                  {a.occurredAt ? ` · ${formatDateTime(a.occurredAt)}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-crm-text">Timeline</h3>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <Row label="Order date" value={fmtDate(order.orderDate)} />
          <Row label="Expected delivery" value={fmtDate(order.expectedDeliveryDate)} />
          <Row label="Confirmed" value={fmtDate(order.confirmedAt)} />
          <Row label="Fulfilled" value={fmtDate(order.fulfilledAt)} />
          <Row label="Closed" value={fmtDate(order.closedAt)} />
          <Row label="Cancelled" value={fmtDate(order.cancelledAt)} />
        </dl>
        {order.cancellationReason ? (
          <p className="mt-3 text-sm text-crm-muted">
            <span className="font-medium text-crm-text">Cancellation: </span>
            {order.cancellationReason}
          </p>
        ) : null}
      </section>

      <section className="lg:col-span-2">
        <h3 className="mb-2 text-sm font-semibold text-crm-text">Totals (snapshotted)</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded border border-crm-border bg-crm-panel/40 p-3 text-sm">
            <TotalRow label="Subtotal" value={`₹${fmtINR(order.subtotal)}`} />
            <TotalRow label="Discount" value={`₹${fmtINR(order.totalDiscount)}`} />
            <TotalRow label="Taxable" value={`₹${fmtINR(order.taxableAmount)}`} />
            {isIntraState ? (
              <>
                <TotalRow label="CGST" value={`₹${fmtINR(order.cgstAmount)}`} />
                <TotalRow label="SGST" value={`₹${fmtINR(order.sgstAmount)}`} />
              </>
            ) : (
              <TotalRow label="IGST" value={`₹${fmtINR(order.igstAmount)}`} />
            )}
            {order.freightAmount > 0 ? (
              <TotalRow label="Freight" value={`₹${fmtINR(order.freightAmount)}`} />
            ) : null}
            <div className="my-2 border-t border-crm-border" />
            <TotalRow label="Grand total" value={`₹${fmtINR(order.grandTotal)}`} strong />
          </div>
          {(order.termsText || order.internalNotes) && (
            <div className="rounded border border-crm-border p-3 text-sm">
              {order.termsText ? (
                <>
                  <p className="mb-1 text-xs font-semibold uppercase text-crm-muted">Terms</p>
                  <p className="whitespace-pre-wrap text-crm-text">{order.termsText}</p>
                </>
              ) : null}
              {order.internalNotes ? (
                <>
                  <p className="mb-1 mt-3 text-xs font-semibold uppercase text-crm-muted">
                    Internal notes
                  </p>
                  <p className="whitespace-pre-wrap text-crm-text">{order.internalNotes}</p>
                </>
              ) : null}
            </div>
          )}
        </div>
      </section>
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
    <div className="flex justify-between py-0.5">
      <span className={strong ? "font-semibold text-crm-text" : "text-crm-muted"}>{label}</span>
      <span className={strong ? "font-semibold tabular-nums text-crm-text" : "tabular-nums"}>
        {value}
      </span>
    </div>
  );
}
