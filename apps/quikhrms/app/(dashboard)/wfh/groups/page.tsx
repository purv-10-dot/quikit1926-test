"use client";

import { Users } from "lucide-react";
import { WfhTabs } from "../_components/wfh-tabs";
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
      <div className="mb-5"><WfhTabs /></div>
      <WfhEmployeesInGroupTab />
    </div>
  );
}
