"use client";
import { MasterListPage, type ColumnConfig, type FieldConfig } from "@/components/masters/MasterListPage";
import { MapPin } from "lucide-react";

interface Loc { id: string; code: string; name: string; type: string; city: string | null; inCharge: string | null; status: string }

const columns: ColumnConfig<Loc>[] = [
  { key: "code", label: "Code", className: "font-mono text-xs text-gray-900" },
  { key: "name", label: "Name", className: "text-gray-900 font-medium" },
  { key: "type", label: "Type", render: (r) => <span className="text-[10px] font-semibold uppercase bg-accent-100 text-accent-700 px-1.5 py-0.5 rounded">{r.type.replace("_", " ")}</span> },
  { key: "city", label: "City", render: (r) => r.city ?? "—" },
  { key: "inCharge", label: "In-Charge", render: (r) => r.inCharge ?? "—" },
  { key: "status", label: "Status", render: (r) => <span className={r.status === "active" ? "text-[10px] font-semibold uppercase bg-green-100 text-green-700 px-1.5 py-0.5 rounded" : "text-[10px] font-semibold uppercase bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded"}>{r.status}</span> },
];
const fields: FieldConfig[] = [
  { name: "code", label: "Code", type: "text", required: true, width: "half", transform: "uppercase", max: 50 },
  { name: "name", label: "Name", type: "text", required: true, width: "half", max: 100 },
  { name: "type", label: "Type", type: "select", required: true, width: "half", options: [
    { value: "site", label: "Site" },
    { value: "warehouse", label: "Warehouse" },
    { value: "head_office", label: "Head Office" },
    { value: "yard", label: "Yard" },
  ]},
  { name: "inCharge", label: "In-Charge", type: "text", width: "half" },
  { name: "address", label: "Address", type: "textarea" },
  { name: "city", label: "City", type: "text", width: "third" },
  { name: "state", label: "State", type: "text", width: "third" },
  { name: "status", label: "Status", type: "select", width: "third", options: [{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }] },
];
export default function Page() {
  return <MasterListPage<Loc> title="Locations" subtitle="Sites, warehouses, offices, yards." icon={MapPin} endpoint="/api/masters/locations" columns={columns} fields={fields} newRecordDefault={{ status: "active", type: "site" }} getId={(r) => r.id} getLabel={(r) => `${r.code} — ${r.name}`} />;
}
