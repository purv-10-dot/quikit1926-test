"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardData } from "@/lib/hooks/useDashboard";
import { useCurrency } from "@/lib/currency";

export function AgingSummaryWidget({ feed }: { feed: DashboardData["feed"] }) {
  const { format } = useCurrency();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Transactions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {feed.map((item) => (
          <div key={item.id} className="flex items-start justify-between gap-4 border-b pb-3 last:border-0 last:pb-0">
            <div>
              <p className="text-sm font-medium">{item.label}</p>
              <p className="text-xs text-muted-foreground">{item.date}</p>
            </div>
            <span className={item.amount >= 0 ? "text-sm font-semibold text-emerald-600" : "text-sm font-semibold text-red-600"}>
              {format(Math.abs(item.amount))}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
