"use client";

import { RecordForm } from "@/components/forms/RecordForm";
import { getModuleConfig } from "@/lib/modules";

export function VendorForm() {
  return <RecordForm config={getModuleConfig("vendors")} />;
}
