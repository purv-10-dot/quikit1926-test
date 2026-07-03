"use client";

import { FileText } from "lucide-react";
import { ClientList } from "@/components/portal/client/ClientList";

export default function ClientQuotesPage() {
  return (
    <ClientList
      type="quotes"
      title="Quotes"
      description="Review and track quotations"
      icon={FileText}
      columns={[
        { key: "quotation_number", label: "Quote #" },
        { key: "created_at", label: "Date", kind: "date" },
        { key: "total", label: "Amount", kind: "money", align: "right" },
        { key: "status", label: "Status", kind: "status", align: "right" }
      ]}
    />
  );
}
