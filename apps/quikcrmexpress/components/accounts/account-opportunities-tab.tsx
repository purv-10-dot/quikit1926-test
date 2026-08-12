"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatDate } from "@/lib/utils/date-helpers";
import { STAGE_LABEL } from "@/lib/services/opportunities/stage-labels";
import type { QceOpportunityStage } from "@quikit/database";
import { useToast } from "@/hooks/use-toast";

interface OppRow {
  id: string;
  name: string;
  stage: string;
  amount: number | null;
  probability: number;
  closeDate: string | null;
  amountDisplay?: string | null;
}

export function AccountOpportunitiesTab({ accountId }: { accountId: string }) {
  const toast = useToast();
  const [items, setItems] = useState<OppRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/opportunities?accountId=${encodeURIComponent(accountId)}&pageSize=100`,
        { credentials: "include" },
      );
      const j = await res.json();
      if (!res.ok || j.success === false) {
        throw new Error(j.error ?? "Failed to load opportunities");
      }
      const rows: OppRow[] = Array.isArray(j?.data?.items) ? j.data.items : [];
      setItems(rows);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load opportunities");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [accountId, toast]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (loading) return <p className="py-8 text-center text-sm text-crm-muted">Loading…</p>;
  if (items.length === 0) {
    return <p className="py-8 text-center text-sm text-crm-muted">No opportunities on this account.</p>;
  }

  return (
    <ul className="divide-y divide-crm-border rounded-lg border border-crm-border">
      {items.map((o) => (
        <li key={o.id} className="flex items-center justify-between px-3 py-2 text-sm">
          <div>
            <Link href={`/opportunities/${o.id}`} className="crm-link font-medium">
              {o.name}
            </Link>
            <div className="text-xs text-crm-muted">
              {STAGE_LABEL[o.stage as QceOpportunityStage] ?? o.stage} · {o.probability}% · close{" "}
              {formatDate(o.closeDate)}
            </div>
          </div>
          <div className="font-medium">
            {o.amountDisplay ?? (o.amount != null ? String(o.amount) : "—")}
          </div>
        </li>
      ))}
    </ul>
  );
}
