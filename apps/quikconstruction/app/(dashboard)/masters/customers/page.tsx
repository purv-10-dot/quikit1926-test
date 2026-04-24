"use client";
import { MasterListPage, type ColumnConfig, type FieldConfig } from "@/components/masters/MasterListPage";
import { Briefcase } from "lucide-react";

interface Customer {
  id: string;
  code: string;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  gstin: string | null;
  status: string;
}

const columns: ColumnConfig<Customer>[] = [
  { key: "code", label: "Code", className: "font-mono text-xs text-gray-900" },
  { key: "name", label: "Name", render: (r) => <div><div className="font-medium text-gray-900">{r.name}</div>{r.contactPerson && <div className="text-xs text-gray-500">{r.contactPerson}</div>}</div> },
  { key: "gstin", label: "GSTIN", render: (r) => r.gstin ?? "—", className: "font-mono text-xs" },
  { key: "city", label: "City", render: (r) => r.city ?? "—" },
  { key: "status", label: "Status", render: (r) => <span className={r.status === "active" ? "text-[10px] font-semibold uppercase bg-green-100 text-green-700 px-1.5 py-0.5 rounded" : "text-[10px] font-semibold uppercase bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded"}>{r.status}</span> },
];

const fields: FieldConfig[] = [
  { name: "code", label: "Code", type: "text", required: true, width: "half", transform: "uppercase", max: 50 },
  { name: "name", label: "Name", type: "text", required: true, width: "half", max: 200 },
  { name: "contactPerson", label: "Contact Person", type: "text", width: "half" },
  { name: "gstin", label: "GSTIN", type: "text", width: "half", transform: "uppercase", max: 15 },
  { name: "phone", label: "Phone", type: "text", width: "half" },
  { name: "email", label: "Email", type: "text", width: "half" },
  { name: "address", label: "Address", type: "textarea" },
  { name: "city", label: "City", type: "text", width: "third" },
  { name: "state", label: "State", type: "text", width: "third" },
  { name: "status", label: "Status", type: "select", width: "third", options: [{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }] },
];

export default function CustomersPage() {
  return (
    <MasterListPage<Customer>
      title="Customers"
      subtitle="Clients you bill for projects. Codes are unique per tenant."
      icon={Briefcase}
      endpoint="/api/masters/customers"
      columns={columns}
      fields={fields}
      newRecordDefault={{ status: "active" }}
      getId={(r) => r.id}
      getLabel={(r) => r.name}
    />
  );
}
