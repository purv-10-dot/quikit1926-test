"use client";

import { RecordForm } from "@/components/forms/RecordForm";
import { PageHeader } from "@/components/shared/PageHeader";
import { translateModuleMeta, useI18n } from "@/lib/i18n";
import type { ModuleConfig } from "@/lib/modules";

export function FormPage({ config }: { config: ModuleConfig }) {
  const { locale } = useI18n();
  const meta = translateModuleMeta(locale, config.key, {
    title: config.title,
    description: config.description,
    entityName: config.entityName,
    primaryAction: config.primaryAction
  });

  return (
    <div className="space-y-6 animate-fade-up">
      <PageHeader title={`New ${meta.entityName}`} description={meta.description} />
      <RecordForm config={config} />
    </div>
  );
}
