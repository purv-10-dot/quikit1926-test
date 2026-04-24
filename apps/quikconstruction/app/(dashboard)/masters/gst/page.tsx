"use client";
import { MasterListPage, type ColumnConfig, type FieldConfig } from "@/components/masters/MasterListPage";
import { Percent } from "lucide-react";

interface Gst { id: string; code: string; description: string; rate: string; cgstRate: string; sgstRate: string; igstRate: string; status: string }
const columns: ColumnConfig<Gst>[] = [
  { key: "code", label: "Code", className: "font-mono text-xs text-gray-900" },
  { key: "description", label: "Description", className: "text-gray-900" },
  { key: "rate", label: "Total %", render: (r) => `${r.rate}%`, className: "text-right" },
  { key: "cgstRate", label: "CGST", render: (r) => `${r.cgstRate}%`, className: "text-right text-xs" },
  { key: "sgstRate", label: "SGST", render: (r) => `${r.sgstRate}%`, className: "text-right text-xs" },
  { key: "igstRate", label: "IGST", render: (r) => `${r.igstRate}%`, className: "text-right text-xs" },
  { key: "status", label: "Status", render: (r) => <span className={r.status === "active" ? "text-[10px] font-semibold uppercase bg-green-100 text-green-700 px-1.5 py-0.5 rounded" : "text-[10px] font-semibold uppercase bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded"}>{r.status}</span> },
];
const fields: FieldConfig[] = [
  { name: "code", label: "Code", type: "text", required: true, width: "half", transform: "uppercase", max: 20, placeholder: "GST-18" },
  { name: "description", label: "Description", type: "text", required: true, width: "half" },
  { name: "rate", label: "Total Rate %", type: "number", required: true, min: 0, max: 100, width: "third" },
  { name: "cgstRate", label: "CGST %", type: "number", required: true, min: 0, max: 100, width: "third" },
  { name: "sgstRate", label: "SGST %", type: "number", required: true, min: 0, max: 100, width: "third" },
  { name: "igstRate", label: "IGST %", type: "number", required: true, min: 0, max: 100, width: "half" },
  { name: "status", label: "Status", type: "select", width: "half", options: [{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }] },
];
export default function Page() {
  return <MasterListPage<Gst> title="GST Codes" subtitle="Tax rate slabs for PO / GRN / invoicing." icon={Percent} endpoint="/api/masters/gst" columns={columns} fields={fields} newRecordDefault={{ status: "active" }} getId={(r) => r.id} getLabel={(r) => r.code} />;
}
