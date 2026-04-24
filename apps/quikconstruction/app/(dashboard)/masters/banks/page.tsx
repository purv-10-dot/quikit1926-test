"use client";

import { useEffect, useState } from "react";
import { MasterListPage, type ColumnConfig, type FieldConfig } from "@/components/masters/MasterListPage";
import { Landmark } from "lucide-react";

interface Bank {
  id: string;
  companyId: string;
  company: { id: string; name: string };
  bankName: string;
  branchName: string | null;
  accountNo: string;
  ifscCode: string;
  accountType: string;
  status: string;
}

interface CompanyOpt { id: string; name: string }

export default function BanksPage() {
  const [companies, setCompanies] = useState<CompanyOpt[]>([]);
  useEffect(() => {
    fetch("/api/masters/companies").then(r => r.json()).then(j => j.success && setCompanies(j.data));
  }, []);

  const columns: ColumnConfig<Bank>[] = [
    { key: "bankName", label: "Bank", render: (r) => <div><div className="font-medium text-gray-900">{r.bankName}</div>{r.branchName && <div className="text-xs text-gray-500">{r.branchName}</div>}</div> },
    { key: "accountNo", label: "Account No", className: "font-mono text-xs" },
    { key: "ifscCode", label: "IFSC", className: "font-mono text-xs" },
    { key: "accountType", label: "Type", render: (r) => <span className="text-[10px] font-semibold uppercase bg-accent-100 text-accent-700 px-1.5 py-0.5 rounded">{r.accountType}</span> },
    { key: "company", label: "Company", render: (r) => r.company?.name ?? "—" },
    { key: "status", label: "Status", render: (r) => <span className={r.status === "active" ? "text-[10px] font-semibold uppercase bg-green-100 text-green-700 px-1.5 py-0.5 rounded" : "text-[10px] font-semibold uppercase bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded"}>{r.status}</span> },
  ];

  const fields: FieldConfig[] = [
    { name: "companyId", label: "Company", type: "select", required: true, options: companies.map(c => ({ value: c.id, label: c.name })) },
    { name: "bankName", label: "Bank Name", type: "text", required: true, width: "half" },
    { name: "branchName", label: "Branch Name", type: "text", width: "half" },
    { name: "accountNo", label: "Account No", type: "text", required: true, width: "half" },
    { name: "ifscCode", label: "IFSC", type: "text", required: true, width: "half", transform: "uppercase", max: 11 },
    { name: "accountType", label: "Account Type", type: "select", required: true, width: "half", options: [
      { value: "current", label: "Current" },
      { value: "savings", label: "Savings" },
    ]},
    { name: "status", label: "Status", type: "select", width: "half", options: [{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }] },
  ];

  return (
    <MasterListPage<Bank>
      title="Banks"
      subtitle="Bank accounts per company. Used for vendor payments + receipts."
      icon={Landmark}
      endpoint="/api/masters/banks"
      columns={columns}
      fields={fields}
      newRecordDefault={{ status: "active", accountType: "current" }}
      getId={(r) => r.id}
      getLabel={(r) => `${r.bankName} · ${r.accountNo}`}
    />
  );
}
