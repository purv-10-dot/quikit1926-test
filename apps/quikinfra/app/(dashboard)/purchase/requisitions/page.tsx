"use client";

import { toErrorMessage } from "@/lib/api/errors";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, Send } from "lucide-react";
import {
  PageHeader, PageContainer, StatusChip, TabBar,
} from "@/components/PageShell";
import type { LineProcurement } from "@/lib/purchase/procurement-types";
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

// Human-friendly labels for a PO's lifecycle status — surfaced in the
// PO column tooltip so hovering a PO chip tells you where that order is
// (Draft → Pending approval → Sent → Received → Closed). The tooltip
// reflects the live status, so it updates whenever the PO transitions.
const PO_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  pending_approval: "Pending approval",
  approved: "Approved",
  sent: "Sent to vendor",
  partially_received: "Partially received",
  fully_received: "Fully received",
  closed: "Closed",
  cancelled: "Cancelled",
  rejected: "Rejected",
};
function poStatusLabel(s: string | null | undefined): string {
  if (!s) return "Unknown status";
  return PO_STATUS_LABELS[s] ?? s.replace(/_/g, " ");
}

interface PrRow {
  id: string; prNumber?: string; status?: string; createdBy?: string;
  estimatedTotal?: number | string; lineCount?: number;
  procurement?: LineProcurement | null;
  [key: string]: unknown;
}

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
    } catch (err: unknown) {
      // Keep the dialog open so the user can read the failure reason.
      setSubmitError(toErrorMessage(err, "Failed to submit PR"));
    }
  };

  const columns: ColDef<PrRow>[] = [
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
      // PO tracking — "have we ordered this requirement?" Traced via the
      // PR → indent → PO chain and rolled up per PR.
      key: "_po", label: "PO", sortable: false, width: "150px",
      render: (row) => {
        const p = row.procurement;
        if (!p || p.poRefs.length === 0) {
          return <span className="text-[11px] text-slate-400">Not ordered</span>;
        }
        // Cap the visible chips so a PR fulfilled by many POs doesn't grow
        // the row unbounded — show the first 3, then a "+N more" badge that
        // opens the PR detail (which lists every PO per line).
        const MAX_CHIPS = 3;
        const shown = p.poRefs.slice(0, MAX_CHIPS);
        const extra = p.poRefs.length - shown.length;
        return (
          <div className="flex flex-wrap gap-1">
            {shown.map((po) => (
              <button
                key={po.id}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  router.push(`/purchase/orders/${po.id}`);
                }}
                title={`${po.poNumber} — Status: ${poStatusLabel(po.status)} · click to open`}
                className="inline-flex items-center px-2 py-0.5 rounded-md bg-orange-50 text-orange-700 text-[11px] font-medium whitespace-nowrap hover:bg-orange-100 transition-colors"
              >
                {po.poNumber}
              </button>
            ))}
            {extra > 0 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  router.push(`/purchase/requisitions/${row.id}`);
                }}
                title={`${extra} more PO${extra > 1 ? "s" : ""} — open the PR to see all`}
                className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[11px] font-medium whitespace-nowrap hover:bg-slate-200 transition-colors"
              >
                +{extra} more
              </button>
            )}
          </div>
        );
      },
    },
    {
      // GRN tracking — "has it arrived?" Received / Partial / Awaiting.
      key: "_grn", label: "GRN", sortable: false, width: "110px",
      render: (row) => {
        const p = row.procurement;
        if (!p || p.grnStatus === "none") {
          return (
            <span className="text-[11px] text-slate-400">
              {p && p.poStatus === "ordered" ? "Awaiting" : "—"}
            </span>
          );
        }
        const cls =
          p.grnStatus === "received"
            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
            : "bg-amber-50 text-amber-700 border-amber-200";
        return (
          <span
            className={`inline-flex items-center text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${cls}`}
          >
            {p.grnStatus === "received" ? "Received" : "Partial"}
          </span>
        );
      },
    },
    {
      key: "_actions", label: "Actions", width: "100px", align: "right", sortable: false,
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
          data={data as unknown as PrRow[]}
          onAdd={canAdd ? () => setDrawerOpen(true) : undefined}
          addLabel="New PR"
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
