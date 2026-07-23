"use client";

import { Users } from "lucide-react";
import { PageHeader } from "@/components/hrms/ui/page-header";
import { WfhEmployeesInGroupTab } from "../_components/employees-in-group-tab";

export default function WfhGroupMembersPage() {
  return (
    <div className="w-full px-5 py-4">
      <PageHeader
        icon={<Users size={28} className="text-[#22c55e]" />}
        title="Employees in WFH groups"
        subtitle="See which WFH quota group each employee belongs to."
      />
      <WfhEmployeesInGroupTab />
    </div>
  );
}
