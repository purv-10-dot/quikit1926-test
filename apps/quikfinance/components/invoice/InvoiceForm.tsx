"use client";

import { RecordForm } from "@/components/forms/RecordForm";
import { getModuleConfig } from "@/lib/modules";

export function InvoiceForm() {
  return <RecordForm config={getModuleConfig("invoices")} />;
}
