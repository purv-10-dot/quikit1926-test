"use client";

import { UserCircle } from "lucide-react";
import { PortalPlaceholder } from "@/components/portal/PortalPlaceholder";

export default function Page() {
  return (
    <PortalPlaceholder
      title={"Profile"}
      description={"Company and tax details"}
      icon={UserCircle}
      features={[
        { title: "Company", detail: "Vendor profile and contacts." },
        { title: "Bank Accounts", detail: "Manage payout accounts." },
        { title: "Tax Details", detail: "GSTIN, PAN and MSME." }
      ]}
    />
  );
}
