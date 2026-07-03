"use client";

import { FolderOpen } from "lucide-react";
import { PortalPlaceholder } from "@/components/portal/PortalPlaceholder";

export default function Page() {
  return (
    <PortalPlaceholder
      title={"Documents"}
      description={"Filings and certificates"}
      icon={FolderOpen}
      features={[
        { title: "Filings", detail: "ROC and statutory filings." },
        { title: "Certificates", detail: "Issued certificates." },
        { title: "Registers", detail: "Statutory registers." }
      ]}
    />
  );
}
