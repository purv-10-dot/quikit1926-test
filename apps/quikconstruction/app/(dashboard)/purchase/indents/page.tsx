"use client";

/**
 * Purchase Indents — list + quick create.
 *
 * The "Source PR Ref" dropdown is populated from Purchase Requisitions
 * whose status is `approved_indent_required` — those are the PRs the
 * approver ruled needed procurement (vs `approved_stock_available`
 * which go straight to Material Issue). Picking a PR stamps
 * `sourceMrId` + `sourceMrNumber` on the new Indent, creating the
 * PR → Indent chain.
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, Send } from "lucide-react";
import { PageHeader, PageContainer, StatusChip, TabBar } from "@/components/PageShell";
import { DataTable, type ColDef } from "@/components/DataTable";
import { useIndents, useSubmitIndent } from "@/hooks/use-approvals";
import { usePurchaseRequisitions } from "@/hooks/use-purchase";
import { QuickCreateDrawer } from "@/components/QuickCreateDrawer";
import dynamic from "next/dynamic";
import type { SourceDocType } from "@/components/SourceDocPeekModal";
const SourceDocPeekModal = dynamic(
  () => import("@/components/SourceDocPeekModal").then((m) => m.SourceDocPeekModal),
  { ssr: false },
);
import { useProjects, useItems } from "@/hooks/use-masters";
import { useQueryClient } from "@tanstack/react-query";
import { buildTabCounts, filterByTab, type TabSpec } from "@/lib/tab-counts";

const STATUS_TABS: TabSpec[] = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "pending_approval", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "partially_ordered", label: "Partially Ordered" },
  { key: "fully_ordered", label: "Fully Ordered" },
];

export default function IndentsPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("all");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [peekTarget, setPeekTarget] = useState<{ type: SourceDocType; id: string } | null>(null);

  const { data: result } = useIndents({ status: "all", search: "" });
  const submitMutation = useSubmitIndent();
  const allRows = result?.data ?? [];
  const tabs = useMemo(() => buildTabCounts(allRows, STATUS_TABS), [allRows]);
  const data = useMemo(
    () => filterByTab(allRows, activeTab, STATUS_TABS),
    [allRows, activeTab],
  );

  const handleSubmit = async (id: string) => {
    if (!confirm("Submit this Indent for approval?")) return;
    try {
      await submitMutation.mutateAsync(id);
    } catch (err: any) {
      alert(err?.message ?? "Failed to submit");
    }
  };

  const { data: projectsData } = useProjects();
  const { data: itemsData } = useItems();

  // Source PR candidates: PRs that have been approved AND flagged as
  // needing procurement (not the ones that went to Material Issue).
  const { data: approvedPrResult } = usePurchaseRequisitions({
    status: "approved_indent_required",
  });
  const approvedPrs = useMemo(() => approvedPrResult?.data ?? [], [approvedPrResult]);

  const projectOptions = (projectsData?.data ?? []).map((p: any) => ({
    value: p.id,
    label: p.name,
  }));
  const allItems = itemsData?.data ?? [];
  const itemOptions = allItems.map((i: any) => ({
    value: i.id,
    label: i.name,
  }));
  // Indexed lookup so the Material picker's onChange can pull UOM +
  // standard rate off the master in O(1) when a material is selected.
  const itemById = useMemo(() => {
    const map = new Map<string, any>();
    for (const i of allItems) map.set(i.id, i);
    return map;
  }, [allItems]);
  const sourcePrOptions = useMemo(
    () =>
      approvedPrs.map((pr: any) => ({
        value: pr.id,
        label: pr.prNumber ?? pr.mrNumber ?? pr.id,
      })),
    [approvedPrs]
  );

  const config = {
    title: "New Purchase Indent",
    subtitle: "Consolidate material requirements for ordering",
    apiEndpoint: "/api/purchase/indents",
    onSuccess: () => qc.invalidateQueries({ queryKey: ["indents"] }),
    fields: [
      {
        key: "sourceMrId",
        label: "Source PR Ref",
        type: "select" as const,
        required: true,
        options: sourcePrOptions,
        placeholder:
          sourcePrOptions.length === 0
            ? "No approved PRs available"
            : "Select an approved PR…",
        span: 2 as const,
        // Auto-fill Project (+ Required Date) from the picked PR AND
        // copy the PR's material lines into the Indent's grid so the
        // user doesn't have to re-enter them. The user can still edit
        // qty / rate or remove rows before creating the Indent.
        onChange: (value: string) => {
          if (!value) return;
          const pr = approvedPrs.find((p: any) => p.id === value);
          if (!pr) return;
          const fields: Record<string, string> = {};
          if (pr.projectId) fields.projectId = pr.projectId;
          if (pr.requiredDate) fields.requiredDate = pr.requiredDate;
          const lines: Record<string, string>[] = (pr.lines ?? []).map(
            (l: any) => {
              // Resolve to the CURRENT item id. The PR may carry a stale
              // id from before the Items master was migrated to Prisma
              // (e.g. "item-1"), so fall through code → name → id to find
              // the matching row in today's master. Skip the line if we
              // can't reconcile it — blank itemId leaves the picker on
              // "Select material" for the user to pick manually.
              const match =
                (l.itemCode && allItems.find((i: any) => i.code === l.itemCode)) ||
                (l.itemName && allItems.find((i: any) => i.name === l.itemName)) ||
                (l.itemId && allItems.find((i: any) => i.id === l.itemId)) ||
                null;
              return {
                itemId: match?.id ?? "",
                qtyRequested: String(
                  l.quantity ?? l.qtyRequired ?? l.qtyRequested ?? "",
                ),
                uom: l.uomCode ?? l.uom ?? match?.uomCode ?? "",
                estimatedRate: String(
                  l.estimatedRate ??
                    l.rate ??
                    l.unitRate ??
                    match?.standardRate ??
                    "",
                ),
              };
            },
          );
          return { fields, lines };
        },
      },
      {
        key: "projectId",
        label: "Project",
        type: "select" as const,
        required: true,
        options: projectOptions,
        placeholder: "Select project",
      },
      {
        key: "requiredDate",
        label: "Required Date",
        type: "date" as const,
        required: true,
      },
      {
        key: "directIndentReason",
        label: "Justification (only if no source PR)",
        type: "textarea" as const,
        placeholder: "Required for direct indents without a source PR",
        span: 2 as const,
      },
    ],
    lineItems: {
      label: "Material Lines",
      // showHeader puts uppercase column labels (Material / Quantity /
      // UOM / Est. Rate) above the row inputs so the user isn't
      // staring at unlabeled boxes. gridCols:5 fits the wide Material
      // select (col-span-2) + Quantity + UOM + Est. Rate on a single
      // line — the previous default of 4 forced Est. Rate to wrap.
      showHeader: true,
      gridCols: 5,
      fields: [
        {
          key: "itemId",
          label: "Material",
          type: "select" as const,
          options: itemOptions,
          placeholder: "Select material",
          width: "wide",
          // Pulls UOM + standard rate off the item master so the user
          // doesn't have to retype them for every row. Leaves Quantity
          // blank — that's transaction-specific, not a master field.
          onChange: (value: string) => {
            if (!value) return;
            const item = itemById.get(value);
            if (!item) return;
            const patch: Record<string, string> = {};
            if (item.uomCode) patch.uom = String(item.uomCode);
            if (item.standardRate !== undefined && item.standardRate !== null) {
              patch.estimatedRate = String(item.standardRate);
            }
            return patch;
          },
        },
        {
          key: "qtyRequested",
          label: "Quantity",
          type: "number" as const,
          placeholder: "Qty",
        },
        {
          key: "uom",
          label: "UOM",
          type: "text" as const,
          placeholder: "UOM",
        },
        {
          key: "estimatedRate",
          label: "Est. Rate",
          type: "number" as const,
          placeholder: "Rate",
        },
      ],
    },
  };

  const columns: ColDef<any>[] = [
    {
      key: "indentNumber",
      label: "Indent No",
      sortable: true,
      searchable: true,
      render: (row) => (
        <span
          className="text-blue-600 cursor-pointer hover:underline font-medium"
          onClick={() => router.push(`/purchase/indents/${row.id}`)}
        >
          {row.indentNumber}
        </span>
      ),
    },
    {
      key: "sourceMrNumber",
      label: "Source PR",
      sortable: true,
      searchable: true,
      render: (row) =>
        row.sourceMrNumber && row.sourceMrId ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setPeekTarget({ type: "pr", id: row.sourceMrId });
            }}
            className="font-mono text-xs text-indigo-600 hover:text-indigo-800 underline"
            title="View PR details"
          >
            {row.sourceMrNumber}
          </button>
        ) : (
          <span className="text-[11px] text-gray-400 italic">Direct</span>
        ),
    },
    { key: "projectName", label: "Project", sortable: true, searchable: true },
    { key: "requiredDate", label: "Required Date", type: "date", sortable: true },
    {
      key: "lineCount",
      label: "Items",
      type: "number",
      sortable: true,
      render: (row) => `${row.lineCount ?? 0} items`,
    },
    {
      key: "status",
      label: "Status",
      type: "select",
      options: [
        "draft",
        "submitted",
        "approved_l1",
        "approved_l2",
        "l3_approved",
        "approved",
        "partially_ordered",
        "fully_ordered",
        "rejected",
      ],
      sortable: true,
      render: (row) => <StatusChip status={row.status ?? ""} />,
    },
    {
      key: "_actions",
      label: "Actions",
      width: "100px",
      render: (row) => (
        <div className="flex items-center justify-end gap-1">
          <button
            onClick={() => router.push(`/purchase/indents/${row.id}`)}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
            title="View"
          >
            <Eye className="w-4 h-4" />
          </button>
          {row.status === "draft" && (
            <button
              onClick={() => handleSubmit(row.id)}
              className="p-1.5 rounded hover:bg-gray-100 text-orange-500"
              title="Submit for Approval"
            >
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
        title="Purchase Indents"
        subtitle="Consolidate approved material requirements for ordering"
        breadcrumbs={[
          { label: "Purchase", href: "/purchase" },
          { label: "Indents" },
        ]}
      />
      <TabBar tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />
      <PageContainer>
        <DataTable
          id="purchase-indents"
          columns={columns}
          data={data}
          onAdd={() => setDrawerOpen(true)}
          addLabel="New Indent"
          defaultSort="requiredDate"
          defaultSortDir="desc"
        />
      </PageContainer>
      <QuickCreateDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        config={config}
      />

      <SourceDocPeekModal
        open={!!peekTarget}
        initial={peekTarget}
        onClose={() => setPeekTarget(null)}
      />
    </>
  );
}
