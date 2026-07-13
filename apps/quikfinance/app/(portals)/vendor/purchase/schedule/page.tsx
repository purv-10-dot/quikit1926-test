"use client";

import { CalendarClock } from "lucide-react";
import { PortalPlaceholder } from "@/components/portal/PortalPlaceholder";

export default function Page() {
  return (
    <PortalPlaceholder
      title={"Delivery Schedule"}
      description={"Planned delivery dates"}
      icon={CalendarClock}
      features={[
        { title: "Schedule", detail: "Committed delivery dates per PO line." },
        { title: "Reminders", detail: "Upcoming delivery reminders." }
      ]}
    />
  );
}
