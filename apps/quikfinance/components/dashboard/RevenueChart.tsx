"use client";
import { ClientResponsiveContainer } from "@/components/design/ClientResponsiveContainer";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardData } from "@/lib/hooks/useDashboard";
import { useCurrency } from "@/lib/currency";

export function RevenueChart({ data }: { data: DashboardData["revenueExpense"] }) {
  const { format, formatCompact } = useCurrency();
  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>Revenue vs Expenses</CardTitle>
      </CardHeader>
      <CardContent className="h-80">
        <ClientResponsiveContainer width="100%" height="100%">
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="month" />
            <YAxis tickFormatter={(value: number) => formatCompact(value)} />
            <Tooltip formatter={(value: number) => format(value)} />
            <Legend />
            <Bar dataKey="revenue" fill="#0EA5E9" radius={[4, 4, 0, 0]} />
            <Bar dataKey="expenses" fill="#F59E0B" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ClientResponsiveContainer>
      </CardContent>
    </Card>
  );
}
