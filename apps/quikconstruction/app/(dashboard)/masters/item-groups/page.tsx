"use client";
import { MasterListPage, type ColumnConfig, type FieldConfig } from "@/components/masters/MasterListPage";
import { Boxes } from "lucide-react";

interface ItemGroup { id: string; name: string; depth: number; sortOrder: number; status: string }

const columns: ColumnConfig<ItemGroup>[] = [
  { key: "name", label: "Name", render: (r) => <span style={{ paddingLeft: r.depth * 12 }} className="text-gray-900">{"—".repeat(r.depth)} {r.name}</span> },
  { key: "depth", label: "Depth", className: "text-xs text-gray-500" },
  { key: "sortOrder", label: "Order", className: "text-xs text-gray-500" },
  { key: "status", label: "Status", render: (r) => <span className={r.status === "active" ? "text-[10px] font-semibold uppercase bg-green-100 text-green-700 px-1.5 py-0.5 rounded" : "text-[10px] font-semibold uppercase bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded"}>{r.status}</span> },
];

const fields: FieldConfig[] = [
  { name: "name", label: "Name", type: "text", required: true, max: 100 },
  { name: "parentId", label: "Parent Group", type: "text", width: "half", hint: "Leave blank for top-level. (Picker coming next — paste parent ID for now.)" },
  { name: "sortOrder", label: "Sort Order", type: "number", integerOnly: true, min: 0, width: "half" },
  { name: "status", label: "Status", type: "select", width: "half", options: [{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }] },
];

export default function ItemGroupsPage() {
  return (
    <MasterListPage<ItemGroup>
      title="Item Groups"
      subtitle="Hierarchical categorisation for items. Max depth: 5."
      icon={Boxes}
      endpoint="/api/masters/item-groups"
      columns={columns}
      fields={fields}
      newRecordDefault={{ status: "active", sortOrder: 0, parentId: null }}
      getId={(r) => r.id}
      getLabel={(r) => r.name}
    />
  );
}
