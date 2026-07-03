"use client";

import { FolderOpen } from "lucide-react";
import { PortalPlaceholder } from "@/components/portal/PortalPlaceholder";

export default function Page() {
  return (
    <PortalPlaceholder
      title={"Documents"}
      description={"Compliance and contracts"}
      icon={FolderOpen}
      features={[
        { title: "GST / PAN / MSME", detail: "Your statutory certificates." },
        { title: "Bank Details", detail: "Verified bank accounts." },
        { title: "Contracts", detail: "Active agreements." }
      ]}
    />
  );
}
