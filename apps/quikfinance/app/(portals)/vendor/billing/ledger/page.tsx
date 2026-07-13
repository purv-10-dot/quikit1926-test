"use client";

import { FileBarChart } from "lucide-react";
import { ClientList } from "@/components/portal/client/ClientList";

export default function VendorLedgerPage() {
  return (
    <ClientList
      endpoint="/api/v1/portal/vendor/list"
      type="bills"
      title="Vendor Ledger"
      description="Your running account — bills and balances"
      icon={FileBarChart}
      columns={[
        { key: "bill_number", label: "Reference" },
        { key: "issue_date", label: "Date", kind: "date" },
        { key: "total", label: "Billed", kind: "money", align: "right" },
        { key: "balance_due", label: "Outstanding", kind: "money", align: "right" },
        { key: "status", label: "Status", kind: "status", align: "right" }
      ]}
    />
  );
}
