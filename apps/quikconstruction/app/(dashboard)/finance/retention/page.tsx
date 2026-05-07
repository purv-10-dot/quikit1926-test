"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader, PageContainer, StatusChip, TabBar } from "@/components/PageShell";
import { DataTable, type ColDef } from "@/components/DataTable";
import { QuickCreateDrawer } from "@/components/QuickCreateDrawer";

const STATUS_TABS = [
  { key: "all", label: "All" },
  { key: "Held", label: "Held" },
  { key: "Partially Released", label: "Partially Released" },
  { key: "Released", label: "Released" },
];

export default function RetentionPage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("all");
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { data: result, isLoading } = useQuery({
    queryKey: ["finance-retention"],
    queryFn: () => fetch(`/api/finance/retention`).then(r => r.json()),
  });

  const allData = result?.data ?? [];
  const data = activeTab === "all" ? allData : allData.filter((r: any) => r.status === activeTab);

  const config = {
    title: "New Retention Entry",
    subtitle: "Track retention money and security deposits",
    apiEndpoint: "/api/finance/retention",
    onSuccess: () => qc.invalidateQueries({ queryKey: ["finance-retention"] }),
    fields: [
      { key: "contractor", label: "Contractor", type: "text" as const, required: true, placeholder: "Contractor name" },
      { key: "woRef", label: "Work Order Ref", type: "text" as const, required: true, placeholder: "WO-2026-XXX" },
      { key: "totalWOValue", label: "Total WO Value", type: "number" as const, required: true, placeholder: "0" },
      { key: "retentionPercent", label: "Retention %", type: "number" as const, required: true, placeholder: "5" },
      { key: "retentionAmount", label: "Retention Amount", type: "number" as const, placeholder: "Auto-calculated" },
      { key: "sdAmount", label: "SD Amount", type: "number" as const, placeholder: "0" },
      { key: "releaseDate", label: "Expected Release Date", type: "date" as const },
      { key: "status", label: "Status", type: "select" as const, required: true, options: [{ value: "Held", label: "Held" }, { value: "Partially Released", label: "Partially Released" }, { value: "Released", label: "Released" }], placeholder: "Select status" },
    ],
  };

  const columns: ColDef<any>[] = [
    { key: "contractor", label: "Contractor", sortable: true, searchable: true },
    { key: "woRef", label: "WO Ref", sortable: true, searchable: true },
    {
      key: "totalWOValue", label: "Total WO Value", type: "number", sortable: true,
      render: (row) => row.totalWOValue ? `₹ ${Number(row.totalWOValue).toLocaleString("en-IN")}` : "—",
    },
    {
      key: "retentionPercent", label: "Ret %", type: "number",
      render: (row) => `${row.retentionPercent}%`,
    },
    {
      key: "retentionAmount", label: "Retention Amt", type: "number", sortable: true,
      render: (row) => row.retentionAmount ? `₹ ${Number(row.retentionAmount).toLocaleString("en-IN")}` : "—",
    },
    {
      key: "sdAmount", label: "SD Amount", type: "number",
      render: (row) => row.sdAmount ? `₹ ${Number(row.sdAmount).toLocaleString("en-IN")}` : "—",
    },
    { key: "releaseDate", label: "Release Date", type: "date", sortable: true },
    {
      key: "status", label: "Status", type: "select",
      options: ["Held", "Partially Released", "Released"],
      sortable: true,
      render: (row) => <StatusChip status={row.status ?? ""} />,
    },
  ];

  return (
    <>
      <PageHeader
        title="Retention & Security Deposits"
        subtitle="Track retention money and SD held against contractors"
        breadcrumbs={[{ label: "Finance", href: "/finance" }, { label: "Retention & SD" }]}
      />
      <TabBar tabs={STATUS_TABS} activeTab={activeTab} onTabChange={setActiveTab} />
      <PageContainer>
        <DataTable
          id="finance-retention"
          columns={columns}
          data={data}
          onAdd={() => setDrawerOpen(true)}
          addLabel="New Entry"
          defaultSort="retentionAmount"
          defaultSortDir="desc"
        />
      </PageContainer>
      <QuickCreateDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} config={config} />
    </>
  );
}
