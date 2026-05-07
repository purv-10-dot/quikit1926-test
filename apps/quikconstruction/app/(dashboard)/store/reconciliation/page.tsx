"use client";

import { useMemo, useState } from "react";
import { PageHeader, PageContainer, StatusChip, TabBar } from "@/components/PageShell";
import { DataTable, type ColDef } from "@/components/DataTable";
import { useStockReconciliations } from "@/hooks/use-store";
import { QuickCreateDrawer } from "@/components/QuickCreateDrawer";
import { useProjects, useLocations, useItems } from "@/hooks/use-masters";
import { useQueryClient } from "@tanstack/react-query";
import { buildTabCounts, filterByTab, type TabSpec } from "@/lib/tab-counts";

const TABS: TabSpec[] = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "pending_approval", label: "Pending" },
  { key: "approved", label: "Approved" },
];

export default function StockReconciliationPage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("all");
  const [drawerOpen, setDrawerOpen] = useState(false);

  const { data: result, isLoading } = useStockReconciliations({ status: "all" });
  const allRows = result?.data ?? [];
  const tabs = useMemo(() => buildTabCounts(allRows, TABS), [allRows]);
  const data = useMemo(() => filterByTab(allRows, activeTab, TABS), [allRows, activeTab]);

  const { data: projectsData } = useProjects();
  const { data: locationsData } = useLocations();
  const { data: itemsData } = useItems();

  const projectOptions = (projectsData?.data ?? []).map((p: any) => ({ value: p.id, label: p.name }));
  const locationOptions = (locationsData?.data ?? []).map((l: any) => ({ value: l.id, label: l.name }));
  const itemOptions = (itemsData?.data ?? []).map((i: any) => ({ value: i.id, label: i.name }));

  const config = {
    title: "New Stock Reconciliation",
    subtitle: "Compare physical stock with system records",
    apiEndpoint: "/api/store/reconciliations",
    onSuccess: () => qc.invalidateQueries({ queryKey: ["stock-reconciliations"] }),
    fields: [
      { key: "projectId", label: "Project", type: "select" as const, required: true, options: projectOptions, placeholder: "Select project" },
      { key: "locationId", label: "Location", type: "select" as const, required: true, options: locationOptions, placeholder: "Select location" },
      { key: "reconciliationDate", label: "Reconciliation Date", type: "date" as const, required: true },
      { key: "conductedBy", label: "Conducted By", type: "text" as const, placeholder: "Name of person" },
    ],
    lineItems: {
      label: "Reconciliation Items",
      fields: [
        { key: "itemId", label: "Material", type: "select" as const, options: itemOptions, placeholder: "Select material", width: "wide" },
        { key: "systemQty", label: "System Qty", type: "number" as const, placeholder: "System" },
        { key: "physicalQty", label: "Physical Qty", type: "number" as const, placeholder: "Physical" },
        { key: "varianceReason", label: "Variance Reason", type: "text" as const, placeholder: "Reason" },
      ],
    },
  };

  const columns: ColDef<any>[] = [
    { key: "reconciliationNumber", label: "Recon No", sortable: true, searchable: true },
    { key: "projectName", label: "Project", sortable: true, searchable: true },
    { key: "locationName", label: "Location", sortable: true, searchable: true },
    { key: "reconciliationDate", label: "Date", type: "date", sortable: true },
    { key: "conductedByName", label: "Conducted By", sortable: true },
    {
      key: "status", label: "Status", type: "select",
      options: ["draft", "pending_approval", "approved"],
      sortable: true,
      render: (row) => <StatusChip status={row.status ?? ""} />,
    },
  ];

  return (
    <>
      <PageHeader
        title="Stock Reconciliation"
        subtitle="Compare physical stock with system records and adjust variances"
        breadcrumbs={[{ label: "Store", href: "/store" }, { label: "Reconciliation" }]}
      />
      <TabBar tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />
      <PageContainer>
        <DataTable
          id="store-reconciliation"
          columns={columns}
          data={data}
          onAdd={() => setDrawerOpen(true)}
          addLabel="New Reconciliation"
          defaultSort="reconciliationDate"
          defaultSortDir="desc"
        />
      </PageContainer>
      <QuickCreateDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} config={config} />
    </>
  );
}
