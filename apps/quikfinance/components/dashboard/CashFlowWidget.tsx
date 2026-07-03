"use client";
import { ClientResponsiveContainer } from "@/components/design/ClientResponsiveContainer";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardData } from "@/lib/hooks/useDashboard";
import { useCurrency } from "@/lib/currency";

export function CashFlowWidget({ data }: { data: DashboardData["cashFlow"] }) {
  const { format, formatCompact } = useCurrency();
  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>Cash Flow</CardTitle>
      </CardHeader>
      <CardContent className="h-72">
        <ClientResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" />
            <YAxis tickFormatter={(value: number) => formatCompact(value)} />
            <Tooltip formatter={(value: number) => format(value)} />
            <Line type="monotone" dataKey="cash" stroke="#10B981" strokeWidth={3} dot={{ r: 4 }} />
          </LineChart>
        </ClientResponsiveContainer>
      </CardContent>
    </Card>
  );
}
