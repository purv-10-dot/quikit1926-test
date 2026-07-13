"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { BentoCard, Metric } from "@/components/design/bento";
import { InsightStrip } from "@/components/reports/InsightStrip";
import { DataTable } from "@/components/shared/DataTable";
import { DateRangePicker } from "@/components/shared/DateRangePicker";
import { PageHeader } from "@/components/shared/PageHeader";
import { ReportExportButton } from "@/components/reports/ReportExportButton";
import { translateReportMeta, useI18n } from "@/lib/i18n";
import { useCurrency } from "@/lib/currency";
import type { ReportConfig } from "@/lib/reports";

export function ReportPage({ config }: { config: ReportConfig }) {
  const { locale } = useI18n();
  const { format: formatMoney } = useCurrency();
  const meta = translateReportMeta(locale, config.key, { title: config.title, description: config.description });
  const [range, setRange] = useState({ from: "2026-01-01", to: "2026-04-20" });
  const { data } = useQuery({
    queryKey: ["report", config.key, range],
    queryFn: async () => {
      const params = new URLSearchParams(range);
      const response = await fetch(`${config.apiPath}?${params.toString()}`);
      if (!response.ok) {
        return config;
      }
      const payload = (await response.json()) as { data?: ReportConfig };
      return payload.data ?? config;
    },
    initialData: config
  });

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader title={meta.title} description={meta.description} />
      <div className="flex flex-col gap-3 rounded-2xl border border-border/50 bg-card p-4 shadow-card md:flex-row md:items-center md:justify-between">
        <DateRangePicker from={range.from} to={range.to} onChange={setRange} />
        <div className="flex gap-2">
          <ReportExportButton label="PDF" />
          <ReportExportButton label="CSV" />
        </div>
      </div>
      {data.summary.length ? <InsightStrip reportKey={config.key} summary={data.summary} title={meta.title} format={formatMoney} /> : null}
      <div className="grid gap-4 md:grid-cols-3">
        {data.summary.map((item) => (
          <BentoCard key={item.label} interactive={false}>
            <Metric
              label={item.label}
              value={item.kind === "number" ? new Intl.NumberFormat("en-IN").format(item.value) : item.kind === "percent" ? `${item.value}%` : formatMoney(item.value)}
            />
          </BentoCard>
        ))}
      </div>
      <DataTable columns={data.columns} rows={data.rows} title={meta.title} />
    </div>
  );
}
