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

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, Send, AlertCircle } from "lucide-react";
import { toast } from "@/lib/toast";
import { PageHeader, PageContainer, StatusChip, TabBar } from "@/components/PageShell";
import { DataTable, type ColDef } from "@/components/DataTable";
import { useIndents, useSubmitIndent } from "@/hooks/use-approvals";
import { usePurchaseRequisitions } from "@/hooks/use-purchase";
import { useMenuActions } from "@/hooks/use-permissions";
import { QuickCreateDrawer } from "@/components/QuickCreateDrawer";
import dynamic from "next/dynamic";
import type { SourceDocType } from "@/components/SourceDocPeekModal";
const SourceDocPeekModal = dynamic(
  () => import("@/components/SourceDocPeekModal").then((m) => m.SourceDocPeekModal),
  { ssr: false },
);
import { GroupedMaterialSelect, GROUPED_MATERIAL_OTHERS_GROUP_ID } from "@/components/GroupedMaterialSelect";
import { useProjects, useItems, useItemGroups } from "@/hooks/use-masters";
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
  const { canAdd } = useMenuActions("/purchase/indents");

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
    } catch { /* error toast handled globally */ }
  };

  const { data: projectsData } = useProjects();
  const { data: itemsData } = useItems();
  const { data: itemGroupsData } = useItemGroups();

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
  const itemGroups = useMemo(() => {
    const raw = itemGroupsData?.data ?? [];
    return raw.filter((g: any) => (g?.status ?? "active").toLowerCase() !== "inactive");
  }, [itemGroupsData]);
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

  const resolveItemMatch = useCallback(
    (l: any) =>
      (l.itemCode && allItems.find((i: any) => i.code === l.itemCode)) ||
      (l.itemName && allItems.find((i: any) => i.name === l.itemName)) ||
      (l.itemId && allItems.find((i: any) => i.id === l.itemId)) ||
      null,
    [allItems],
  );

  const groupBucketId = (match: any | null) => {
    if (!match) return "__ungrouped__";
    const gid = String(match.groupId ?? "").trim();
    const gname = String(match.groupName ?? "").trim();
    if (!gid || !gname) return "__ungrouped__";
    return gid;
  };

  const buildIndentLinesFromPr = useCallback(
    (pr: any) => {
      const rawLines: any[] = Array.isArray(pr?.lines) ? pr.lines : [];
      return rawLines.map((l: any) => {
        const match = resolveItemMatch(l);
        const bid = groupBucketId(match);
        const prefillGroupId =
          bid === "__ungrouped__"
            ? GROUPED_MATERIAL_OTHERS_GROUP_ID
            : (String(match?.groupId ?? "").trim() || GROUPED_MATERIAL_OTHERS_GROUP_ID);

        return {
          // Auto-select the material when we can reconcile it to the current master.
          // If the match fails, keep it blank and force the user to pick.
          itemId: match?.id ?? "",
          // UI hint: start the picker scoped to the PR line's group.
          prefillGroupId,
          qtyRequested: String(l.quantity ?? l.qtyRequired ?? l.qtyRequested ?? ""),
          uom: l.uomCode ?? l.uom ?? match?.uomCode ?? "",
          estimatedRate: String(
            l.estimatedRate ??
              l.rate ??
              l.unitRate ??
              match?.standardRate ??
              "",
          ),
        };
      });
    },
    [resolveItemMatch],
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
        // seed Material Lines with one row per PR line. Each row shows
        // its group name and the user picks group → material.
        onChange: (value: string) => {
          if (!value) return;
          const pr = approvedPrs.find((p: any) => p.id === value);
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
      validateBeforeSubmit: (gridLines: Record<string, any>[]) => {
        const rowHasContent = (l: Record<string, any>) =>
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
          render: (line: Record<string, any>, update: (patch: Record<string, any>) => void) => (
            <GroupedMaterialSelect
              value={line.itemId ?? ""}
              onChange={(v) => {
                if (!v) {
                  update({ itemId: "", uom: "", estimatedRate: "" });
                  return;
                }
                const item = itemById.get(v);
                const patch: Record<string, string> = { itemId: v };
                if (item?.uomCode) patch.uom = String(item.uomCode);
                if (
                  item?.standardRate !== undefined &&
                  item?.standardRate !== null &&
                  item.standardRate !== ""
                ) {
                  patch.estimatedRate = String(item.standardRate);
                }
                update(patch);
              }}
              items={allItems}
              groups={itemGroups.map((g: any) => ({ id: g.id, name: g.name, status: g.status }))}
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

  const columns: ColDef<any>[] = [
    {
      key: "indentNumber",
      label: "Indent No",
      sortable: true,
      searchable: true,
      render: (row) => (
        <span
          className="text-orange-600 cursor-pointer hover:underline font-medium"
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
                onClick={() => handleSubmit(row.id)}
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
          data={data}
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
          defaultSort="requiredDate"
          defaultSortDir="desc"
          historyEntityType="indent,purchase_indents"
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
