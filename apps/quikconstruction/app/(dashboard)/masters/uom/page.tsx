"use client";
import { MasterListPage, type ColumnConfig, type FieldConfig } from "@/components/masters/MasterListPage";
import { Ruler } from "lucide-react";

interface Uom { id: string; code: string; name: string; status: string }

const columns: ColumnConfig<Uom>[] = [
  { key: "code", label: "Code", className: "font-mono text-xs font-semibold text-gray-900" },
  { key: "name", label: "Name", className: "text-gray-900" },
  { key: "status", label: "Status", render: (r) => <span className={r.status === "active" ? "text-[10px] font-semibold uppercase bg-green-100 text-green-700 px-1.5 py-0.5 rounded" : "text-[10px] font-semibold uppercase bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded"}>{r.status}</span> },
];

const fields: FieldConfig[] = [
  { name: "code", label: "Code", type: "text", required: true, width: "half", transform: "uppercase", max: 20, placeholder: "e.g. KG, MT, CUM" },
  { name: "name", label: "Name", type: "text", required: true, width: "half", max: 100 },
  { name: "status", label: "Status", type: "select", width: "half", options: [{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }] },
];

export default function UomPage() {
  return (
    <MasterListPage<Uom>
      title="UOM"
      subtitle="Units of measurement (Kg, Meter, Bag, Cum, etc.)"
      icon={Ruler}
      endpoint="/api/masters/uom"
      columns={columns}
      fields={fields}
      newRecordDefault={{ status: "active" }}
      getId={(r) => r.id}
      getLabel={(r) => `${r.code} — ${r.name}`}
    />
  );
}
