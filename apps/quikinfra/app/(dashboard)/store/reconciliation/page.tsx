"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye } from "lucide-react";
import { PageHeader, PageContainer, StatusChip, TabBar } from "@/components/PageShell";
import { DataTable, type ColDef } from "@/components/DataTable";
import { useStockReconciliations } from "@/hooks/use-store";
import { QuickCreateDrawer, type QuickCreateConfig } from "@/components/QuickCreateDrawer";
import { GroupedMaterialSelect, type GroupedMaterialSelectItem } from "@/components/GroupedMaterialSelect";
import { useProjects, useLocations, useItems, useItemGroups } from "@/hooks/use-masters";
import { useMenuActions } from "@/hooks/use-permissions";
import { useQueryClient } from "@tanstack/react-query";
import { buildTabCounts, filterByTab, type TabSpec } from "@/lib/tab-counts";

const TABS: TabSpec[] = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "pending_approval", label: "Pending" },
  { key: "approved", label: "Approved" },
];

interface ReconRow {
  id: string; reconciliationNumber?: string; projectName?: string;
  locationName?: string; reconciliationDate?: string; conductedByName?: string;
  status?: string;
  [key: string]: unknown;
}

export default function StockReconciliationPage() {
  const qc = useQueryClient();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("all");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { canAdd } = useMenuActions("/store/reconciliation");

  const { data: result, isLoading } = useStockReconciliations({ status: "all" });
  const allRows = result?.data ?? [];
  const tabs = useMemo(() => buildTabCounts(allRows, TABS), [allRows]);
  const data = useMemo(() => filterByTab(allRows, activeTab, TABS), [allRows, activeTab]);

  const { data: projectsData } = useProjects();
  const { data: locationsData } = useLocations();
  const { data: itemsData } = useItems();
  const { data: itemGroupsData } = useItemGroups();

  const projectOptions = (projectsData?.data ?? []).map((p) => ({ value: p.id, label: p.name }));
  const locationOptions = (locationsData?.data ?? []).filter((l) => l?.status === "active").map((l) => ({ value: l.id, label: l.name }));
  const items = (itemsData?.data ?? []) as unknown as GroupedMaterialSelectItem[];
  const itemGroups = itemGroupsData?.data ?? [];

  const config: QuickCreateConfig = {
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
        {
          key: "itemId",
          label: "Material",
          type: "custom" as const,
          width: "wide",
          render: (line, update: (patch: Record<string, unknown>) => void) => (
            <GroupedMaterialSelect
              value={line.itemId ?? ""}
              onChange={(v) => update({ itemId: v })}
              items={items}
              groups={itemGroups.map((g) => ({
                id: g.id,
                name: g.name,
                status: g.status,
              }))}
              placeholder={
                items.length === 0 ? "No items in master" : "Select material"
              }
              size="sm"
            />
          ),
        },
        { key: "systemQty", label: "System Qty", type: "number" as const, placeholder: "System" },
        { key: "physicalQty", label: "Physical Qty", type: "number" as const, placeholder: "Physical" },
        { key: "varianceReason", label: "Variance Reason", type: "text" as const, placeholder: "Reason" },
      ],
    },
  };

  const columns: ColDef<ReconRow>[] = [
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
    {
      key: "_actions",
      label: "Actions",
      width: "100px",
      sortable: false,
      searchable: false,
      hideable: false,
      freezable: false,
      render: (row) => (
        <div className="flex items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              router.push(`/store/reconciliation/${row.id}`);
            }}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
            title="View"
            aria-label="View"
          >
            <Eye className="w-4 h-4" />
          </button>
        </div>
      ),
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
          data={data as ReconRow[]}
          onAdd={canAdd ? () => setDrawerOpen(true) : undefined}
          addLabel="New Reconciliation"
          historyEntityType="recon"
        />
      </PageContainer>
      <QuickCreateDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} config={config} />
    </>
  );
}
