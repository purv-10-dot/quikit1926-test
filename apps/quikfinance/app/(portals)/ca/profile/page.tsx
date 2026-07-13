"use client";

import { UserCircle } from "lucide-react";
import { PortalPlaceholder } from "@/components/portal/PortalPlaceholder";

export default function Page() {
  return (
    <PortalPlaceholder
      title={"Profile"}
      description={"Practice profile"}
      icon={UserCircle}
      features={[
        { title: "Firm", detail: "Practice details." },
        { title: "Team", detail: "Articles and staff access." }
      ]}
    />
  );
}
