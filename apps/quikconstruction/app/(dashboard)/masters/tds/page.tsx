"use client";
import { MasterListPage, type ColumnConfig, type FieldConfig } from "@/components/masters/MasterListPage";
import { Receipt } from "lucide-react";

interface Tds { id: string; section: string; description: string; rate: string; thresholdAmount: string | null; status: string }
const columns: ColumnConfig<Tds>[] = [
  { key: "section", label: "Section", className: "font-mono text-xs text-gray-900" },
  { key: "description", label: "Description", className: "text-gray-900" },
  { key: "rate", label: "Rate %", render: (r) => `${r.rate}%`, className: "text-right" },
  { key: "thresholdAmount", label: "Threshold", render: (r) => r.thresholdAmount ? `₹${r.thresholdAmount}` : "—", className: "text-right text-xs" },
  { key: "status", label: "Status", render: (r) => <span className={r.status === "active" ? "text-[10px] font-semibold uppercase bg-green-100 text-green-700 px-1.5 py-0.5 rounded" : "text-[10px] font-semibold uppercase bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded"}>{r.status}</span> },
];
const fields: FieldConfig[] = [
  { name: "section", label: "Section", type: "text", required: true, width: "half", transform: "uppercase", max: 20, placeholder: "194C" },
  { name: "description", label: "Description", type: "text", required: true, width: "half" },
  { name: "rate", label: "Rate %", type: "number", required: true, min: 0, max: 100, width: "half" },
  { name: "thresholdAmount", label: "Threshold Amount (₹)", type: "number", min: 0, width: "half" },
  { name: "status", label: "Status", type: "select", options: [{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }] },
];
export default function Page() {
  return <MasterListPage<Tds> title="TDS Codes" subtitle="Income tax deduction sections per vendor payment type." icon={Receipt} endpoint="/api/masters/tds" columns={columns} fields={fields} newRecordDefault={{ status: "active" }} getId={(r) => r.id} getLabel={(r) => r.section} />;
}
