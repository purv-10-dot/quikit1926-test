"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface ContactRow {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  title: string | null;
  ownerName: string | null;
}

export function AccountContactsTab({
  accountId,
  accountName: _accountName,
}: {
  accountId: string;
  accountName: string;
}) {
  const [items, setItems] = useState<ContactRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/contacts?accountId=${encodeURIComponent(accountId)}&pageSize=100`,
        { credentials: "include" },
      );
      const j = await res.json();
      const rows = j?.success && Array.isArray(j.data?.items) ? j.data.items : [];
      setItems(rows);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (loading) return <p className="py-8 text-center text-sm text-crm-muted">Loading…</p>;
  if (items.length === 0) {
    return <p className="py-8 text-center text-sm text-crm-muted">No contacts on this account.</p>;
  }

  return (
    <ul className="divide-y divide-crm-border rounded-lg border border-crm-border">
      {items.map((c) => (
        <li key={c.id} className="flex items-center justify-between px-3 py-2 text-sm">
          <div>
            <Link href={`/contacts/${c.id}`} className="crm-link font-medium">
              {[c.firstName, c.lastName].filter(Boolean).join(" ")}
            </Link>
            <div className="text-xs text-crm-muted">
              {c.title || "—"} · {c.email || c.phone || "—"}
            </div>
          </div>
          <span className="text-xs text-crm-muted">{c.ownerName || "—"}</span>
        </li>
      ))}
    </ul>
  );
}
