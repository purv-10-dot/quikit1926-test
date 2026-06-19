"use client";

import Link from "next/link";
import { User } from "lucide-react";
import type { Contact360Row } from "@/lib/services/contacts/full-record";

export function ContactDashboardHeader({
  contact,
  account,
  lead,
}: {
  contact: Contact360Row;
  account: { id: string; name: string } | null;
  lead: { id: string; name: string; company: string | null } | null;
}) {
  const fullName = `${contact.firstName} ${contact.lastName ?? ""}`.trim();

  return (
    <div className="mb-4 rounded-lg border border-crm-border bg-white p-4 shadow-sm sm:p-5">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-crm-border bg-crm-panel text-crm-blue">
          <User className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold text-crm-text">{fullName}</h1>
            {contact.contactStage ? (
              <span className="rounded bg-accent-100 px-2 py-0.5 text-[11px] font-medium text-accent-700">
                {contact.contactStage}
              </span>
            ) : null}
            {contact.deletedAt ? (
              <span className="rounded bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                In trash
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 text-sm text-crm-muted">
            {[contact.title, contact.ownerName && `Owner ${contact.ownerName}`]
              .filter(Boolean)
              .join(" · ") || "—"}
          </p>
          <p className="mt-0.5 text-xs text-crm-muted">
            {[contact.city, contact.source && `Source: ${contact.source}`].filter(Boolean).join(" · ") ||
              "—"}
          </p>
          {(contact.email || contact.phone) && (
            <p className="mt-1 text-sm text-crm-text">
              {contact.email ? (
                <a href={`mailto:${contact.email}`} className="text-crm-blue hover:underline">
                  {contact.email}
                </a>
              ) : null}
              {contact.email && contact.phone ? " · " : ""}
              {contact.phone ? (
                <a href={`tel:${contact.phone}`} className="text-crm-blue hover:underline">
                  {contact.phone}
                </a>
              ) : null}
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-3 text-xs">
            {account ? (
              <span className="text-crm-muted">
                Account{" "}
                <Link href={`/accounts/${account.id}`} className="font-medium text-crm-blue hover:underline">
                  {account.name}
                </Link>
              </span>
            ) : null}
            {lead ? (
              <span className="text-crm-muted">
                Lead{" "}
                <Link href={`/leads/${lead.id}`} className="font-medium text-crm-blue hover:underline">
                  {lead.company ? `${lead.name} — ${lead.company}` : lead.name}
                </Link>
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
