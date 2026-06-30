"use client";

import { Truck } from "lucide-react";
import { PortalPlaceholder } from "@/components/portal/PortalPlaceholder";

export default function Page() {
  return (
    <PortalPlaceholder
      title={"Shipment Tracking"}
      description={"ASN and delivery notes"}
      icon={Truck}
      features={[
        { title: "ASN", detail: "Advance shipping notices." },
        { title: "Delivery Notes", detail: "Proof of delivery documents." }
      ]}
    />
  );
}
