"use client";

import { MessagesSquare } from "lucide-react";
import { PortalPlaceholder } from "@/components/portal/PortalPlaceholder";

export default function Page() {
  return (
    <PortalPlaceholder
      title={"Communication"}
      description={"Messages and RFQs"}
      icon={MessagesSquare}
      features={[
        { title: "Messages", detail: "Threads with the buyer." },
        { title: "RFQs", detail: "Requests for quotation." }
      ]}
    />
  );
}
