"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { OrderDashboardHeader } from "@/components/orders/order-dashboard-header";
import { OrderDashboardMetrics } from "@/components/orders/order-dashboard-metrics";
import { OrderQuickActionsPanel } from "@/components/orders/order-quick-actions-panel";
import { OrderStatusStepper } from "@/components/orders/order-status-stepper";
import { OrderDetailTabs, type TabKey } from "@/components/orders/order-detail-tabs";
import { OrderCancelModal } from "@/components/orders/order-cancel-modal";
import type { OrderOverviewActivity } from "@/components/orders/order-dashboard-overview";
import type { OrderDashboardSnapshot } from "@/lib/services/orders/dashboard-snapshot";
import type { Order360Row, OrderStatus } from "@/lib/services/orders/full-record";
import type { UnifiedTimelineSeed } from "@/components/leads/dashboard/unified-timeline";
import { useToast } from "@/hooks/use-toast";

export interface Order360Permissions {
  canEdit: boolean;
}

export interface OrderDashboardShellProps {
  order: Order360Row;
  account: { id: string; name: string } | null;
  contact: { id: string; firstName: string; lastName: string | null; email: string | null } | null;
  opportunity: { id: string; name: string; stage: string } | null;
  snapshot: OrderDashboardSnapshot;
  timelineSeed: UnifiedTimelineSeed;
  overviewActivities: OrderOverviewActivity[];
  permissions: Order360Permissions;
}

export function OrderDashboardShell(props: OrderDashboardShellProps) {
  const {
    order: initialOrder,
    account,
    contact,
    opportunity,
    snapshot: initialSnapshot,
    timelineSeed,
    overviewActivities,
    permissions,
  } = props;

  const router = useRouter();
  const toast = useToast();
  const [order, setOrder] = useState(initialOrder);
  const [snapshot] = useState(initialSnapshot);
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [cancelling, setCancelling] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);

  const isDeleted = Boolean(order.deletedAt);

  async function patchStatus(status: OrderStatus, extra?: Record<string, unknown>) {
    setStatusBusy(true);
    try {
      const res = await fetch(`/api/orders/${order.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status, ...(extra ?? {}) }),
      });
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.error ?? "Failed to update");
      const updated = body.data as Order360Row;
      setOrder((prev) => ({
        ...prev,
        status: updated.status,
        confirmedAt: updated.confirmedAt ?? prev.confirmedAt,
        fulfilledAt: updated.fulfilledAt ?? prev.fulfilledAt,
        closedAt: updated.closedAt ?? prev.closedAt,
        cancelledAt: updated.cancelledAt ?? prev.cancelledAt,
        cancellationReason: updated.cancellationReason ?? prev.cancellationReason,
      }));
      toast.success(`Order marked ${status}`);
      router.refresh();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to update status");
    } finally {
      setStatusBusy(false);
    }
  }

  return (
    <div className="flex min-h-full flex-col bg-[var(--color-bg-secondary)] pb-8">
      <div className="mb-3">
        <Link
          href="/orders"
          className="inline-flex items-center gap-1 text-sm text-crm-blue hover:underline"
        >
          <ChevronLeft size={14} /> All orders
        </Link>
      </div>

      {isDeleted ? (
        <div className="mb-4 rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          This order is in Trash.
        </div>
      ) : null}

      <OrderDashboardHeader
        order={order}
        account={account}
        contact={contact}
        opportunity={opportunity}
      />

      {!isDeleted ? (
        <>
          <OrderQuickActionsPanel
            quoteId={order.quote?.id ?? order.quoteId}
            quoteNumber={order.quote?.quoteNumber ?? null}
            status={order.status}
            canEdit={permissions.canEdit}
            busy={statusBusy}
            onAdvance={(next) => void patchStatus(next)}
            onCancel={() => setCancelling(true)}
          />

          <div className="mb-4">
            <OrderStatusStepper
              status={order.status}
              canEdit={permissions.canEdit}
              busy={statusBusy}
              onAdvance={(next) => void patchStatus(next)}
            />
          </div>

          <OrderDashboardMetrics snapshot={snapshot} onNavigateTab={setActiveTab} />
        </>
      ) : null}

      <OrderDetailTabs
        order={order}
        account={account}
        contact={contact}
        opportunity={opportunity}
        snapshot={snapshot}
        timelineSeed={timelineSeed}
        overviewActivities={overviewActivities}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {cancelling ? (
        <OrderCancelModal
          open={cancelling}
          onClose={() => setCancelling(false)}
          onConfirm={async (reason) => {
            await patchStatus("Cancelled", { cancellationReason: reason });
            setCancelling(false);
          }}
        />
      ) : null}
    </div>
  );
}
