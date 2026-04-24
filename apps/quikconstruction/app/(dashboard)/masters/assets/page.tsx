"use client";
import { MasterListPage, type ColumnConfig, type FieldConfig } from "@/components/masters/MasterListPage";
import { Archive } from "lucide-react";

interface Asset { id: string; code: string; name: string; category: string | null; purchaseValue: string | null; assignedTo: string | null; status: string }
const columns: ColumnConfig<Asset>[] = [
  { key: "code", label: "Code", className: "font-mono text-xs text-gray-900" },
  { key: "name", label: "Name", className: "text-gray-900 font-medium" },
  { key: "category", label: "Category", render: (r) => r.category ?? "—" },
  { key: "purchaseValue", label: "Purchase Value", render: (r) => r.purchaseValue ? `₹${r.purchaseValue}` : "—", className: "text-right" },
  { key: "assignedTo", label: "Assigned", render: (r) => r.assignedTo ?? "—" },
  { key: "status", label: "Status", render: (r) => <span className={r.status === "active" ? "text-[10px] font-semibold uppercase bg-green-100 text-green-700 px-1.5 py-0.5 rounded" : r.status === "disposed" ? "text-[10px] font-semibold uppercase bg-red-100 text-red-700 px-1.5 py-0.5 rounded" : "text-[10px] font-semibold uppercase bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded"}>{r.status}</span> },
];
const fields: FieldConfig[] = [
  { name: "code", label: "Code", type: "text", required: true, width: "half", transform: "uppercase", max: 50 },
  { name: "name", label: "Name", type: "text", required: true, width: "half", max: 200 },
  { name: "category", label: "Category", type: "text", width: "half", placeholder: "laptop, tools, etc." },
  { name: "purchaseDate", label: "Purchase Date", type: "text", width: "half", placeholder: "YYYY-MM-DD" },
  { name: "purchaseValue", label: "Purchase Value (₹)", type: "number", min: 0, width: "half" },
  { name: "assignedTo", label: "Assigned To", type: "text", width: "half" },
  { name: "status", label: "Status", type: "select", options: [
    { value: "active", label: "Active" },
    { value: "inactive", label: "Inactive" },
    { value: "disposed", label: "Disposed" },
  ]},
];
export default function Page() {
  return <MasterListPage<Asset> title="Assets" subtitle="Non-inventory fixed assets (laptops, office equipment)." icon={Archive} endpoint="/api/masters/assets" columns={columns} fields={fields} newRecordDefault={{ status: "active" }} getId={(r) => r.id} getLabel={(r) => `${r.code} — ${r.name}`} />;
}
