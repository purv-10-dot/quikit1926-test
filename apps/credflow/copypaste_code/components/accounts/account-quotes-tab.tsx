"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatDate } from "@/lib/utils/date-helpers";
import { formatGeneric } from "@/lib/services/opportunities/currency";

interface QuoteRow {
  id: string;
  quoteNumber: string;
  status: string;
  grandTotal: number | string | null;
  currency: string;
  sentAt: string | null;
}

export function AccountQuotesTab({ accountId }: { accountId: string }) {
  const [items, setItems] = useState<QuoteRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/accounts/${accountId}/full`, { credentials: "include" });
      const j = await res.json();
      if (!res.ok || !j.success) {
        setItems([]);
        return;
      }
      const quotes = Array.isArray(j.data?.quotes) ? j.data.quotes : [];
      setItems(
        quotes.map((q: QuoteRow & { createdAt?: string }) => ({
          id: q.id,
          quoteNumber: q.quoteNumber,
          status: q.status,
          grandTotal: q.grandTotal != null ? Number(q.grandTotal) : null,
          currency: q.currency ?? "INR",
          sentAt: q.sentAt,
        })),
      );
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
    return <p className="py-8 text-center text-sm text-crm-muted">No quotes for this account.</p>;
  }

  return (
    <ul className="divide-y divide-crm-border rounded-lg border border-crm-border">
      {items.map((q) => (
        <li key={q.id} className="flex items-center justify-between px-3 py-2 text-sm">
          <div>
            <Link href={`/quotes/${q.id}`} className="crm-link font-medium">
              {q.quoteNumber}
            </Link>
            <div className="text-xs text-crm-muted">
              {q.status}
              {q.sentAt ? ` · sent ${formatDate(q.sentAt)}` : ""}
            </div>
          </div>
          <span className="font-medium">
            {q.grandTotal != null && Number(q.grandTotal) > 0
              ? formatGeneric(Number(q.grandTotal), q.currency)
              : "—"}
          </span>
        </li>
      ))}
    </ul>
  );
}
