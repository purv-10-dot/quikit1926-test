"use client";

import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCurrency } from "@/lib/currency";

export function KPICard({
  label,
  value,
  change,
  tone,
  kind = "money"
}: {
  label: string;
  value: number;
  change: string;
  tone: "good" | "warn" | "neutral";
  kind?: "money" | "number";
}) {
  const { format } = useCurrency();
  const Icon = tone === "good" ? ArrowUpRight : tone === "warn" ? ArrowDownRight : Minus;
  const toneClass = tone === "good" ? "text-emerald-600" : tone === "warn" ? "text-amber-600" : "text-muted-foreground";

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold tabular-nums">{kind === "number" ? new Intl.NumberFormat("en-IN").format(value) : format(value)}</div>
        <div className={`mt-2 inline-flex items-center text-xs font-semibold ${toneClass}`}>
          <Icon className="mr-1 h-3.5 w-3.5" />
          {change}
        </div>
      </CardContent>
    </Card>
  );
}
