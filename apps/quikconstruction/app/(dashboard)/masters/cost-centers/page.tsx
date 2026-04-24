"use client";
import { MasterListPage, type ColumnConfig, type FieldConfig } from "@/components/masters/MasterListPage";
import { PieChart } from "lucide-react";

interface CC { id: string; code: string; name: string; projectId: string | null; status: string }
const columns: ColumnConfig<CC>[] = [
  { key: "code", label: "Code", className: "font-mono text-xs text-gray-900" },
  { key: "name", label: "Name", className: "text-gray-900" },
  { key: "status", label: "Status", render: (r) => <span className={r.status === "active" ? "text-[10px] font-semibold uppercase bg-green-100 text-green-700 px-1.5 py-0.5 rounded" : "text-[10px] font-semibold uppercase bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded"}>{r.status}</span> },
];
const fields: FieldConfig[] = [
  { name: "code", label: "Code", type: "text", required: true, width: "half", transform: "uppercase", max: 50 },
  { name: "name", label: "Name", type: "text", required: true, width: "half", max: 100 },
  { name: "projectId", label: "Project (optional)", type: "text", hint: "Leave blank for tenant-wide cost center." },
  { name: "status", label: "Status", type: "select", options: [{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }] },
];
export default function Page() {
  return <MasterListPage<CC> title="Cost Centers" subtitle="Accounting buckets for cost attribution." icon={PieChart} endpoint="/api/masters/cost-centers" columns={columns} fields={fields} newRecordDefault={{ status: "active" }} getId={(r) => r.id} getLabel={(r) => `${r.code} — ${r.name}`} />;
}
