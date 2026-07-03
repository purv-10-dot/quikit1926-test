"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/shared/DataTable";

type SupportTicketRow = {
  id: string;
  ticket_number: string;
  subject: string;
  priority: string;
  status: string;
  requested_by_name: string | null;
  requested_by_email: string | null;
  created_at: string;
};

export function PortalSupportInbox() {
  const tickets = useQuery({
    queryKey: ["support-tickets"],
    queryFn: async () => {
      const response = await fetch("/api/v1/support-tickets");
      const payload = (await response.json()) as { data?: SupportTicketRow[] };
      return payload.data ?? [];
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Support Inbox</CardTitle>
      </CardHeader>
      <CardContent>
        <DataTable
          title="Support Inbox"
          rows={(tickets.data ?? []).map((ticket) => ({
            id: ticket.id,
            ticket_number: ticket.ticket_number,
            subject: ticket.subject,
            requested_by: ticket.requested_by_name ?? ticket.requested_by_email ?? "-",
            priority: ticket.priority,
            status: ticket.status,
            created_at: ticket.created_at
          }))}
          columns={[
            { key: "ticket_number", label: "Ticket" },
            { key: "subject", label: "Subject" },
            { key: "requested_by", label: "Requested By" },
            { key: "priority", label: "Priority", kind: "status" },
            { key: "status", label: "Status", kind: "status" },
            { key: "created_at", label: "Created", kind: "date" }
          ]}
        />
      </CardContent>
    </Card>
  );
}
