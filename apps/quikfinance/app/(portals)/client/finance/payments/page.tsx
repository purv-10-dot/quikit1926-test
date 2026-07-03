"use client";

import { Wallet } from "lucide-react";
import { ClientList } from "@/components/portal/client/ClientList";

export default function ClientPaymentsPage() {
  return (
    <ClientList
      type="payments"
      title="Payment History"
      description="Payments received on your account"
      icon={Wallet}
      columns={[
        { key: "payment_number", label: "Payment #" },
        { key: "payment_date", label: "Date", kind: "date" },
        { key: "amount", label: "Amount", kind: "money", align: "right" },
        { key: "status", label: "Status", kind: "status", align: "right" }
      ]}
    />
  );
}
