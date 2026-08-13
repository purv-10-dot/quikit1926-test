/**
 * Derived metrics for the single-order 360 dashboard.
 */

export interface OrderDashboardSnapshot {
  lineCount: number;
  activitiesCount: number;
  documentsCount: number;
  grandTotal: number;
  currency: string;
  daysSinceOrder: number;
  daysToDelivery: number | null;
  isOverdueDelivery: boolean;
  statusProgressPct: number;
}

const STATUS_ORDER = ["Open", "Confirmed", "Fulfilled", "Closed"] as const;

export function buildOrderDashboardSnapshot(input: {
  status: string;
  grandTotal: number;
  currency: string;
  orderDate: Date | string;
  expectedDeliveryDate: Date | string | null;
  lineCount: number;
  activitiesCount: number;
  documentsCount: number;
  now?: Date;
}): OrderDashboardSnapshot {
  const now = input.now ?? new Date();
  const orderMs = new Date(input.orderDate).getTime();
  const daysSinceOrder = Number.isNaN(orderMs)
    ? 0
    : Math.max(0, Math.floor((now.getTime() - orderMs) / (24 * 60 * 60 * 1000)));

  let daysToDelivery: number | null = null;
  let isOverdueDelivery = false;
  if (input.expectedDeliveryDate) {
    const delMs = new Date(input.expectedDeliveryDate).getTime();
    if (!Number.isNaN(delMs)) {
      daysToDelivery = Math.ceil((delMs - now.getTime()) / (24 * 60 * 60 * 1000));
      isOverdueDelivery =
        daysToDelivery < 0 &&
        input.status !== "Closed" &&
        input.status !== "Cancelled" &&
        input.status !== "Fulfilled";
    }
  }

  const idx = STATUS_ORDER.indexOf(input.status as (typeof STATUS_ORDER)[number]);
  const statusProgressPct =
    input.status === "Cancelled"
      ? 0
      : idx < 0
        ? 0
        : Math.round((idx / Math.max(STATUS_ORDER.length - 1, 1)) * 100);

  return {
    lineCount: input.lineCount,
    activitiesCount: input.activitiesCount,
    documentsCount: input.documentsCount,
    grandTotal: input.grandTotal,
    currency: input.currency,
    daysSinceOrder,
    daysToDelivery,
    isOverdueDelivery,
    statusProgressPct,
  };
}
