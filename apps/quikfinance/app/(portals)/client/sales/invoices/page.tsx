"use client";

import { Receipt } from "lucide-react";
import { ClientList } from "@/components/portal/client/ClientList";

export default function ClientInvoicesPage() {
  return (
    <ClientList
      type="invoices"
      title="Invoices"
      description="All invoices on your account"
      icon={Receipt}
      columns={[
        { key: "invoice_number", label: "Invoice #" },
        { key: "issue_date", label: "Date", kind: "date" },
        { key: "due_date", label: "Due", kind: "date" },
        { key: "total", label: "Total", kind: "money", align: "right" },
        { key: "balance_due", label: "Balance", kind: "money", align: "right" },
        { key: "status", label: "Status", kind: "status", align: "right" }
      ]}
    />
  );
}
