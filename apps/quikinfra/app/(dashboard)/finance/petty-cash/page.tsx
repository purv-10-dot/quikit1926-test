"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader, PageContainer, StatusChip, TabBar } from "@/components/PageShell";
import { DataTable, type ColDef } from "@/components/DataTable";
import { QuickCreateDrawer } from "@/components/QuickCreateDrawer";

const STATUS_TABS = [
  { key: "all", label: "All" },
  { key: "Pending", label: "Pending" },
  { key: "Approved", label: "Approved" },
];

const PROJECT_OPTIONS: { value: string; label: string }[] = [];

const CATEGORY_OPTIONS = [
  { value: "Travel", label: "Travel" },
  { value: "Food", label: "Food" },
  { value: "Misc", label: "Misc" },
  { value: "Labour", label: "Labour" },
  { value: "Fuel", label: "Fuel" },
  { value: "Other", label: "Other" },
];

export default function PettyCashPage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("all");
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { data: result, isLoading } = useQuery({
    queryKey: ["finance-petty-cash"],
    queryFn: () => fetch(`/api/finance/petty-cash`).then(r => r.json()),
  });

  const allData = result?.data ?? [];
  const data = activeTab === "all" ? allData : allData.filter((r: any) => r.status === activeTab);

  const config = {
    title: "New Petty Cash Voucher",
    subtitle: "Record a petty cash / imprest expense",
    apiEndpoint: "/api/finance/petty-cash",
    onSuccess: () => qc.invalidateQueries({ queryKey: ["finance-petty-cash"] }),
    fields: [
      { key: "date", label: "Date", type: "date" as const, required: true },
      { key: "projectId", label: "Project", type: "select" as const, required: true, options: PROJECT_OPTIONS, placeholder: "Select project" },
      { key: "description", label: "Description", type: "textarea" as const, required: true, placeholder: "Expense description...", span: 2 as const },
      { key: "amount", label: "Amount", type: "number" as const, required: true, placeholder: "0" },
      { key: "category", label: "Category", type: "select" as const, required: true, options: CATEGORY_OPTIONS, placeholder: "Select category" },
      { key: "approvedBy", label: "Approved By", type: "text" as const, placeholder: "Approver name" },
      { key: "status", label: "Status", type: "select" as const, options: [{ value: "Pending", label: "Pending" }, { value: "Approved", label: "Approved" }], placeholder: "Select status" },
    ],
  };

  const columns: ColDef<any>[] = [
    { key: "voucherNo", label: "Voucher No", sortable: true, searchable: true },
    { key: "date", label: "Date", type: "date", sortable: true },
    { key: "projectName", label: "Project", sortable: true, searchable: true },
    { key: "description", label: "Description", searchable: true },
    {
      key: "amount", label: "Amount", type: "number", sortable: true,
      render: (row) => row.amount ? `₹ ${Number(row.amount).toLocaleString("en-IN")}` : "—",
    },
    {
      key: "category", label: "Category", type: "select",
      options: ["Travel", "Food", "Misc", "Labour", "Fuel", "Other"],
      sortable: true,
      render: (row) => (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">{row.category}</span>
      ),
    },
    { key: "approvedBy", label: "Approved By", render: (row) => row.approvedBy || "—" },
    {
      key: "status", label: "Status", type: "select",
      options: ["Pending", "Approved"],
      sortable: true,
      render: (row) => <StatusChip status={row.status ?? ""} />,
    },
  ];

  return (
    <>
      <PageHeader
        title="Petty Cash / Imprest"
        subtitle="Track small expenses and imprest accounts"
        breadcrumbs={[{ label: "Finance", href: "/finance" }, { label: "Petty Cash" }]}
      />
      <TabBar tabs={STATUS_TABS} activeTab={activeTab} onTabChange={setActiveTab} />
      <PageContainer>
        <DataTable
          id="finance-petty-cash"
          columns={columns}
          data={data}
          onAdd={() => setDrawerOpen(true)}
          addLabel="New Voucher"
          defaultSort="date"
          defaultSortDir="desc"
        />
      </PageContainer>
      <QuickCreateDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} config={config} />
    </>
  );
}
