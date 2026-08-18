"use client";

import Link from "next/link";
import { Trophy } from "lucide-react";
import type { RecentWinRow } from "@/lib/dashboard/types";
import { formatDate } from "@/lib/utils/date-helpers";

export function RecentWinsWidget({
  wins,
  rangeDescription,
}: {
  wins: RecentWinRow[];
  rangeDescription: string;
}) {
  return (
    <section className="crm-card p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Trophy className="text-emerald-600" size={18} />
          <div>
            <h2 className="text-sm font-semibold text-crm-text">Recent wins</h2>
            <p className="text-xs text-crm-muted">Closed won · {rangeDescription}</p>
          </div>
        </div>
        <Link href="/opportunities" className="text-xs font-medium text-crm-blue hover:underline">
          Pipeline →
        </Link>
      </div>
      {wins.length === 0 ? (
        <p className="py-8 text-center text-sm text-crm-muted">No deals closed in this period.</p>
      ) : (
        <ul className="divide-y divide-crm-border">
          {wins.map((w) => (
            <li key={w.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <div className="min-w-0">
                <Link href={`/opportunities/${w.id}`} className="crm-link truncate font-medium">
                  {w.name}
                </Link>
                <p className="text-xs text-crm-muted">
                  {w.ownerName ?? "Unassigned"} · {formatDate(w.closedAt)}
                </p>
              </div>
              <span className="shrink-0 font-semibold text-emerald-700">{w.amountDisplay}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
