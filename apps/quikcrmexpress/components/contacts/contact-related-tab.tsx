"use client";

import Link from "next/link";
import { Building2, UserPlus } from "lucide-react";

export function ContactRelatedTab({
  account,
  lead,
}: {
  account: { id: string; name: string } | null;
  lead: { id: string; name: string; company: string | null } | null;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="rounded-lg border border-crm-border p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-crm-text">
          <Building2 size={16} /> Account
        </div>
        {account ? (
          <Link href={`/accounts/${account.id}`} className="text-crm-blue hover:underline">
            {account.name}
          </Link>
        ) : (
          <p className="text-sm text-crm-muted">
            No account linked. Edit the contact to associate an account for pipeline roll-up.
          </p>
        )}
      </div>
      <div className="rounded-lg border border-crm-border p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-crm-text">
          <UserPlus size={16} /> Lead
        </div>
        {lead ? (
          <Link href={`/leads/${lead.id}`} className="text-crm-blue hover:underline">
            {lead.company ? `${lead.name} — ${lead.company}` : lead.name}
          </Link>
        ) : (
          <p className="text-sm text-crm-muted">No lead linked to this contact.</p>
        )}
      </div>
    </div>
  );
}
