"use client";
import { MasterListPage, type ColumnConfig, type FieldConfig } from "@/components/masters/MasterListPage";
import { Layers } from "lucide-react";

interface WC { id: string; name: string; description: string | null; status: string }
const columns: ColumnConfig<WC>[] = [
  { key: "name", label: "Name", className: "text-gray-900 font-medium" },
  { key: "description", label: "Description", render: (r) => r.description ?? "—" },
  { key: "status", label: "Status", render: (r) => <span className={r.status === "active" ? "text-[10px] font-semibold uppercase bg-green-100 text-green-700 px-1.5 py-0.5 rounded" : "text-[10px] font-semibold uppercase bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded"}>{r.status}</span> },
];
const fields: FieldConfig[] = [
  { name: "name", label: "Name", type: "text", required: true, max: 100 },
  { name: "description", label: "Description", type: "textarea" },
  { name: "status", label: "Status", type: "select", options: [{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }] },
];
export default function Page() {
  return <MasterListPage<WC> title="Work Categories" subtitle="Types of construction work (civil, electrical, plumbing, etc.)" icon={Layers} endpoint="/api/masters/work-categories" columns={columns} fields={fields} newRecordDefault={{ status: "active" }} getId={(r) => r.id} getLabel={(r) => r.name} />;
}
