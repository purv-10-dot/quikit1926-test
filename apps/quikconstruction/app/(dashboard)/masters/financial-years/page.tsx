"use client";

import { useEffect, useState } from "react";
import { MasterListPage, type ColumnConfig, type FieldConfig } from "@/components/masters/MasterListPage";
import { CalendarRange } from "lucide-react";

interface Fy {
  id: string;
  companyId: string;
  company: { id: string; name: string };
  label: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  status: string;
}

interface CompanyOpt { id: string; name: string }

export default function FinancialYearsPage() {
  const [companies, setCompanies] = useState<CompanyOpt[]>([]);
  useEffect(() => {
    fetch("/api/masters/companies").then(r => r.json()).then(j => j.success && setCompanies(j.data));
  }, []);

  const columns: ColumnConfig<Fy>[] = [
    { key: "label", label: "Label", render: (r) => <div className="font-medium text-gray-900">{r.label}</div> },
    { key: "company", label: "Company", render: (r) => r.company?.name ?? "—" },
    { key: "startDate", label: "Start", render: (r) => new Date(r.startDate).toISOString().slice(0, 10), className: "text-xs" },
    { key: "endDate", label: "End", render: (r) => new Date(r.endDate).toISOString().slice(0, 10), className: "text-xs" },
    { key: "isCurrent", label: "Current", render: (r) => r.isCurrent ? <span className="text-[10px] font-semibold uppercase bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">CURRENT</span> : "—" },
    { key: "status", label: "Status", render: (r) => <span className={r.status === "active" ? "text-[10px] font-semibold uppercase bg-green-100 text-green-700 px-1.5 py-0.5 rounded" : "text-[10px] font-semibold uppercase bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded"}>{r.status}</span> },
  ];

  const fields: FieldConfig[] = [
    { name: "companyId", label: "Company", type: "select", required: true, options: companies.map(c => ({ value: c.id, label: c.name })) },
    { name: "label", label: "Label", type: "text", required: true, width: "half", placeholder: "FY 2026-27", max: 50 },
    { name: "isCurrent", label: "Current FY", type: "checkbox", width: "half", placeholder: "Mark as current" },
    { name: "startDate", label: "Start Date (YYYY-MM-DD)", type: "text", required: true, width: "half", placeholder: "2026-04-01" },
    { name: "endDate", label: "End Date (YYYY-MM-DD)", type: "text", required: true, width: "half", placeholder: "2027-03-31" },
    { name: "status", label: "Status", type: "select", options: [{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }] },
  ];

  return (
    <MasterListPage<Fy>
      title="Financial Years"
      subtitle="Fiscal periods per company. Only one can be current at a time."
      icon={CalendarRange}
      endpoint="/api/masters/financial-years"
      columns={columns}
      fields={fields}
      newRecordDefault={{ status: "active", isCurrent: false }}
      getId={(r) => r.id}
      getLabel={(r) => `${r.label} (${r.company?.name ?? "?"})`}
    />
  );
}
