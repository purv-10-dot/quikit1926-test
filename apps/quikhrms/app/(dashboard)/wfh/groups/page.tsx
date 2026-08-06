"use client";

import { Users } from "lucide-react";
import { PageHeader } from "@/components/hrms/ui/page-header";
import { PageBackground } from "@/components/hrms/page-background";
import { WfhEmployeesInGroupTab } from "../_components/employees-in-group-tab";

export default function WfhGroupMembersPage() {
  return (
    <div className="w-full px-5 py-4">
      {/* Subtle HR-themed page background (scoped to this page only). */}
      <PageBackground src="/images/pre-onboarding-bg.png" />
      <PageHeader
        icon={<Users size={28} className="text-[#22c55e]" />}
        title="Employees in WFH groups"
        subtitle="See which WFH quota group each employee belongs to."
      />
      <WfhEmployeesInGroupTab />
    </div>
  );
}
