"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, Send } from "lucide-react";
import {
  PageHeader, PageContainer, StatusChip, TabBar,
} from "@/components/PageShell";
import { ConfirmDialog } from "@/components/ConfirmDialog";
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
  // PR awaiting submit confirmation — drives the ConfirmDialog (replaces
  // the native window.confirm). `null` when the dialog is closed.
  const [submitTarget, setSubmitTarget] = useState<any | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

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

  const doSubmitPR = async () => {
    if (!submitTarget) return;
    setSubmitError(null);
    try {
      await submitMutation.mutateAsync(submitTarget.id);
      setSubmitTarget(null);
    } catch (err: any) {
      // Keep the dialog open so the user can read the failure reason.
      setSubmitError(err?.message ?? "Failed to submit PR");
    }
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
            <button onClick={() => { setSubmitError(null); setSubmitTarget(row); }}
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

      <ConfirmDialog
        open={!!submitTarget}
        onClose={() => {
          if (!submitMutation.isPending) {
            setSubmitTarget(null);
            setSubmitError(null);
          }
        }}
        onConfirm={doSubmitPR}
        title="Submit for Approval"
        confirmLabel="Submit"
        tone="primary"
        loading={submitMutation.isPending}
        message={
          <>
            Submit PR{" "}
            <span className="font-semibold text-slate-900">
              {submitTarget?.prNumber ?? submitTarget?.mrNumber ?? submitTarget?.id}
            </span>{" "}
            for approval? It will be routed through the active Purchase
            Requisition workflow and you won't be able to edit it until an
            approver returns it.
            {submitError && (
              <span className="mt-3 block rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                {submitError}
              </span>
            )}
          </>
        }
      />
    </>
  );
}
