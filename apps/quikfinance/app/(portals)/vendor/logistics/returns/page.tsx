"use client";

import { Boxes } from "lucide-react";
import { PortalPlaceholder } from "@/components/portal/PortalPlaceholder";

export default function Page() {
  return (
    <PortalPlaceholder
      title={"Returns"}
      description={"Manage returns"}
      icon={Boxes}
      features={[
        { title: "Returns", detail: "Goods return requests and status." }
      ]}
    />
  );
}
