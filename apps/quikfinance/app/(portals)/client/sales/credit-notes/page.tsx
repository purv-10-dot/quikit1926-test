"use client";

import { ClipboardCheck } from "lucide-react";
import { ClientList } from "@/components/portal/client/ClientList";

export default function ClientCreditNotesPage() {
  return (
    <ClientList
      type="credit-notes"
      title="Credit Notes"
      description="Credits issued to your account"
      icon={ClipboardCheck}
      columns={[
        { key: "credit_note_number", label: "Credit Note #" },
        { key: "created_at", label: "Date", kind: "date" },
        { key: "total", label: "Amount", kind: "money", align: "right" },
        { key: "status", label: "Status", kind: "status", align: "right" }
      ]}
    />
  );
}
