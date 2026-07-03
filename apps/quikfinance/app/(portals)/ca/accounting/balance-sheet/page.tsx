"use client";

import { CaReport } from "@/components/portal/ca/CaReport";

export default function CaBalanceSheetPage() {
  return <CaReport type="balance-sheet" title="Balance Sheet" description="For the selected company" />;
}
