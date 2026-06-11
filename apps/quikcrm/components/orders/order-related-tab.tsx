"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import type { Order360Row } from "@/lib/services/orders/full-record";

export function OrderRelatedTab({
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
    <div className="grid gap-4 sm:grid-cols-2">
      <RelatedCard title="Source quote">
        {order.quote ? (
          <Link href={`/quotes/${order.quote.id}`} className="text-crm-blue hover:underline">
            {order.quote.quoteNumber}
            {order.quote.versionNumber > 1 ? ` (v${order.quote.versionNumber})` : ""}
          </Link>
        ) : (
          <p className="text-sm text-crm-muted">No linked quote</p>
        )}
      </RelatedCard>
      <RelatedCard title="Account">
        {account ? (
          <Link href={`/accounts/${account.id}`} className="text-crm-blue hover:underline">
            {account.name}
          </Link>
        ) : (
          <p className="text-sm text-crm-muted">—</p>
        )}
      </RelatedCard>
      <RelatedCard title="Contact">
        {contact ? (
          <div className="text-sm">
            <Link href={`/contacts/${contact.id}`} className="font-medium text-crm-blue hover:underline">
              {contactName}
            </Link>
            {contact.email ? (
              <p className="mt-1 text-crm-muted">
                <a href={`mailto:${contact.email}`} className="hover:underline">
                  {contact.email}
                </a>
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-crm-muted">—</p>
        )}
      </RelatedCard>
      <RelatedCard title="Opportunity">
        {opportunity ? (
          <div className="text-sm">
            <Link
              href={`/opportunities/${opportunity.id}`}
              className="font-medium text-crm-blue hover:underline"
            >
              {opportunity.name}
            </Link>
            <p className="mt-1 text-crm-muted">{opportunity.stage}</p>
          </div>
        ) : (
          <p className="text-sm text-crm-muted">—</p>
        )}
      </RelatedCard>
    </div>
  );
}

function RelatedCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-crm-border bg-white p-4">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-crm-muted">{title}</h3>
      {children}
    </div>
  );
}
