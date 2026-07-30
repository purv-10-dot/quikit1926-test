"use client";

/**
 * Purchase Indents — list + quick create.
 *
 * The "Source PR Ref" dropdown is populated from Purchase Requisitions
 * whose status is `approved_indent_required` — those are the PRs the
 * approver ruled needed procurement (vs `approved_stock_available`
 * which go straight to Material Issue). Picking a PR stamps
 * `sourceMrId` + `sourceMrNumber` on the new Indent, creating the
 * PR → Indent chain. Picking a PR seeds material lines as one row per
 * PR line (qty preserved); each row shows its group name and uses
 * group → material pick.
 */

import { toErrorMessage } from "@/lib/api/errors";
import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, Send, AlertCircle } from "lucide-react";
import { toast } from "@/lib/toast";
import { PageFrame, PageHeader, PageContainer, StatusChip, TabBar } from "@/components/PageShell";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DataTable, type ColDef } from "@/components/DataTable";
import { useSubmitIndent } from "@/hooks/use-approvals";
import { usePurchaseRequisitions } from "@/hooks/use-purchase";
import { useMenuActions } from "@/hooks/use-permissions";
import { QuickCreateDrawer, type QuickCreateConfig } from "@/components/QuickCreateDrawer";
import dynamic from "next/dynamic";
import type { SourceDocType } from "@/components/SourceDocPeekModal";
const SourceDocPeekModal = dynamic(
  () => import("@/components/SourceDocPeekModal").then((m) => m.SourceDocPeekModal),
  { ssr: false },
);
import { GroupedMaterialSelect, GROUPED_MATERIAL_OTHERS_GROUP_ID } from "@/components/GroupedMaterialSelect";
import { useProjects, useItemGroups } from "@/hooks/use-masters";
import { useQueryClient } from "@tanstack/react-query";
import { type TabSpec } from "@/lib/tab-counts";
import { useServerTabList } from "@/hooks/use-server-tab-list";

const STATUS_TABS: TabSpec[] = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "pending_approval", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "partially_ordered", label: "Partially Ordered" },
  { key: "fully_ordered", label: "Fully Ordered" },
];

/** A PR line as carried by the source-PR payload (dual field names). */
interface PrSourceLine {
  id?: string; lineId?: string;
  itemId?: string; itemCode?: string; itemName?: string;
  quantity?: number | string; qtyRequired?: number | string; qtyRequested?: number | string;
  uomCode?: string; uom?: string;
  estimatedRate?: number | string; rate?: number | string; unitRate?: number | string;
}
type IndentItemNode = {
  id: string; code?: string; name?: string; groupId?: string; groupName?: string;
  uomCode?: string; standardRate?: number | string | null;
};
interface IndentRow {
  id: string; indentNumber?: string; status?: string; lineCount?: number;
  sourceMrId?: string; sourceMrNumber?: string;
  [key: string]: unknown;
}

