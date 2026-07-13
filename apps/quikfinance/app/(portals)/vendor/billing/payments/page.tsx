"use client";

import { Banknote } from "lucide-react";
import { ClientList } from "@/components/portal/client/ClientList";

export default function VendorPaymentStatusPage() {
  return (
    <ClientList
      endpoint="/api/v1/portal/vendor/list"
      type="bills"
      title="Payment Status"
      description="Payment status of your submitted bills"
      icon={Banknote}
      columns={[
        { key: "bill_number", label: "Bill #" },
        { key: "due_date", label: "Due", kind: "date" },
        { key: "total", label: "Amount", kind: "money", align: "right" },
        { key: "balance_due", label: "Unpaid", kind: "money", align: "right" },
        { key: "status", label: "Status", kind: "status", align: "right" }
      ]}
    />
  );
}
