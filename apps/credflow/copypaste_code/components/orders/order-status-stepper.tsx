"use client";

import { Check, Loader2 } from "lucide-react";
import type { OrderStatus } from "@/lib/services/orders/full-record";

const STEPS: { key: OrderStatus; label: string }[] = [
  { key: "Open", label: "Open" },
  { key: "Confirmed", label: "Confirmed" },
  { key: "Fulfilled", label: "Fulfilled" },
  { key: "Closed", label: "Closed" },
];

function stepIndex(status: OrderStatus): number {
  if (status === "Cancelled") return -1;
  return STEPS.findIndex((s) => s.key === status);
}

interface Props {
  status: OrderStatus;
  canEdit: boolean;
  busy?: boolean;
  onAdvance?: (next: OrderStatus) => void;
}

export function OrderStatusStepper({ status, canEdit, busy, onAdvance }: Props) {
  const activeIdx = stepIndex(status);
  const isCancelled = status === "Cancelled";

  if (isCancelled) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        This order was cancelled. Create a new conversion from the source quote to replace it.
      </div>
    );
  }

  return (
    <div className="crm-card overflow-hidden p-4">
      <p className="mb-3 text-xs font-medium uppercase tracking-wider text-crm-muted">Fulfillment pipeline</p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
        {STEPS.map((step, idx) => {
          const isPast = activeIdx > idx;
          const isActive = activeIdx === idx;
          const isFuture = activeIdx < idx;
          const next = STEPS[idx + 1]?.key;
          const canClick = canEdit && isActive && next && onAdvance && !busy;

          return (
            <button
              key={step.key}
              type="button"
              disabled={!canClick}
              onClick={() => canClick && onAdvance(next)}
              className={
                "relative flex flex-1 items-center justify-center gap-2 rounded-md border px-3 py-2.5 text-sm font-medium transition " +
                (isActive
                  ? "border-accent-500 bg-accent-600 text-white shadow-sm"
                  : isPast
                    ? "border-accent-200 bg-accent-50 text-accent-800 hover:bg-accent-100"
                    : "border-crm-border bg-white text-crm-muted") +
                (canClick ? " cursor-pointer hover:opacity-95" : "") +
                (isFuture && !canClick ? " cursor-default" : "")
              }
            >
              {isPast ? <Check className="h-4 w-4 shrink-0" /> : null}
              {busy && isActive ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : null}
              {step.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
