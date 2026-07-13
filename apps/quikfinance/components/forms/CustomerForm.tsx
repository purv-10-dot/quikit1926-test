"use client";

import { RecordForm } from "@/components/forms/RecordForm";
import { getModuleConfig } from "@/lib/modules";

export function CustomerForm() {
  return <RecordForm config={getModuleConfig("customers")} />;
}
