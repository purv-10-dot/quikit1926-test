"use client";

/**
 * Daily Progress Report — detail page.
 *
 * Mirrors the Work Order detail layout:
 *   - Action pills (Status · Edit · Submit / Approve / Reject) live in
 *     the page header so the next available step is always next to the
 *     title.
 *   - Two-column body: Overview + Work Done table on the left;
 *     Approval Timeline + Audit pinned in a right sidebar.
 *
 * Edit and Delete are locked once the DPR is `approved` — the BOQ
 * progress ledger has already been posted, so editing the source row
 * would drift the cumulative-done totals out of sync.
 */
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  Check,
  Pencil,
  Send,
  Trash2,
  X as XIcon,
} from "lucide-react";
import {
  PageHeader,
  PageContainer,
  PageSkeleton,
  StatusChip,
  ApprovalTimeline,
} from "@/components/PageShell";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { formatDateTimeIST } from "@/lib/format/datetime";
import { WorkflowConfirmDialog } from "@/components/WorkflowConfirmDialog";
import { useDPR, useDeleteDPR, useBOQ, useWorkOrders } from "@/hooks/use-projects";
import { groupWorkItemsByBoq } from "@/lib/projects/boq-work-groups";
import { useContractors } from "@/hooks/use-masters";
import { usePermissions } from "@/hooks/use-permissions";
import { RepairApprovalNotice } from "@/components/RepairApprovalNotice";
import { useWorkflowConfirm } from "@/hooks/use-workflow-confirm";
import { DPRWeatherMetrics } from "@/components/DPRWeatherMetrics";
import { parseStoredWeatherDetail } from "@/lib/weather/dpr-weather";

const MENU_KEY = "pm.dpr";

import type {
  ApprovalStep,
  ApprovalHistoryEntry,
} from "@/lib/approvals/approval-info";
import type {
  WorkItemRow,
  MaterialRow,
  ManpowerRow,
  StaffRow,
  MachineryRow,
  DprDetail,
} from "@/lib/projects/dpr-detail";

const fmtDate = (iso?: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
};

const fmtQty = (v: unknown, unit?: string | null) => {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return `${n.toLocaleString("en-IN", { maximumFractionDigits: 4 })}${unit ? ` ${unit}` : ""}`;
};

const HEADER_PILL =
  "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap shrink-0";

const PILL_TONE = {
  gray: "bg-gray-50 text-gray-700 border-gray-200",
  blue: "bg-accent-50 text-accent-700 border-accent-200",
  orange: "bg-orange-50 text-orange-700 border-orange-200",
  emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rose: "bg-rose-50 text-rose-700 border-rose-200",
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  disabled: "bg-gray-50 text-gray-400 border-gray-200",
} as const;

function statusPillTone(status: string | null | undefined): string {
  const s = String(status ?? "draft").toLowerCase();
  if (s === "approved") return PILL_TONE.emerald;
  if (s === "rejected") return PILL_TONE.rose;
  if (s === "submitted" || s === "approved_l1") return PILL_TONE.amber;
  if (s === "inactive") return PILL_TONE.disabled;
  return PILL_TONE.gray;
}

