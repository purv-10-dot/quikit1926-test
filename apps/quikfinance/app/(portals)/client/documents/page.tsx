"use client";

import { FolderOpen } from "lucide-react";
import { PortalPlaceholder } from "@/components/portal/PortalPlaceholder";

export default function ClientDocumentsPage() {
  return (
    <PortalPlaceholder
      title="Documents"
      description="Contracts, agreements and shared files"
      icon={FolderOpen}
      features={[
        { title: "Contracts", detail: "View active contracts and their renewal dates." },
        { title: "Signed Agreements", detail: "Download counter-signed agreements and POs." },
        { title: "Shared Documents", detail: "Files your account manager has shared with you." },
        { title: "Attachments", detail: "Attachments linked to invoices and orders." }
      ]}
    />
  );
}
