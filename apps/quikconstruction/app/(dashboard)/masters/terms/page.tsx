"use client";
import { MasterListPage, type ColumnConfig, type FieldConfig } from "@/components/masters/MasterListPage";
import { FileText } from "lucide-react";

interface Terms { id: string; title: string; applicableTo: string; isDefault: boolean; status: string }
const columns: ColumnConfig<Terms>[] = [
  { key: "title", label: "Title", className: "text-gray-900 font-medium" },
  { key: "applicableTo", label: "Applies To", render: (r) => <span className="text-[10px] font-semibold uppercase bg-accent-100 text-accent-700 px-1.5 py-0.5 rounded">{r.applicableTo}</span> },
  { key: "isDefault", label: "Default", render: (r) => r.isDefault ? <span className="text-[10px] font-semibold uppercase bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">YES</span> : "—" },
  { key: "status", label: "Status", render: (r) => <span className={r.status === "active" ? "text-[10px] font-semibold uppercase bg-green-100 text-green-700 px-1.5 py-0.5 rounded" : "text-[10px] font-semibold uppercase bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded"}>{r.status}</span> },
];
const fields: FieldConfig[] = [
  { name: "title", label: "Title", type: "text", required: true, max: 200 },
  { name: "applicableTo", label: "Applies To", type: "select", required: true, width: "half", options: [
    { value: "po", label: "Purchase Order" },
    { value: "wo", label: "Work Order" },
    { value: "rfq", label: "RFQ" },
    { value: "general", label: "General" },
  ]},
  { name: "isDefault", label: "Set as default", type: "checkbox", width: "half", placeholder: "Default for this applicable-to type" },
  { name: "body", label: "Body", type: "textarea", required: true },
  { name: "status", label: "Status", type: "select", options: [{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }] },
];
export default function Page() {
  return <MasterListPage<Terms> title="Terms & Conditions" subtitle="Reusable clauses for POs, WOs, RFQs." icon={FileText} endpoint="/api/masters/terms" columns={columns} fields={fields} newRecordDefault={{ status: "active", applicableTo: "general", isDefault: false }} getId={(r) => r.id} getLabel={(r) => r.title} />;
}
