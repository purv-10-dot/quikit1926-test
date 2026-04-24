"use client";

import { useEffect, useState } from "react";
import { MasterListPage, type ColumnConfig, type FieldConfig } from "@/components/masters/MasterListPage";
import { Hammer } from "lucide-react";

interface Project {
  id: string;
  code: string;
  name: string;
  companyId: string;
  company: { id: string; name: string };
  clientId: string | null;
  client: { id: string; name: string } | null;
  city: string | null;
  projectValue: string | null;
  startDate: string | null;
  expectedEndDate: string | null;
  status: string;
}

interface Opt { id: string; name: string }

export default function ProjectsPage() {
  const [companies, setCompanies] = useState<Opt[]>([]);
  const [customers, setCustomers] = useState<Opt[]>([]);
  useEffect(() => {
    fetch("/api/masters/companies").then(r => r.json()).then(j => j.success && setCompanies(j.data));
    fetch("/api/masters/customers").then(r => r.json()).then(j => j.success && setCustomers(j.data));
  }, []);

  const columns: ColumnConfig<Project>[] = [
    { key: "code", label: "Code", className: "font-mono text-xs text-gray-900" },
    { key: "name", label: "Name", render: (r) => <div><div className="font-medium text-gray-900">{r.name}</div>{r.city && <div className="text-xs text-gray-500">{r.city}</div>}</div> },
    { key: "company", label: "Company", render: (r) => r.company?.name ?? "—" },
    { key: "client", label: "Client", render: (r) => r.client?.name ?? "—" },
    { key: "projectValue", label: "Value", render: (r) => r.projectValue ? `₹${r.projectValue}` : "—", className: "text-right" },
    { key: "status", label: "Status", render: (r) => <span className={r.status === "active" ? "text-[10px] font-semibold uppercase bg-green-100 text-green-700 px-1.5 py-0.5 rounded" : r.status === "completed" ? "text-[10px] font-semibold uppercase bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded" : r.status === "on-hold" ? "text-[10px] font-semibold uppercase bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded" : "text-[10px] font-semibold uppercase bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded"}>{r.status}</span> },
  ];

  const fields: FieldConfig[] = [
    { name: "code", label: "Code", type: "text", required: true, width: "half", transform: "uppercase", max: 50 },
    { name: "name", label: "Name", type: "text", required: true, width: "half", max: 200 },
    { name: "description", label: "Description", type: "textarea" },
    { name: "companyId", label: "Company", type: "select", required: true, width: "half", options: companies.map(c => ({ value: c.id, label: c.name })) },
    { name: "clientId", label: "Client", type: "select", width: "half", options: customers.map(c => ({ value: c.id, label: c.name })) },
    { name: "address", label: "Address", type: "textarea" },
    { name: "city", label: "City", type: "text", width: "half" },
    { name: "state", label: "State", type: "text", width: "half" },
    { name: "startDate", label: "Start (YYYY-MM-DD)", type: "text", width: "third" },
    { name: "expectedEndDate", label: "Expected End", type: "text", width: "third" },
    { name: "actualEndDate", label: "Actual End", type: "text", width: "third" },
    { name: "projectValue", label: "Project Value (₹)", type: "number", min: 0, width: "half" },
    { name: "status", label: "Status", type: "select", width: "half", options: [
      { value: "active", label: "Active" },
      { value: "on-hold", label: "On Hold" },
      { value: "completed", label: "Completed" },
      { value: "inactive", label: "Inactive" },
    ]},
  ];

  return (
    <MasterListPage<Project>
      title="Projects"
      subtitle="Construction projects. Tied to a Company, optionally a Client."
      icon={Hammer}
      endpoint="/api/masters/projects"
      columns={columns}
      fields={fields}
      newRecordDefault={{ status: "active" }}
      getId={(r) => r.id}
      getLabel={(r) => r.name}
    />
  );
}
