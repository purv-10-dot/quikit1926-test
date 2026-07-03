"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/shared/DataTable";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { translateModuleMeta, useI18n } from "@/lib/i18n";
import type { ModuleConfig } from "@/lib/modules";

export function DetailPage({ config, id }: { config: ModuleConfig; id: string }) {
  const { locale, t } = useI18n();
  const meta = translateModuleMeta(locale, config.key, {
    title: config.title,
    description: config.description,
    entityName: config.entityName,
    primaryAction: config.primaryAction
  });
  const row = config.rows.find((item) => item.id === id) ?? config.rows[0];

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader title={`${meta.entityName[0]?.toUpperCase() ?? ""}${meta.entityName.slice(1)} detail`} description={meta.description} />
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader>
            <CardTitle>{t("common.activity", "Activity")}</CardTitle>
          </CardHeader>
          <CardContent>
            <DataTable columns={config.columns} rows={row ? [row] : []} title={`${meta.title} detail`} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t("common.controls", "Controls")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">{t("common.status", "Status")}</span>
              <StatusBadge status={typeof row?.status === "string" ? row.status : "active"} />
            </div>
            <Button className="w-full">{t("common.edit", "Edit")}</Button>
            <Button variant="secondary" className="w-full">
              {t("common.duplicate", "Duplicate")}
            </Button>
            {config.key === "invoices" ? (
              <Button asChild variant="secondary" className="w-full">
                <Link href={`/invoices/${id}/payment-link`}>{t("common.collectOnline", "Collect online")}</Link>
              </Button>
            ) : null}
            <Button asChild variant="secondary" className="w-full">
              <Link href={config.key === "bank-accounts" ? `/bank-accounts/${id}/reconciliation` : `/${config.key}`}>{t("common.openWorkflow", "Open workflow")}</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
