"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, Send } from "lucide-react";
import {
  PageHeader, PageContainer, StatusChip, TabBar,
} from "@/components/PageShell";
import { DataTable, type ColDef } from "@/components/DataTable";
import { usePurchaseRequisitions, useSubmitPR } from "@/hooks/use-purchase";
import { usePermissions, useMenuActions } from "@/hooks/use-permissions";
import dynamic from "next/dynamic";
const PRCreateDrawer = dynamic(
  () => import("./PRCreateDrawer").then((m) => m.PRCreateDrawer),
  { ssr: false },
);
import { buildTabCounts, filterByTab, type TabSpec } from "@/lib/tab-counts";

const STATUS_TABS: TabSpec[] = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "pending_approval", label: "Pending Approval" },
  { key: "approved_stock_available", label: "Stock Available" },
  { key: "approved_indent_required", label: "Indent Required" },
  { key: "closed", label: "Closed" },
];

export default function PurchaseRequisitionsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("all");
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Fetch the unfiltered list once and derive both the tab counts and
  // the visible slice client-side. Keeps the page to one query and
  // makes tab switches instant.
  const { data: result, isLoading } = usePurchaseRequisitions({
    status: "all",
    search: "",
  });
  const submitMutation = useSubmitPR();
  const { me } = usePermissions();
  const { canAdd } = useMenuActions("/purchase/requisitions");

  const allRows = result?.data ?? [];
  const tabs = useMemo(() => buildTabCounts(allRows, STATUS_TABS), [allRows]);
  const data = useMemo(() => filterByTab(allRows, activeTab, STATUS_TABS), [allRows, activeTab]);

  const handleSubmitPR = async (id: string) => {
    if (!confirm("Submit this PR for approval?")) return;
    try {
      await submitMutation.mutateAsync(id);
    } catch { /* error toast handled globally */ }
  };

  const columns: ColDef<any>[] = [
    {
      key: "prNumber", label: "PR Number", sortable: true, searchable: true,
      render: (row) => (
        <span className="text-orange-600 cursor-pointer hover:underline font-medium"
              onClick={() => router.push(`/purchase/requisitions/${row.id}`)}>
          {row.prNumber}
        </span>
      ),
    },
    { key: "projectName", label: "Project", sortable: true, searchable: true },
    { key: "requestDate", label: "Date", type: "date", sortable: true },
    { key: "requiredDate", label: "Required Date", type: "date", sortable: true },
    { key: "purpose", label: "Purpose", searchable: true },
    {
      key: "lineCount", label: "Items", type: "number", sortable: true,
      render: (row) => `${row.lineCount ?? 0} items`,
    },
    {
      key: "estimatedTotal", label: "Est. Value", type: "number", sortable: true,
      render: (row) => row.estimatedTotal ? `₹ ${Number(row.estimatedTotal).toLocaleString("en-IN")}` : "—",
    },
    {
      key: "status", label: "Status", type: "select",
      options: ["draft", "pending_approval", "approved_stock_available", "approved_indent_required", "closed"],
      sortable: true,
      render: (row) => <StatusChip status={row.status ?? ""} />,
    },
    {
      key: "_actions", label: "Actions", width: "100px",
      render: (row) => (
        <div className="flex items-center justify-end gap-1">
          <button onClick={() => router.push(`/purchase/requisitions/${row.id}`)}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-500" title="View">
            <Eye className="w-4 h-4" />
          </button>
          {row.status === "draft" && row.createdBy && me?.userId === row.createdBy && (
            <button onClick={() => handleSubmitPR(row.id)}
              className="p-1.5 rounded hover:bg-gray-100 text-orange-500" title="Submit for Approval">
              <Send className="w-4 h-4" />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Purchase Requisitions"
        subtitle="Request materials needed for site operations"
        breadcrumbs={[{ label: "Purchase", href: "/purchase" }, { label: "Requisitions" }]}
      />

      <TabBar tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />

      <PageContainer>
        <DataTable
          id="purchase-requisitions"
          columns={columns}
          data={data}
          onAdd={canAdd ? () => setDrawerOpen(true) : undefined}
          addLabel="New PR"
          defaultSort="requestDate"
          defaultSortDir="desc"
          historyEntityType="mr,purchase_requisitions"
          emptyTitle="No purchase requisitions yet"
          emptyHint="Raise a PR to request materials needed for site operations. Once submitted, it will flow through the approval workflow."
        />
      </PageContainer>

      <PRCreateDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  );
}
