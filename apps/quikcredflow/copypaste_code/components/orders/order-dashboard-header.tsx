"use client";

import Link from "next/link";
import { Package } from "lucide-react";
import type { Order360Row, OrderStatus } from "@/lib/services/orders/full-record";

const STATUS_STYLE: Record<OrderStatus, string> = {
  Open: "bg-blue-100 text-blue-700",
  Confirmed: "bg-purple-100 text-purple-700",
  Fulfilled: "bg-green-100 text-green-700",
  Closed: "bg-gray-100 text-gray-700",
  Cancelled: "bg-red-100 text-red-700",
};

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function OrderDashboardHeader({
  order,
  account,
  contact,
  opportunity,
}: {
  order: Order360Row;
  account: { id: string; name: string } | null;
  contact: { id: string; firstName: string; lastName: string | null; email: string | null } | null;
  opportunity: { id: string; name: string; stage: string } | null;
}) {
  const contactName = contact
    ? `${contact.firstName} ${contact.lastName ?? ""}`.trim()
    : null;

  return (
    <div className="mb-4 rounded-lg border border-crm-border bg-white p-4 shadow-sm sm:p-5">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-crm-border bg-crm-panel text-crm-blue">
          <Package className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold text-crm-text">{order.orderNumber}</h1>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS_STYLE[order.status]}`}
            >
              {order.status}
            </span>
            {order.deletedAt ? (
              <span className="rounded bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                In trash
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-sm text-crm-muted">
            Order date {fmtDate(order.orderDate)}
            {order.ownerName ? ` · Owner ${order.ownerName}` : ""}
          </p>
          <div className="mt-2 flex flex-wrap gap-3 text-xs">
            {order.quote ? (
              <span className="text-crm-muted">
                Quote{" "}
                <Link
                  href={`/quotes/${order.quote.id}`}
                  className="font-medium text-crm-blue hover:underline"
                >
                  {order.quote.quoteNumber}
                  {order.quote.versionNumber > 1 ? ` (v${order.quote.versionNumber})` : ""}
                </Link>
              </span>
            ) : null}
            {account ? (
              <span className="text-crm-muted">
                Account{" "}
                <Link
                  href={`/accounts/${account.id}`}
                  className="font-medium text-crm-blue hover:underline"
                >
                  {account.name}
                </Link>
              </span>
            ) : null}
            {contact ? (
              <span className="text-crm-muted">
                Contact{" "}
                <Link
                  href={`/contacts/${contact.id}`}
                  className="font-medium text-crm-blue hover:underline"
                >
                  {contactName}
                </Link>
              </span>
            ) : null}
            {opportunity ? (
              <span className="text-crm-muted">
                Opportunity{" "}
                <Link
                  href={`/opportunities/${opportunity.id}`}
                  className="font-medium text-crm-blue hover:underline"
                >
                  {opportunity.name}
                </Link>
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
