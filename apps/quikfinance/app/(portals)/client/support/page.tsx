"use client";

import { LifeBuoy } from "lucide-react";
import { PortalPlaceholder } from "@/components/portal/PortalPlaceholder";

export default function ClientSupportPage() {
  return (
    <PortalPlaceholder
      title="Support"
      description="Raise tickets and find answers"
      icon={LifeBuoy}
      features={[
        { title: "Raise Ticket", detail: "Open a new support request and track it to resolution." },
        { title: "Ticket History", detail: "Every request you've raised, with status and replies." },
        { title: "Chat", detail: "Real-time chat with the support team." },
        { title: "Knowledge Base", detail: "Self-serve articles and how-tos." }
      ]}
    />
  );
}
