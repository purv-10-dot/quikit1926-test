"use client";
import { ClientResponsiveContainer } from "@/components/design/ClientResponsiveContainer";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DashboardData } from "@/lib/hooks/useDashboard";
import { useCurrency } from "@/lib/currency";

const colors = ["#10B981", "#0EA5E9", "#F59E0B", "#EF4444"];

export function ExpensesChart({ data }: { data: DashboardData["aging"] }) {
  const { format } = useCurrency();
  return (
    <Card>
      <CardHeader>
        <CardTitle>Invoice Aging</CardTitle>
      </CardHeader>
      <CardContent className="h-80">
        <ClientResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" innerRadius={58} outerRadius={96} paddingAngle={3}>
              {data.map((item, index) => (
                <Cell key={item.name} fill={colors[index % colors.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(value: number) => format(value)} />
          </PieChart>
        </ClientResponsiveContainer>
      </CardContent>
    </Card>
  );
}
