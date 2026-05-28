"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader, PageContainer, StatusChip, TabBar } from "@/components/PageShell";
import { DataTable, type ColDef } from "@/components/DataTable";
import { QuickCreateDrawer } from "@/components/QuickCreateDrawer";
import { useProjects, useCustomers } from "@/hooks/use-masters";

const STATUS_TABS = [
  { key: "all", label: "All" },
  { key: "Draft", label: "Draft" },
  { key: "Submitted", label: "Submitted" },
  { key: "Approved", label: "Approved" },
  { key: "Paid", label: "Paid" },
];

export default function ClientBillingPage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("all");
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { data: result, isLoading } = useQuery({
    queryKey: ["finance-client-billing"],
    queryFn: () => fetch(`/api/finance/client-billing`).then(r => r.json()),
  });

  const { data: projectsData } = useProjects();
  const { data: customersData } = useCustomers();
  const projectOptions = (projectsData?.data ?? []).map((p: any) => ({ value: p.id, label: p.name }));
  const clientOptions = (customersData?.data ?? []).map((c: any) => ({ value: c.id, label: c.name }));

  const allData = result?.data ?? [];
  const data = activeTab === "all" ? allData : allData.filter((r: any) => r.status === activeTab);

  const config = {
    title: "New Client Bill",
    subtitle: "Create a running account bill for the client",
    apiEndpoint: "/api/finance/client-billing",
    onSuccess: () => qc.invalidateQueries({ queryKey: ["finance-client-billing"] }),
    fields: [
      { key: "projectId", label: "Project", type: "select" as const, required: true, options: projectOptions, placeholder: "Select project", searchable: true },
      { key: "client", label: "Client", type: "select" as const, required: true, options: clientOptions, placeholder: "Select client", searchable: true },
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
      { key: "grossAmount", label: "Gross Amount", type: "number" as const, required: true, placeholder: "0" },
      { key: "gstPercent", label: "GST %", type: "number" as const, placeholder: "18" },
      { key: "retentionPercent", label: "Retention %", type: "number" as const, placeholder: "5" },
      { key: "status", label: "Status", type: "select" as const, options: [{ value: "Draft", label: "Draft" }, { value: "Submitted", label: "Submitted" }], placeholder: "Select status" },
    ],
  };

  const columns: ColDef<any>[] = [
    { key: "billNo", label: "Bill No", sortable: true, searchable: true },
    { key: "projectName", label: "Project", sortable: true, searchable: true },
    { key: "client", label: "Client", sortable: true, searchable: true },
    {
      key: "billPeriod", label: "Bill Period",
      render: (row) => `${row.billPeriodFrom} to ${row.billPeriodTo}`,
    },
    {
      key: "grossAmount", label: "Gross Amt", type: "number", sortable: true,
      render: (row) => row.grossAmount ? `₹ ${Number(row.grossAmount).toLocaleString("en-IN")}` : "—",
    },
    {
      key: "gstAmount", label: "GST", type: "number",
      render: (row) => row.gstAmount ? `₹ ${Number(row.gstAmount).toLocaleString("en-IN")}` : "—",
    },
    {
      key: "retentionDeducted", label: "Retention", type: "number",
      render: (row) => row.retentionDeducted ? `₹ ${Number(row.retentionDeducted).toLocaleString("en-IN")}` : "—",
    },
    {
      key: "netPayable", label: "Net Payable", type: "number", sortable: true,
      render: (row) => row.netPayable ? `₹ ${Number(row.netPayable).toLocaleString("en-IN")}` : "—",
    },
    {
      key: "status", label: "Status", type: "select",
      options: ["Draft", "Submitted", "Approved", "Paid"],
      sortable: true,
      render: (row) => <StatusChip status={row.status ?? ""} />,
    },
  ];

  return (
    <>
      <PageHeader
        title="Client Billing"
        subtitle="Running account bills and invoices to clients"
        breadcrumbs={[{ label: "Finance", href: "/finance" }, { label: "Client Billing" }]}
      />
      <TabBar tabs={STATUS_TABS} activeTab={activeTab} onTabChange={setActiveTab} />
      <PageContainer>
        <DataTable
          id="finance-client-billing"
          columns={columns}
          data={data}
          onAdd={() => setDrawerOpen(true)}
          addLabel="New Bill"
          defaultSort="grossAmount"
          defaultSortDir="desc"
        />
      </PageContainer>
      <QuickCreateDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} config={config} />
    </>
  );
}