export default function IndentsPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("all");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [peekTarget, setPeekTarget] = useState<{ type: SourceDocType; id: string } | null>(null);
  // Indent awaiting submit confirmation — drives the ConfirmDialog
  // (replaces the native window.confirm). `null` when the dialog is closed.
  const [submitTarget, setSubmitTarget] = useState<any | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { canAdd } = useMenuActions("/purchase/indents");

  const submitMutation = useSubmitIndent();
  const [searchQuery, setSearchQuery] = useState("");
  const [sort, setSort] = useState<{ by?: string; order?: "asc" | "desc" }>({
    by: "indentDate",
    order: "desc",
  });
  const {
    items: data,
    total,
    page,
    pageSize,
    setPage,
    setPageSize,
    tabs,
    isLoading,
  } = useServerTabList<IndentRow>("indents", "/api/purchase/indents", {
    activeTab,
    tabs: STATUS_TABS,
    search: searchQuery,
    sortBy: sort.by,
    sortOrder: sort.order,
    initialPageSize: 25,
  });

  const doSubmit = async () => {
    if (!submitTarget) return;
    setSubmitError(null);
    try {
      await submitMutation.mutateAsync(submitTarget.id);
      setSubmitTarget(null);
    } catch (err: unknown) {
      // Keep the dialog open so the user can read the failure reason.
      setSubmitError(toErrorMessage(err, "Failed to submit Indent"));
    }
  };

  const { data: projectsData } = useProjects();
  const { data: itemGroupsData } = useItemGroups();

  // Source PR candidates: PRs that have been approved AND flagged as
  // needing procurement (not the ones that went to Material Issue).
  const { data: approvedPrResult } = usePurchaseRequisitions({
    status: "approved_indent_required",
  });
  const approvedPrs = useMemo(() => approvedPrResult?.data ?? [], [approvedPrResult]);

  const projectOptions = (projectsData?.data ?? []).map((p) => ({
    value: p.id,
    label: p.name,
  }));
  const itemGroups = useMemo(() => {
    const raw = itemGroupsData?.data ?? [];
    return raw.filter((g) => (g?.status ?? "active").toLowerCase() !== "inactive");
  }, [itemGroupsData]);
  const sourcePrOptions = useMemo(
    () =>
      approvedPrs.map((pr) => ({
        value: pr.id,
        label: pr.prNumber ?? pr.mrNumber ?? pr.id,
      })),
    [approvedPrs]
  );

  const buildIndentLinesFromPr = useCallback(
    (pr: { lines?: PrSourceLine[] } | null | undefined) => {
      const rawLines: PrSourceLine[] = Array.isArray(pr?.lines) ? pr.lines : [];
      // Prefill straight from the PR line's own denormalized fields (itemId /
      // itemName / uom / rate) — the lazy picker no longer holds the full item
      // master, so we can't resolve the item's group for auto-scroll; the
      // picker just opens on the group list (itemId + label stay correct).
      return rawLines.map((l) => ({
        itemId: l.itemId ?? "",
        itemName: l.itemName ?? "",
        // Carry the PR line id so the PR → Indent link persists — the
        // indent route stores this as `prLineId`, which the PR's "PO"
        // column rollup walks (PR line → indent line → PO line).
        prLineId: l.id ?? l.lineId ?? null,
        prefillGroupId: GROUPED_MATERIAL_OTHERS_GROUP_ID,
        qtyRequested: String(l.quantity ?? l.qtyRequired ?? l.qtyRequested ?? ""),
        uom: l.uomCode ?? l.uom ?? "",
        estimatedRate: String(l.estimatedRate ?? l.rate ?? l.unitRate ?? ""),
      }));
    },
    [],
  );

  const config: QuickCreateConfig = {
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
        // seed Material Lines with one row per PR line. Each row shows
        // its group name and the user picks group → material.
        onChange: (value: string) => {
          if (!value) return;
          const pr = approvedPrs.find((p) => p.id === value);
          if (!pr) return;
          const fields: Record<string, string> = {};
          if (pr.projectId) fields.projectId = pr.projectId;
          if (pr.requiredDate) fields.requiredDate = pr.requiredDate;
          const seeded = buildIndentLinesFromPr(pr);
          return { fields, lines: seeded.length > 0 ? seeded : [{}] };
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
      validateBeforeSubmit: (gridLines) => {
        const rowHasContent = (l: Record<string, unknown>) =>
          Object.entries(l).some(([k, v]) => {
            if (k === "prefillGroupId") return false; // UI-only hint
            return v !== undefined && v !== null && String(v).trim() !== "";
          });
        if (!gridLines.some(rowHasContent)) return "Add at least one material line";
        for (let i = 0; i < gridLines.length; i++) {
          const l = gridLines[i];
          if (!rowHasContent(l)) continue;
          if (!String(l.itemId ?? "").trim()) {
            return `Line ${i + 1}: Choose a material (group → item)`;
          }
          const q = parseFloat(String(l.qtyRequested ?? "")) || 0;
          if (q <= 0) return `Line ${i + 1}: Quantity must be greater than 0`;
        }
        return null;
      },
      fields: [
        {
          key: "itemId",
          label: "Material",
          type: "custom" as const,
          width: "wide",
          render: (line, update: (patch: Record<string, unknown>) => void) => (
            <GroupedMaterialSelect
              lazy
              value={line.itemId ?? ""}
              selectedLabel={line.itemName ?? ""}
              onChange={(v) => {
                if (!v) update({ itemId: "", itemName: "", uom: "", estimatedRate: "" });
                else update({ itemId: v });
              }}
              onSelect={(item) => {
                if (!item) return;
                const it = item as IndentItemNode;
                const patch: Record<string, string> = { itemName: it.name ?? "" };
                if (it.uomCode) patch.uom = String(it.uomCode);
                if (
                  it.standardRate !== undefined &&
                  it.standardRate !== null &&
                  it.standardRate !== ""
                ) {
                  patch.estimatedRate = String(it.standardRate);
                }
                update(patch);
              }}
              items={[]}
              groups={itemGroups.map((g) => ({ id: g.id, name: g.name, status: g.status, itemCount: g.itemCount }))}
              initialGroupId={line.prefillGroupId ?? null}
              placeholder="Select material…"
              size="sm"
            />
          ),
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

  const columns: ColDef<IndentRow>[] = [
    {
      key: "indentNumber",
      label: "Indent No",
      sortable: true,
      searchable: true,
      render: (row) => (
        <span
          className="text-accent-600 cursor-pointer hover:underline font-medium"
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
              setPeekTarget({ type: "pr", id: row.sourceMrId ?? "" });
            }}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-accent-50 text-accent-700 text-[11px] font-medium hover:bg-accent-100 transition-colors"
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
      width: "120px",
      align: "right",
      sortable: false,
      render: (row) => {
        const isDraft = row.status === "draft";
        return (
          <div className="flex items-center justify-end gap-1.5">
            <button
              onClick={() => router.push(`/purchase/indents/${row.id}`)}
              className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
              title="View"
            >
              <Eye className="w-4 h-4" />
            </button>
            {isDraft && (
              <button
                onClick={() => { setSubmitError(null); setSubmitTarget(row); }}
                className="p-1.5 rounded hover:bg-orange-50 text-orange-600 hover:text-orange-700 transition-colors"
                title="Submit for Approval"
              >
                <Send className="w-4 h-4" />
              </button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <>
      <PageFrame>
      <PageHeader
        title="Purchase Indents"
        subtitle="Consolidate approved material requirements for ordering"
        breadcrumbs={[
          { label: "Purchase", href: "/purchase" },
          { label: "Indents" },
        ]}
      />
      <TabBar tabs={tabs} activeTab={activeTab} onTabChange={setActiveTab} />
      <PageContainer fill>
        {approvedPrs.length === 0 && (
          <div className="mb-4 flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
            <div>
              <div className="font-semibold">A Purchase Requisition must be approved first</div>
              <div className="mt-0.5 text-amber-700">
                Indents are created from approved PRs. Please create a Purchase Requisition and get
                it approved before raising an Indent.{" "}
                <Link href="/purchase/requisitions" className="font-medium underline hover:text-amber-900">
                  Go to Purchase Requisitions
                </Link>
              </div>
            </div>
          </div>
        )}
        <DataTable
          id="purchase-indents"
          columns={columns}
          data={data as unknown as IndentRow[]}
          onAdd={canAdd ? () => {
            if (approvedPrs.length === 0) {
              toast.warning(
                "Create and approve a Purchase Requisition first — Indents can only be raised from approved PRs.",
              );
              return;
            }
            setDrawerOpen(true);
          } : undefined}
          addLabel="New Indent"
          historyEntityType="indent,purchase_indents"
          loading={isLoading}
          serverMode
          serverTotal={total}
          serverPage={page}
          serverPageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          onSearchChange={setSearchQuery}
          onSortChange={(k, d) => setSort({ by: k, order: d })}
        />
      </PageContainer>
      </PageFrame>
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

      <ConfirmDialog
        open={!!submitTarget}
        onClose={() => {
          if (!submitMutation.isPending) {
            setSubmitTarget(null);
            setSubmitError(null);
          }
        }}
        onConfirm={doSubmit}
        title="Submit for Approval"
        confirmLabel="Submit"
        tone="primary"
        loading={submitMutation.isPending}
        message={
          <>
            Submit Indent{" "}
            <span className="font-semibold text-slate-900">
              {submitTarget?.indentNumber ?? submitTarget?.id}
            </span>{" "}
            for approval? It will be routed through the active Purchase
            Indent workflow and you won't be able to edit it until an
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
