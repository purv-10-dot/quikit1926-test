"use client";

import { RecordForm } from "@/components/forms/RecordForm";
import { getModuleConfig } from "@/lib/modules";

export function AccountForm() {
  return <RecordForm config={getModuleConfig("chart-of-accounts")} />;
}
