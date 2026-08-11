"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function PipelineChart({ data }: { data: { stage: string; count: number }[] }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="stage" stroke="#64748b" fontSize={12} />
          <YAxis stroke="#64748b" fontSize={12} allowDecimals={false} />
          <Tooltip />
          <Bar dataKey="count" fill="#2563eb" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
