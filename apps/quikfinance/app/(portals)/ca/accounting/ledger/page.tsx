"use client";

import { BookOpen } from "lucide-react";
import { PortalPlaceholder } from "@/components/portal/PortalPlaceholder";

export default function Page() {
  return (
    <PortalPlaceholder
      title={"Ledger"}
      description={"General and party ledgers"}
      icon={BookOpen}
      features={[
        { title: "Ledger", detail: "Account-wise transactions." },
        { title: "Journal", detail: "Journal entries view." }
      ]}
    />
  );
}
