"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { FileText, X } from "lucide-react";
import type { OrderStatus } from "@/lib/services/orders/full-record";

interface Props {
  quoteId: string | null;
  quoteNumber: string | null;
  status: OrderStatus;
  canEdit: boolean;
  onAdvance: (next: OrderStatus) => void;
  onCancel: () => void;
  busy?: boolean;
}

function ActionBtn({
  children,
  onClick,
  disabled,
  variant = "default",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        "inline-flex items-center gap-1.5 rounded border px-3 py-2 text-sm font-medium disabled:opacity-50 " +
        (variant === "danger"
          ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
          : "border-crm-border bg-white text-crm-text hover:bg-crm-panel")
      }
    >
      {children}
    </button>
  );
}

export function OrderQuickActionsPanel({
  quoteId,
  quoteNumber,
  status,
  canEdit,
  onAdvance,
  onCancel,
  busy,
}: Props) {
  if (status === "Cancelled" || status === "Closed") {
    return quoteId ? (
      <div className="mb-4 flex flex-wrap gap-2">
        <Link
          href={`/quotes/${quoteId}`}
          className="inline-flex items-center gap-1.5 rounded border border-crm-border bg-white px-3 py-2 text-sm font-medium text-crm-text hover:bg-crm-panel"
        >
          <FileText className="h-4 w-4" />
          View quote {quoteNumber ?? ""}
        </Link>
      </div>
    ) : null;
  }

  return (
    <div className="mb-4 flex flex-wrap gap-2">
      {quoteId ? (
        <Link
          href={`/quotes/${quoteId}`}
          className="inline-flex items-center gap-1.5 rounded border border-crm-border bg-white px-3 py-2 text-sm font-medium text-crm-text hover:bg-crm-panel"
        >
          <FileText className="h-4 w-4" />
          View quote
        </Link>
      ) : null}
      {canEdit && status === "Open" ? (
        <ActionBtn disabled={busy} onClick={() => onAdvance("Confirmed")}>
          Mark confirmed
        </ActionBtn>
      ) : null}
      {canEdit && status === "Confirmed" ? (
        <ActionBtn disabled={busy} onClick={() => onAdvance("Fulfilled")}>
          Mark fulfilled
        </ActionBtn>
      ) : null}
      {canEdit && status === "Fulfilled" ? (
        <ActionBtn disabled={busy} onClick={() => onAdvance("Closed")}>
          Mark closed
        </ActionBtn>
      ) : null}
      {canEdit && (status === "Open" || status === "Confirmed") ? (
        <ActionBtn variant="danger" disabled={busy} onClick={onCancel}>
          <X className="h-4 w-4" />
          Cancel order
        </ActionBtn>
      ) : null}
    </div>
  );
}
