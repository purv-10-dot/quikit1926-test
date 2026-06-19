"use client";

import { useState } from "react";
import { Eye } from "lucide-react";
import { PageHeader, PageContainer, StatusChip, TabBar } from "@/components/PageShell";
import { DataTable, type ColDef } from "@/components/DataTable";
import { useRABs } from "@/hooks/use-projects";
import { QuickCreateDrawer } from "@/components/QuickCreateDrawer";
import { useProjects, useContractors } from "@/hooks/use-masters";
import { useQueryClient } from "@tanstack/react-query";

const TABS = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "submitted", label: "Submitted" },
  { key: "approved", label: "Approved" },
  { key: "paid", label: "Paid" },
];

interface RabRow {
  id?: string; status?: string; billPeriodFrom?: string; billPeriodTo?: string;
  cumulativeAmount?: number | string; currentBillAmount?: number | string;
  netPayable?: number | string;
  [key: string]: unknown;
}

export default function RABPage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("all");
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { data: result, isLoading } = useRABs({ status: activeTab });
  const data = result?.data ?? [];

  const { data: projectsData } = useProjects();
  const { data: contractorsData } = useContractors();

  const projectOptions = (projectsData?.data ?? []).map((p) => ({ value: p.id, label: p.name }));
  const contractorOptions = (contractorsData?.data ?? []).map((c) => ({ value: c.id, label: c.name }));

  const config = {
    title: "Generate RAB",
    subtitle: "Running Account Bill based on approved DPR quantities",
    apiEndpoint: "/api/projects/rab",
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rabs"] }),
    fields: [
      { key: "projectId", label: "Project", type: "select" as const, required: true, options: projectOptions, placeholder: "Select project" },
      { key: "contractorId", label: "Contractor", type: "select" as const, required: true, options: contractorOptions, placeholder: "Select contractor" },
      { key: "woRef", label: "WO Reference", type: "text" as const, placeholder: "Work order number" },
      {
        key: "billPeriodFrom",
        label: "Bill Period From",
        type: "date" as const,
        required: true,
        onChange: (v: string, formData: Record<string, string>) => {
          if (formData.billPeriodTo && v && formData.billPeriodTo < v) {
            return { billPeriodTo: "" };
          }
        },
      },
      {
        key: "billPeriodTo",
        label: "Bill Period To",
        type: "date" as const,
        required: true,
        min: (f: Record<string, string>) => f.billPeriodFrom || undefined,
      },
      { key: "currentBillAmount", label: "Current Bill Amount", type: "number" as const, placeholder: "Amount" },
    ],
  };

  const columns: ColDef<RabRow>[] = [
    { key: "rabNumber", label: "RAB No", sortable: true, searchable: true },
    { key: "projectName", label: "Project", sortable: true, searchable: true },
    { key: "contractorName", label: "Contractor", sortable: true, searchable: true },
    {
      key: "billPeriod", label: "Period",
      render: (row) => `${row.billPeriodFrom} — ${row.billPeriodTo}`,
    },
    {
      key: "currentBillAmount", label: "Current Bill", type: "number", sortable: true,
      render: (row) => row.currentBillAmount ? `₹ ${Number(row.currentBillAmount).toLocaleString("en-IN")}` : "—",
    },
    {
      key: "cumulativeAmount", label: "Cumulative", type: "number",
      render: (row) => row.cumulativeAmount ? `₹ ${Number(row.cumulativeAmount).toLocaleString("en-IN")}` : "—",
    },
    {
      key: "netPayable", label: "Net Payable", type: "number", sortable: true,
      render: (row) => row.netPayable ? `₹ ${Number(row.netPayable).toLocaleString("en-IN")}` : "—",
    },
    {
      key: "status", label: "Status", type: "select",
      options: ["draft", "submitted", "approved", "paid"],
      sortable: true,
      render: (row) => <StatusChip status={row.status ?? ""} />,
    },
  ];

  return (
    <>
      <PageHeader
        title="Running Account Bill (RAB)"
        subtitle="Contractor billing based on approved DPR quantities"
        breadcrumbs={[{ label: "Projects", href: "/projects" }, { label: "RAB" }]}
      />
      <TabBar tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />
      <PageContainer>
        <DataTable
          id="projects-rab"
          columns={columns}
          data={data as unknown as RabRow[]}
          onAdd={() => setDrawerOpen(true)}
          addLabel="Generate RAB"
        />
      </PageContainer>
      <QuickCreateDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} config={config} />
    </>
  );
}
