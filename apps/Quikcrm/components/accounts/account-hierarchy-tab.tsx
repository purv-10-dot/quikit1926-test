"use client";

import Link from "next/link";
import { AccountStatusPill } from "@/components/accounts/account-status-pill";

interface Props {
  parent: { id: string; name: string } | null;
  subsidiaries: { id: string; name: string; status: string | null }[];
}

export function AccountHierarchyTab({ parent, subsidiaries }: Props) {
  return (
    <div className="space-y-6">
      <section>
        <h3 className="text-sm font-semibold text-crm-text">Parent account</h3>
        {parent ? (
          <p className="mt-2 text-sm">
            <Link href={`/accounts/${parent.id}`} className="text-crm-blue hover:underline">
              {parent.name}
            </Link>
          </p>
        ) : (
          <p className="mt-2 text-sm text-crm-muted">This is a top-level account (no parent).</p>
        )}
      </section>
      <section>
        <h3 className="text-sm font-semibold text-crm-text">Subsidiaries</h3>
        {subsidiaries.length === 0 ? (
          <p className="mt-2 text-sm text-crm-muted">No subsidiary accounts.</p>
        ) : (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {subsidiaries.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between rounded border border-crm-border bg-white px-3 py-2 text-sm"
              >
                <Link href={`/accounts/${c.id}`} className="text-crm-blue hover:underline">
                  {c.name}
                </Link>
                <AccountStatusPill status={c.status} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
