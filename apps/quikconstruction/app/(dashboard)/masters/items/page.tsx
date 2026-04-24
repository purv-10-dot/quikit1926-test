"use client";

import { useEffect, useState } from "react";
import { MasterListPage, type ColumnConfig, type FieldConfig } from "@/components/masters/MasterListPage";
import { Package } from "lucide-react";

interface Item {
  id: string;
  code: string;
  name: string;
  hsnCode: string | null;
  standardRate: string | null; // Prisma Decimal serialised as string
  group: { id: string; name: string };
  uom: { id: string; code: string };
  status: string;
}

interface Opt { id: string; name: string; code?: string }

export default function ItemsPage() {
  // Load groups + UOMs to populate the form selects.
  const [groups, setGroups] = useState<Opt[]>([]);
  const [uoms, setUoms] = useState<Opt[]>([]);
  useEffect(() => {
    fetch("/api/masters/item-groups").then(r => r.json()).then(j => j.success && setGroups(j.data));
    fetch("/api/masters/uom").then(r => r.json()).then(j => j.success && setUoms(j.data));
  }, []);

  const columns: ColumnConfig<Item>[] = [
    { key: "code", label: "Code", className: "font-mono text-xs text-gray-900" },
    { key: "name", label: "Name", render: (r) => <div><div className="font-medium text-gray-900">{r.name}</div>{r.hsnCode && <div className="text-xs text-gray-500">HSN {r.hsnCode}</div>}</div> },
    { key: "group", label: "Group", render: (r) => r.group?.name ?? "—" },
    { key: "uom", label: "UOM", render: (r) => r.uom?.code ?? "—" },
    { key: "standardRate", label: "Rate", render: (r) => r.standardRate ?? "—", className: "text-right" },
    { key: "status", label: "Status", render: (r) => <span className={r.status === "active" ? "text-[10px] font-semibold uppercase bg-green-100 text-green-700 px-1.5 py-0.5 rounded" : "text-[10px] font-semibold uppercase bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded"}>{r.status}</span> },
  ];

  const fields: FieldConfig[] = [
    { name: "code", label: "Code", type: "text", required: true, width: "half", transform: "uppercase", max: 50 },
    { name: "name", label: "Name", type: "text", required: true, width: "half", max: 200 },
    { name: "description", label: "Description", type: "textarea" },
    { name: "groupId", label: "Item Group", type: "select", required: true, width: "half", options: groups.map(g => ({ value: g.id, label: g.name })) },
    { name: "uomId", label: "UOM", type: "select", required: true, width: "half", options: uoms.map(u => ({ value: u.id, label: `${u.code} — ${u.name}` })) },
    { name: "hsnCode", label: "HSN Code", type: "text", width: "third" },
    { name: "gstRate", label: "GST %", type: "number", min: 0, max: 100, width: "third" },
    { name: "standardRate", label: "Standard Rate", type: "number", min: 0, width: "third" },
    { name: "minStockLevel", label: "Min Stock", type: "number", min: 0, width: "half" },
    { name: "reorderLevel", label: "Reorder Level", type: "number", min: 0, width: "half" },
    { name: "status", label: "Status", type: "select", options: [{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }] },
  ];

  return (
    <MasterListPage<Item>
      title="Items"
      subtitle="Materials, consumables, services. Link to UOM + Item Group."
      icon={Package}
      endpoint="/api/masters/items"
      columns={columns}
      fields={fields}
      newRecordDefault={{ status: "active" }}
      getId={(r) => r.id}
      getLabel={(r) => `${r.code} — ${r.name}`}
    />
  );
}