function statusLabel(status: string | null | undefined): string {
  const s = String(status ?? "draft");
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function DPRDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: dpr, isLoading } = useDPR(id);
  const deleteMutation = useDeleteDPR();

  const { permissionMatrix, isSuper, me } = usePermissions();
  const matrixRow = permissionMatrix?.[MENU_KEY];
  const canEdit = isSuper || !matrixRow || matrixRow.edit !== false;
  const canDelete = isSuper || !matrixRow || matrixRow.delete !== false;
  const canSubmit = canEdit;
  // Approve/Reject visibility comes from the workflow's current step
  // (server-computed in the DPR GET as `approval.canActOnCurrentStep`),
  // not the caller's role.
  const canApprove =
    isSuper || dpr?.approval?.canActOnCurrentStep === true;

  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const workflow = useWorkflowConfirm({
    submitUrl: `/api/projects/dpr/${id}/submit`,
    approveUrl: `/api/projects/dpr/${id}/approve`,
    invalidateKeys: [["dpr", id], ["dprs"]],
  });

  // Auto-open the Submit-for-Approval modal when the form arrives here
  // with ?submit=1 (i.e. the user clicked "Save & Submit"). Fires once,
  // and only if the DPR is still in draft so revisits to the URL don't
  // re-trigger it. The query string is then cleared so a refresh stays
  // quiet.
  const submitFlagHandled = useRef(false);
  useEffect(() => {
    if (submitFlagHandled.current) return;
    if (!dpr) return;
    if (searchParams?.get("submit") !== "1") return;
    if (String(dpr.status ?? "draft").toLowerCase() !== "draft") return;
    submitFlagHandled.current = true;
    workflow.open("submit");
    // Strip the query so a manual refresh after dismiss doesn't re-open it.
    router.replace(`/projects/dpr/${id}`);
    // workflow.open is stable across renders within this page lifecycle
    // (state setter); pulling it into deps would just retrigger the
    // guard on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dpr, searchParams, id]);

  const workItems: WorkItemRow[] = useMemo(
    () => (Array.isArray(dpr?.workItems) ? dpr.workItems : []),
    [dpr],
  );
  // Resolve each work item's BOQ ancestor chain from the project BOQ tree so
  // the Work Done table renders the same group / sub-group headers the DPR
  // form shows. Reuses the React Query-cached BOQ fetch.
  const { data: boqTreeResult } = useBOQ(dpr?.projectId ?? null);
  const boqRows = useMemo(
    () => boqTreeResult?.items ?? boqTreeResult?.data ?? [],
    [boqTreeResult],
  );
  const groupedWorkItems = useMemo(
    () => groupWorkItemsByBoq(workItems, boqRows),
    [workItems, boqRows],
  );
  const materials: MaterialRow[] = useMemo(
    () => (Array.isArray(dpr?.materials) ? dpr.materials : []),
    [dpr],
  );
  const manpower: ManpowerRow[] = useMemo(
    () => (Array.isArray(dpr?.manpower) ? dpr.manpower : []),
    [dpr],
  );
  const machinery: MachineryRow[] = useMemo(
    () => (Array.isArray(dpr?.machinery) ? dpr.machinery : []),
    [dpr],
  );
  const staff: StaffRow[] = useMemo(
    () => (Array.isArray(dpr?.staff) ? dpr.staff : []),
    [dpr],
  );

  // Item name + UOM are denormalized onto each material line by the DPR
  // detail API, so no full item/uom master load is needed here.
  const { data: contractorsResult } = useContractors();
  const contractorNameById = useMemo(
    () => new Map((contractorsResult?.data ?? []).map((c) => [c.id, c.name])),
    [contractorsResult],
  );

  // Work Done rows store `woId`; resolve it to a readable Contractor / WO
  // label so the detail table matches the DPR form's Contractor/WO column.
  const { data: workOrdersResult } = useWorkOrders(
    dpr?.projectId ? { projectId: dpr.projectId } : undefined,
  );
  const woLabelById = useMemo(
    () =>
      new Map(
        (workOrdersResult?.data ?? []).map((wo) => [
          wo.id,
          wo.woNumber
            ? `${wo.woNumber}${wo.contractorName ? ` · ${wo.contractorName}` : ""}`
            : wo.contractorName ?? "",
        ]),
      ),
    [workOrdersResult],
  );

  // ── Over-allotment check (for the approver) ──────────────────────
  // The site user is warned at entry time in the DPR form; here we
  // re-check against live stock so the approving manager sees, before
  // approving, whether any consumed quantity exceeds what's actually
  // allotted at the consumption location. Same (project, location, item)
  // scope the approval deducts against.
  const dprProjectId = dpr?.projectId ?? "";
  const consumptionLocationId = dpr?.consumptionLocationId ?? "";
  const [stockByItem, setStockByItem] = useState<Record<string, number>>({});
  const materialItemIdsKey = useMemo(
    () =>
      Array.from(new Set(materials.map((m) => m.itemId ?? "").filter(Boolean)))
        .sort()
        .join(","),
    [materials],
  );
  useEffect(() => {
    const ids = materialItemIdsKey ? materialItemIdsKey.split(",") : [];
    if (!dprProjectId || !consumptionLocationId || ids.length === 0) {
      setStockByItem({});
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const results = await Promise.all(
          ids.map(async (itemId) => {
            const params = new URLSearchParams({
              itemId,
              projectId: dprProjectId,
              locationId: consumptionLocationId,
            });
            const res = await fetch(`/api/store/stock-balance?${params.toString()}`);
            if (!res.ok) return null;
            const json = await res.json();
            return { itemId, qty: Number(json?.quantity ?? 0) };
          }),
        );
        if (cancelled) return;
        const next: Record<string, number> = {};
        for (const r of results) {
          if (r) next[r.itemId] = r.qty;
        }
        setStockByItem(next);
      } catch {
        if (!cancelled) setStockByItem({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dprProjectId, consumptionLocationId, materialItemIdsKey]);

  // Rows whose consumed qty exceeds the allotted stock at the location.
  const overAllotted = useMemo(
    () =>
      materials.flatMap((m) => {
        const itemId = m.itemId ?? "";
        if (!itemId || !(itemId in stockByItem)) return [];
        const available = stockByItem[itemId];
        const consumed = Number(m.consumedQty ?? 0);
        if (consumed <= available) return [];
        return [
          {
            itemId,
            name: m.itemName || itemId,
            unit: m.uomCode || "",
            consumed,
            available,
          },
        ];
      }),
    [materials, stockByItem],
  );

  // ApprovalTimeline expects { step, action, actionBy, actionAt, comments }.
  const approvalEntries =
    dpr?.approval?.history?.map((h: ApprovalHistoryEntry) => ({
      step: h.stepOrder ?? 0,
      action: h.action,
      actionBy: h.actionByName ?? "User",
      actionAt: h.actionAt ? formatDateTimeIST(h.actionAt) : "",
      comments: h.comments ?? undefined,
    })) ?? [];

  if (isLoading) return <PageSkeleton />;
  if (!dpr) {
    return (
      <>
        <PageHeader
          title="DPR"
          breadcrumbs={[
            { label: "Projects", href: "/projects" },
            { label: "DPR", href: "/projects/dpr" },
            { label: id },
          ]}
          onBack={() => router.push("/projects/dpr")}
        />
        <PageContainer>
          <p className="text-gray-500 py-12 text-center">DPR not found.</p>
        </PageContainer>
      </>
    );
  }

  const status = String(dpr.status ?? "draft").toLowerCase();
  const isDraft = status === "draft";
  const isPending = status === "submitted" || status === "approved_l1";
  const isApproved = status === "approved";
  const isInactive = status === "inactive";
  const baseLocked = isApproved || isInactive;

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await deleteMutation.mutateAsync(id);
      setDeleteConfirm(false);
      router.push("/projects/dpr");
    } catch { /* error toast handled globally */ }
    finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <PageHeader
        title={dpr.dprNumber ?? `DPR ${id}`}
        subtitle={
          dpr.projectName
            ? `${dpr.projectName}${dpr.reportDate ? ` · ${fmtDate(dpr.reportDate)}` : ""}`
            : "Daily Progress Report"
        }
        breadcrumbs={[
          { label: "Projects", href: "/projects" },
          { label: "DPR", href: "/projects/dpr" },
          { label: dpr.dprNumber ?? id },
        ]}
        onBack={() => router.push("/projects/dpr")}
        actions={
          <div className="flex items-center gap-2">
            <span className={`${HEADER_PILL} ${statusPillTone(dpr.status)}`}>
              {statusLabel(dpr.status)}
            </span>
            {canEdit && (
              <button
                type="button"
                onClick={() =>
                  !baseLocked && router.push(`/projects/dpr/${id}/edit`)
                }
                disabled={baseLocked}
                className={`${HEADER_PILL} ${
                  baseLocked
                    ? `${PILL_TONE.disabled} cursor-not-allowed`
                    : `${PILL_TONE.blue} hover:bg-accent-100`
                }`}
                title={baseLocked ? "Locked — DPR is approved" : "Edit DPR"}
              >
                <Pencil className="w-4 h-4" /> Edit
              </button>
            )}
            {canDelete && !baseLocked && (
              <button
                type="button"
                onClick={() => setDeleteConfirm(true)}
                className={`${HEADER_PILL} ${PILL_TONE.rose} hover:bg-rose-100`}
              >
                <Trash2 className="w-4 h-4" /> Delete
              </button>
            )}
            {isDraft && canSubmit && (
              <button
                type="button"
                onClick={() => workflow.open("submit")}
                className={`${HEADER_PILL} ${PILL_TONE.orange} hover:bg-orange-100`}
              >
                <Send className="w-4 h-4" /> Submit for Approval
              </button>
            )}
            {isPending && canApprove && (
              <>
                <button
                  type="button"
                  onClick={() => workflow.open("approve")}
                  className={`${HEADER_PILL} ${PILL_TONE.emerald} hover:bg-emerald-100`}
                >
                  <Check className="w-4 h-4" /> Approve
                </button>
                <button
                  type="button"
                  onClick={() => workflow.open("reject")}
                  className={`${HEADER_PILL} ${PILL_TONE.rose} hover:bg-rose-100`}
                >
                  <XIcon className="w-4 h-4" /> Reject
                </button>
              </>
            )}
            {isPending && !canApprove && (
              <span className={`${HEADER_PILL} ${PILL_TONE.amber}`}>
                Awaiting approver
              </span>
            )}
            {isApproved && (
              <span className={`${HEADER_PILL} ${PILL_TONE.emerald}`}>
                <Check className="w-4 h-4" /> Locked — approved
              </span>
            )}
          </div>
        }
      />

      <PageContainer>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <RepairApprovalNotice
              repair={dpr.approval?.repair}
              entityLabel="DPR"
              actionEndpoint={`/api/projects/dpr/${id}/approve`}
              invalidateKeys={[["dprs"], ["dpr", id]]}
              me={me}
            />

            {/* ── Overview ──────────────────────────────────────── */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900">
                  Overview
                </h2>
                <StatusChip status={dpr.status ?? "draft"} />
              </div>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5 px-6 py-5 text-sm">
                <Stat label="Project">
                  <span className="font-medium text-gray-900 truncate">
                    {dpr.projectName ?? "—"}
                  </span>
                </Stat>
                <Stat label="DPR Number">
                  <span className="text-xs font-semibold text-gray-900 px-1.5 py-0.5 rounded bg-sky-50 border border-sky-100">
                    {dpr.dprNumber ?? "—"}
                  </span>
                </Stat>
                <Stat label="Report Date">
                  <span className="text-gray-900">
                    {fmtDate(dpr.reportDate)}
                  </span>
                </Stat>
                <div className="sm:col-span-2">
                  <Stat label="Weather">
                    <div className="flex flex-col gap-2 min-w-0 w-full">
                      <span className="text-gray-900 capitalize">
                        {dpr.weatherCondition || "—"}
                      </span>
                      <DPRWeatherMetrics
                        detail={parseStoredWeatherDetail(dpr.weatherDetail)}
                        className="text-gray-800 sm:grid-cols-4"
                      />
                    </div>
                  </Stat>
                </div>
                <Stat label="Activities Reported">
                  <span className="text-gray-900 tabular-nums">
                    {workItems.length}
                  </span>
                </Stat>
                <Stat label="Status">
                  <StatusChip status={dpr.status ?? "draft"} />
                </Stat>
              </dl>
              {dpr.siteRemarks && (
                <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50">
                  <div className="min-w-0">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-0.5">
                      Site Remarks
                    </div>
                    <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
                      {dpr.siteRemarks}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* ── Work Done ─────────────────────────────────────── */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900">
                  Work Done
                </h2>
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-full">
                  {workItems.length} item{workItems.length === 1 ? "" : "s"}
                </span>
              </div>
              {workItems.length === 0 ? (
                <p className="px-6 py-8 text-center text-sm text-gray-500">
                  No work items recorded.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 text-[10px] uppercase text-gray-500 tracking-wider border-b border-gray-200">
                      <tr className="whitespace-nowrap">
                        <th className="px-4 py-3 text-left font-bold w-10">
                          #
                        </th>
                        <th className="px-4 py-3 text-left font-bold">
                          BOQ Ref
                        </th>
                        <th className="px-4 py-3 text-left font-bold min-w-[240px]">
                          Description
                        </th>
                        <th className="px-4 py-3 text-left font-bold">
                          Unit
                        </th>
                        <th className="px-4 py-3 text-right font-bold">
                          Total Target
                        </th>
                        <th className="px-4 py-3 text-left font-bold min-w-[150px]">
                          Contractor / WO
                        </th>
                        <th className="px-4 py-3 text-right font-bold">
                          Prev Qty
                        </th>
                        <th className="px-4 py-3 text-right font-bold">
                          Today's Qty
                        </th>
                        <th className="px-4 py-3 text-right font-bold">
                          Cumulative
                        </th>
                        <th className="px-4 py-3 text-right font-bold">
                          % Completed
                        </th>
                        <th className="px-4 py-3 text-left font-bold min-w-[130px]">
                          Location / Chainage
                        </th>
                        <th className="px-4 py-3 text-left font-bold min-w-[130px]">
                          Remarks
                        </th>
                        <th className="px-4 py-3 text-left font-bold">
                          Photos
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {groupedWorkItems.map((group) => (
                        <Fragment key={group.key}>
                          {group.topNo && (
                            <tr className="bg-accent-50 border-t border-accent-100">
                              <td colSpan={13} className="px-4 py-2">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold text-accent-700 bg-accent-100">
                                    {group.topNo}
                                  </span>
                                  {group.topName && (
                                    <span className="text-xs font-semibold text-slate-600 truncate">
                                      {group.topName}
                                    </span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                          {group.rendered.map((node) =>
                            node.kind === "subgroup" ? (
                              <tr
                                key={`sub-${group.key}-${node.no}`}
                                className="bg-accent-50"
                              >
                                <td
                                  colSpan={13}
                                  className="py-1.5"
                                  style={{
                                    paddingLeft: `${node.depth * 16 + 16}px`,
                                    paddingRight: 16,
                                  }}
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="text-accent-300 shrink-0">└</span>
                                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold text-accent-700 bg-accent-100">
                                      {node.no}
                                    </span>
                                    {node.name && (
                                      <span className="text-[11px] font-medium text-slate-500 truncate">
                                        {node.name}
                                      </span>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            ) : (
                              <tr
                                key={`it-${group.key}-${node.idx}`}
                                className="hover:bg-accent-50 transition-colors align-top"
                              >
                                <td className="px-4 py-3 text-xs text-gray-400 tabular-nums">
                                  {String(node.idx + 1).padStart(2, "0")}
                                </td>
                                <td
                                  className="px-4 py-3 text-xs text-accent-700 font-bold"
                                  style={
                                    node.depth > 1
                                      ? { paddingLeft: `${node.depth * 16 + 16}px` }
                                      : undefined
                                  }
                                >
                                  {node.w.boqNo ?? node.w.boqItemId ?? "—"}
                                </td>
                                <td className="px-4 py-3 text-gray-900">
                                  <div
                                    className="truncate max-w-[260px]"
                                    title={node.w.description ?? undefined}
                                  >
                                    {node.w.description ?? "—"}
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-gray-700 text-xs">
                                  {node.w.unit || "—"}
                                </td>
                                <td className="px-4 py-3 text-right tabular-nums text-gray-900">
                                  {fmtQty(node.w.totalTarget)}
                                </td>
                                <td className="px-4 py-3 text-gray-700 text-xs">
                                  {node.w.workOrderId
                                    ? woLabelById.get(node.w.workOrderId) ||
                                      node.w.workOrderId
                                    : "Self Work"}
                                </td>
                                <td className="px-4 py-3 text-right tabular-nums text-gray-900">
                                  {fmtQty(node.w.prevQty)}
                                </td>
                                <td className="px-4 py-3 text-right tabular-nums text-gray-900">
                                  {fmtQty(node.w.todayQty)}
                                </td>
                                <td className="px-4 py-3 text-right tabular-nums text-gray-900">
                                  {fmtQty(node.w.cumulativeQty)}
                                </td>
                                <td className="px-4 py-3 text-right tabular-nums text-gray-900">
                                  {(() => {
                                    const target = Number(node.w.totalTarget ?? 0);
                                    const cum = Number(node.w.cumulativeQty ?? 0);
                                    if (!(target > 0)) return "—";
                                    return `${Math.min(100, (cum / target) * 100).toFixed(1)}%`;
                                  })()}
                                </td>
                                <td className="px-4 py-3 text-gray-700 text-xs">
                                  {node.w.location || "—"}
                                </td>
                                <td className="px-4 py-3 text-gray-700 text-xs">
                                  {node.w.remarks ?? "—"}
                                </td>
                                <td className="px-4 py-3">
                                  {Array.isArray(node.w.images) &&
                                  node.w.images.length > 0 ? (
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      {node.w.images.map((src, j) => (
                                        <a
                                          key={j}
                                          href={src}
                                          target="_blank"
                                          rel="noreferrer"
                                          title="Open full size"
                                          className="block w-10 h-10 rounded-md overflow-hidden border border-gray-200 bg-gray-50 hover:ring-2 hover:ring-accent-300 transition"
                                        >
                                          {/* eslint-disable-next-line @next/next/no-img-element */}
                                          <img
                                            src={src}
                                            alt="Site photo"
                                            className="w-full h-full object-cover"
                                          />
                                        </a>
                                      ))}
                                    </div>
                                  ) : (
                                    <span className="text-gray-300 text-xs">—</span>
                                  )}
                                </td>
                              </tr>
                            ),
                          )}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* ── Materials Consumed ────────────────────────────── */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900">
                  Materials Consumed
                </h2>
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-full">
                  {materials.length} item{materials.length === 1 ? "" : "s"}
                </span>
              </div>
              {materials.length === 0 ? (
                <p className="px-6 py-8 text-center text-sm text-gray-500">
                  No materials recorded.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  {overAllotted.length > 0 && (
                    <div className="mx-4 mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      <div className="leading-snug">
                        <span className="font-semibold">
                          Heads up — consumption exceeds the allotted stock at this location.
                        </span>{" "}
                        You can still approve; this is just to flag the over-use:
                        <ul className="mt-1 list-disc pl-5">
                          {overAllotted.map((o) => (
                            <li key={o.itemId}>
                              <span className="font-medium">{o.name}</span> — consumed{" "}
                              {o.consumed.toLocaleString("en-IN")} {o.unit}, only{" "}
                              {o.available.toLocaleString("en-IN")} {o.unit} allotted here.
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 text-[10px] uppercase text-gray-500 tracking-wider border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 text-left font-bold w-10">#</th>
                        <th className="px-4 py-3 text-left font-bold">Material</th>
                        <th className="px-4 py-3 text-left font-bold">Unit</th>
                        <th className="px-4 py-3 text-right font-bold">Consumed Qty</th>
                        <th className="px-4 py-3 text-left font-bold">Remarks</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {materials.map((m: MaterialRow, idx: number) => {
                        const itemId = m.itemId ?? "";
                        const available =
                          itemId && itemId in stockByItem ? stockByItem[itemId] : null;
                        const over =
                          available != null && Number(m.consumedQty ?? 0) > available;
                        const unit = m.uomCode || "";
                        return (
                        <tr
                          key={idx}
                          className={`transition-colors ${
                            over ? "bg-red-50/60 hover:bg-red-50" : "hover:bg-accent-50"
                          }`}
                        >
                          <td className="px-4 py-3 text-xs text-gray-400 tabular-nums">
                            {String(idx + 1).padStart(2, "0")}
                          </td>
                          <td className="px-4 py-3 text-gray-900">
                            {m.itemName || m.itemId || "—"}
                          </td>
                          <td className="px-4 py-3 text-gray-600 uppercase">
                            {m.uomCode || "—"}
                          </td>
                          <td
                            className={`px-4 py-3 text-right tabular-nums ${
                              over ? "text-red-700 font-semibold" : "text-gray-900"
                            }`}
                          >
                            {fmtQty(m.consumedQty)}
                            {over && available != null && (
                              <div className="text-[10px] font-normal text-red-600">
                                only {available.toLocaleString("en-IN")} {unit} allotted
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-gray-700 text-xs">
                            {m.remarks ?? "—"}
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* ── Manpower Deployed ─────────────────────────────── */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900">
                  Manpower Deployed
                </h2>
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-full">
                  {manpower.length} entr{manpower.length === 1 ? "y" : "ies"}
                </span>
              </div>
              {manpower.length === 0 ? (
                <p className="px-6 py-8 text-center text-sm text-gray-500">
                  No manpower recorded.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 text-[10px] uppercase text-gray-500 tracking-wider border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 text-left font-bold w-10">#</th>
                        <th className="px-4 py-3 text-left font-bold">Contractor</th>
                        <th className="px-4 py-3 text-left font-bold">Working Area</th>
                        <th className="px-4 py-3 text-right font-bold">Messan</th>
                        <th className="px-4 py-3 text-right font-bold">Male H.</th>
                        <th className="px-4 py-3 text-right font-bold">Female H.</th>
                        <th className="px-4 py-3 text-right font-bold">Carp.</th>
                        <th className="px-4 py-3 text-right font-bold">Fitter</th>
                        <th className="px-4 py-3 text-right font-bold">Painter</th>
                        <th className="px-4 py-3 text-right font-bold">Plumber</th>
                        <th className="px-4 py-3 text-right font-bold">Elec.</th>
                        <th className="px-4 py-3 text-right font-bold">Operator</th>
                        <th className="px-4 py-3 text-right font-bold">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {manpower.map((mp: ManpowerRow, idx: number) => {
                        const rowTotal = [
                          mp.messan,
                          mp.maleHelper,
                          mp.femaleHelper,
                          mp.carpenter,
                          mp.fitter,
                          mp.painter,
                          mp.plumber,
                          mp.electrician,
                          mp.operator,
                        ].reduce<number>((sum, v) => sum + (Number(v) || 0), 0);
                        return (
                        <tr key={idx} className="hover:bg-accent-50 transition-colors">
                          <td className="px-4 py-3 text-xs text-gray-400 tabular-nums">
                            {String(idx + 1).padStart(2, "0")}
                          </td>
                          <td className="px-4 py-3 text-gray-900">
                            {contractorNameById.get(mp.contractorId ?? "") ?? "Self / —"}
                          </td>
                          <td className="px-4 py-3 text-gray-900">
                            {mp.workingArea ? mp.workingArea : "—"}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-gray-900">
                            {fmtQty(mp.messan)}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-gray-900">
                            {fmtQty(mp.maleHelper)}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-gray-900">
                            {fmtQty(mp.femaleHelper)}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-gray-900">
                            {fmtQty(mp.carpenter)}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-gray-900">
                            {fmtQty(mp.fitter)}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-gray-900">
                            {fmtQty(mp.painter)}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-gray-900">
                            {fmtQty(mp.plumber)}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-gray-900">
                            {fmtQty(mp.electrician)}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-gray-900">
                            {fmtQty(mp.operator)}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums font-semibold text-accent-600">
                            {Number.isInteger(rowTotal) ? rowTotal : rowTotal.toFixed(2)}
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* ── Staff ─────────────────────────────────────────── */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900">Staff</h2>
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-full">
                  {staff.length} member{staff.length === 1 ? "" : "s"}
                </span>
              </div>
              {staff.length === 0 ? (
                <p className="px-6 py-8 text-center text-sm text-gray-500">
                  No staff recorded.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 text-[10px] uppercase text-gray-500 tracking-wider border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 text-left font-bold w-10">#</th>
                        <th className="px-4 py-3 text-left font-bold">Name</th>
                        <th className="px-4 py-3 text-left font-bold">Designation</th>
                        <th className="px-4 py-3 text-left font-bold">Attendance</th>
                        <th className="px-4 py-3 text-left font-bold">Reason</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {staff.map((s: StaffRow, idx: number) => (
                        <tr key={idx} className="hover:bg-accent-50 transition-colors">
                          <td className="px-4 py-3 text-xs text-gray-400 tabular-nums">
                            {String(idx + 1).padStart(2, "0")}
                          </td>
                          <td className="px-4 py-3 text-gray-900">{s.name ?? "—"}</td>
                          <td className="px-4 py-3 text-gray-700">{s.designation || "—"}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                                s.present
                                  ? "bg-green-50 text-green-700 border border-green-200"
                                  : "bg-red-50 text-red-700 border border-red-200"
                              }`}
                            >
                              {s.present ? "Present" : "Absent"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-700 text-xs">
                            {s.present ? "—" : s.reason || "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* ── Machinery Deployed ────────────────────────────── */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-900">
                  Machinery Deployed
                </h2>
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-full">
                  {machinery.length} entr{machinery.length === 1 ? "y" : "ies"}
                </span>
              </div>
              {machinery.length === 0 ? (
                <p className="px-6 py-8 text-center text-sm text-gray-500">
                  No machinery recorded.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50 text-[10px] uppercase text-gray-500 tracking-wider border-b border-gray-200">
                      <tr>
                        <th className="px-4 py-3 text-left font-bold w-10">#</th>
                        <th className="px-4 py-3 text-left font-bold">Machinery / Equipment</th>
                        <th className="px-4 py-3 text-left font-bold">Condition</th>
                        <th className="px-4 py-3 text-right font-bold">Required</th>
                        <th className="px-4 py-3 text-right font-bold">Actual</th>
                        <th className="px-4 py-3 text-left font-bold">Remarks</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {machinery.map((mc: MachineryRow, idx: number) => (
                        <tr key={idx} className="hover:bg-accent-50 transition-colors">
                          <td className="px-4 py-3 text-xs text-gray-400 tabular-nums">
                            {String(idx + 1).padStart(2, "0")}
                          </td>
                          <td className="px-4 py-3 text-gray-900">
                            {mc.description ?? "—"}
                          </td>
                          <td className="px-4 py-3 text-gray-700">
                            {mc.condition ?? "—"}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-gray-900">
                            {mc.requiredQty ?? 0}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-gray-900">
                            {mc.actualQty ?? 0}
                          </td>
                          <td className="px-4 py-3 text-gray-700 text-xs">
                            {mc.remarks ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Page-level error banner — used when an action fails AFTER
                the modal closes (rare); the dialog itself also shows
                inline errors via WorkflowConfirmDialog's `error` prop. */}
            {workflow.error && !workflow.action && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-3 text-sm text-amber-800 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>{workflow.error}</div>
              </div>
            )}
          </div>

          {/* ── Right sidebar: Approval Timeline + Audit ──────────── */}
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">
                Approval Timeline
              </h3>
              {!dpr.approval ? (
                <p className="text-sm text-gray-500">
                  Not yet submitted for approval.
                </p>
              ) : approvalEntries.length === 0 ? (
                <p className="text-sm text-gray-500">
                  Submitted, but no approval activity yet.
                </p>
              ) : (
                <ApprovalTimeline entries={approvalEntries} />
              )}

              {/* Workflow steps preview — shows who approves at each
                  step so the raiser/reviewer knows what's coming. */}
              {dpr.approval?.workflow?.steps?.length ? (
                <div className="mt-5 pt-4 border-t border-gray-100">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-2">
                    Workflow steps
                  </div>
                  <ol className="space-y-1.5 text-xs">
                    {(dpr.approval?.workflow?.steps ?? []).map((s: ApprovalStep) => {
                      const isCurrent =
                        s.stepOrder === dpr.approval?.currentStepOrder;
                      return (
                        <li
                          key={s.stepOrder}
                          className={`flex items-start gap-2 ${
                            isCurrent ? "font-semibold text-gray-900" : "text-gray-600"
                          }`}
                        >
                          <span
                            className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold shrink-0 mt-0.5 ${
                              isCurrent
                                ? "bg-amber-100 text-amber-800"
                                : "bg-gray-100 text-gray-500"
                            }`}
                          >
                            {s.stepOrder}
                          </span>
                          <span className="min-w-0">
                            {s.approverUserName ??
                              s.approverRoleId ??
                              "Auto-approve"}
                            {isCurrent && (
                              <span className="ml-1 text-[10px] uppercase tracking-wider text-amber-700">
                                · current
                              </span>
                            )}
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              ) : null}
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Audit</h3>
              <div className="space-y-3 text-xs">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                    Created
                  </div>
                  <div className="mt-0.5 text-gray-900">
                    {formatDateTimeIST(dpr.createdAt)}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                    Created By
                  </div>
                  <div className="mt-0.5 text-gray-900">
                    {dpr.createdByName ?? dpr.createdBy ?? "—"}
                  </div>
                </div>
                {dpr.updatedAt && (
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                      Last Updated
                    </div>
                    <div className="mt-0.5 text-gray-900">
                      {formatDateTimeIST(dpr.updatedAt)}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </PageContainer>

      <ConfirmDialog
        open={deleteConfirm}
        onClose={() => !deleting && setDeleteConfirm(false)}
        onConfirm={confirmDelete}
        loading={deleting}
        tone="danger"
        title="Delete DPR"
        confirmLabel="Delete"
        message={
          <>
            Mark{" "}
            <span className="font-semibold text-gray-900">
              {dpr.dprNumber ?? id}
            </span>{" "}
            as inactive? It will be hidden from the list.
          </>
        }
      />

      <WorkflowConfirmDialog
        action={workflow.action}
        pending={workflow.pending}
        rejectReason={workflow.rejectReason}
        onRejectReasonChange={workflow.setRejectReason}
        onClose={workflow.close}
        onConfirm={workflow.run}
        entityNoun="DPR"
        entityLabel={dpr.dprNumber ?? id}
        approveHint="On approval the reported quantities are posted to the BOQ progress ledger and the DPR becomes locked."
        rejectPlaceholder="e.g. quantities don't match the site photos — please re-check chainage 100-200"
        error={workflow.error}
      />
    </>
  );
}

function Stat({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start min-w-0">
      <div className="min-w-0">
        <dt className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
          {label}
        </dt>
        <dd className="mt-0.5 flex items-center gap-2 min-w-0">{children}</dd>
      </div>
    </div>
  );
}
