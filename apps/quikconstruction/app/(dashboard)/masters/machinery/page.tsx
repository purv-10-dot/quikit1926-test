"use client";
import { MasterListPage, type ColumnConfig, type FieldConfig } from "@/components/masters/MasterListPage";
import { Truck } from "lucide-react";

interface Mach { id: string; code: string; name: string; type: string; make: string | null; registrationNo: string | null; status: string }
const columns: ColumnConfig<Mach>[] = [
  { key: "code", label: "Code", className: "font-mono text-xs text-gray-900" },
  { key: "name", label: "Name", render: (r) => <div><div className="font-medium text-gray-900">{r.name}</div>{r.make && <div className="text-xs text-gray-500">{r.make}</div>}</div> },
  { key: "type", label: "Type" },
  { key: "registrationNo", label: "Reg. No", render: (r) => r.registrationNo ?? "—", className: "font-mono text-xs" },
  { key: "status", label: "Status", render: (r) => <span className={r.status === "active" ? "text-[10px] font-semibold uppercase bg-green-100 text-green-700 px-1.5 py-0.5 rounded" : r.status === "under-maintenance" ? "text-[10px] font-semibold uppercase bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded" : "text-[10px] font-semibold uppercase bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded"}>{r.status}</span> },
];
const fields: FieldConfig[] = [
  { name: "code", label: "Code", type: "text", required: true, width: "half", transform: "uppercase", max: 50 },
  { name: "name", label: "Name", type: "text", required: true, width: "half", max: 200 },
  { name: "type", label: "Type", type: "text", required: true, width: "third", placeholder: "excavator, crane, mixer" },
  { name: "make", label: "Make", type: "text", width: "third" },
  { name: "model", label: "Model", type: "text", width: "third" },
  { name: "registrationNo", label: "Registration No", type: "text", width: "half" },
  { name: "fuelType", label: "Fuel", type: "text", width: "half" },
  { name: "capacity", label: "Capacity", type: "text", width: "half" },
  { name: "status", label: "Status", type: "select", width: "half", options: [
    { value: "active", label: "Active" },
    { value: "under-maintenance", label: "Under Maintenance" },
    { value: "inactive", label: "Inactive" },
  ]},
];
export default function Page() {
  return <MasterListPage<Mach> title="Machinery" subtitle="Heavy equipment owned or rented by the tenant." icon={Truck} endpoint="/api/masters/machinery" columns={columns} fields={fields} newRecordDefault={{ status: "active" }} getId={(r) => r.id} getLabel={(r) => `${r.code} — ${r.name}`} />;
}
