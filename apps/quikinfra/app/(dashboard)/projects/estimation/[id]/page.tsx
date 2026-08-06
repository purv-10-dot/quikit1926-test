"use client";

/**
 * Material Estimation — read-only detail page.
 *
 * Edit routes to the full-page edit form at /projects/estimation/[id]/edit
 * (the same WorkOrder-style form the list's Edit pencil opens), so the
 * edit experience is identical from every entry point. The inline-edit
 * branches below are dormant (isEditing never flips true) and kept only
 * so the workflow / overview markup stays intact.
 */

import { formatDateTimeIST } from "@/lib/format/datetime";
import { MasterApprovalAction } from "@/components/MasterApprovalAction";
import { usePermissions } from "@/hooks/use-permissions";
import { RepairApprovalNotice } from "@/components/RepairApprovalNotice";
import { useParams } from "next/navigation";
import {
  Check,
  Pencil,
  Send,
  X as XIcon,
  AlertTriangle,
} from "lucide-react";
import {
  PageHeader,
  PageContainer,
  PageSkeleton,
  StatusChip,
  ApprovalTimeline,
} from "@/components/PageShell";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { SelectInput } from "@/components/FormDrawer";
import {
  PILL_TONE, statusPillTone, statusLabel, PHASES, STATUSES,
  fmtQty, fmtInr,
} from "./lib/shared";
import { OverviewStat } from "./components/OverviewStat";
import { MaterialCompositionCard } from "./components/MaterialCompositionCard";
import { useEstimationDetail } from "./lib/useEstimationDetail";

/**
 * Shared template for every element in the PageHeader actions row.
 * Same padding, radius, height, font-weight, icon size — only the
 * tone (see PILL_TONE) changes. Keeps Status · Edit · Submit reading
 * as a single coordinated group instead of three ad-hoc controls.
 */
const HEADER_PILL =
  "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap shrink-0";


export default function EstimationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { me } = usePermissions();
  const {
    router,
    estimation,
    isLoading,
    canEdit,
    canSubmit,
    canApprove,
    workflowAction,
    rejectReason,
    setRejectReason,
    workflowPending,
    workflowError,
    isEditing,
    phase,
    setPhase,
    editStatus,
    setEditStatus,
    lines,
    saving,
    saveError,
    itemGroups,
    status,
    isDraft,
    isPending,
    isApproved,
    isRejected,
    baseLocked,
    lockReason,
    materials,
    editTotals,
    openWorkflow,
    closeWorkflow,
    runWorkflowAction,
    cancelEdit,
    updateLine,
    addLine,
    removeLine,
    saveEdit,
    approvalEntries,
  } = useEstimationDetail(id);

  if (isLoading) return <PageSkeleton />;
  if (!estimation) {
    return (
      <>
        <PageHeader
          title="Material Estimation"
          breadcrumbs={[
            { label: "Projects", href: "/projects" },
            { label: "Material Estimation", href: "/projects/estimation" },
            { label: id },
          ]}
          onBack={() => router.push("/projects/estimation")}
        />
        <PageContainer>
          <p className="text-gray-500 py-12 text-center">
            Estimation not found.
          </p>
        </PageContainer>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={estimation.boqNo ?? `Estimation ${id}`}
        subtitle={
          estimation.boqDescription
            ? `${estimation.boqDescription}`
            : "Material Estimation"
        }
        breadcrumbs={[
          { label: "Projects", href: "/projects" },
          { label: "Material Estimation", href: "/projects/estimation" },
          { label: estimation.boqNo ?? id },
        ]}
        onBack={() => router.push("/projects/estimation")}
        actions={
          // Unified pill design: every element in the header actions
          // row uses the exact same base template (see HEADER_PILL
          // below) — identical height, padding, radius, icon size, and
          // font weight. The only per-role difference is the tone (gray
          // / blue / orange / emerald / rose / amber). Keeps the three
          // elements — Status · Edit · Submit — reading as a single
          // coordinated group rather than three ad-hoc controls.
          <div className="flex items-center gap-2">
            {isEditing && (
              <>
                <span className={`${HEADER_PILL} ${PILL_TONE.amber}`}>
                  <Pencil className="w-4 h-4" /> Editing
                </span>
                <button
                  type="button"
                  onClick={cancelEdit}
                  disabled={saving}
                  className={`${HEADER_PILL} ${PILL_TONE.gray} hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveEdit}
                  disabled={saving}
                  className={`${HEADER_PILL} ${PILL_TONE.orange} hover:bg-orange-100 disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <Check className="w-4 h-4" />
                  {saving ? "Saving…" : "Save Changes"}
                </button>
              </>
            )}
            {!isEditing && (
              <>
                <span className={`${HEADER_PILL} ${statusPillTone(estimation.status)}`}>
                  {statusLabel(estimation.status)}
                </span>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() =>
                      !baseLocked && router.push(`/projects/estimation/${id}/edit`)
                    }
                    disabled={baseLocked}
                    className={`${HEADER_PILL} ${
                      baseLocked
                        ? `${PILL_TONE.disabled} cursor-not-allowed`
                        : `${PILL_TONE.blue} hover:bg-orange-100`
                    }`}
                    title={baseLocked ? lockReason ?? "Locked" : "Edit estimation"}
                  >
                    <Pencil className="w-4 h-4" /> Edit
                  </button>
                )}
                {isDraft && canSubmit && (
                  <button
                    type="button"
                    onClick={() => openWorkflow("submit")}
                    className={`${HEADER_PILL} ${PILL_TONE.orange} hover:bg-orange-100`}
                  >
                    <Send className="w-4 h-4" /> Submit for Approval
                  </button>
                )}
                <MasterApprovalAction
                  approval={estimation?.approval}
                  me={me}
                  entityLabel="estimation"
                  actionEndpoint={`/api/estimations/${id}/approve`}
                  invalidateKeys={[["estimations"], ["estimation", id]]}
                />
                {isPending && canApprove && (
                  <>
                    <button
                      type="button"
                      onClick={() => openWorkflow("approve")}
                      className={`${HEADER_PILL} ${PILL_TONE.emerald} hover:bg-emerald-100`}
                    >
                      <Check className="w-4 h-4" /> Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => openWorkflow("reject")}
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
              </>
            )}
          </div>
        }
      />

      <PageContainer>
        {/* Two-column layout matching the PR / PO detail pages: main
            content stack on the left, Approval Timeline + Audit pinned
            in a right sidebar so reviewers always see the audit trail
            next to the totals without scrolling. Collapses to a single
            column under lg. */}
        <RepairApprovalNotice
          repair={estimation?.approval?.repair}
          entityLabel="estimation"
          actionEndpoint={`/api/estimations/${id}/approve`}
          invalidateKeys={[["estimations"], ["estimation", id]]}
          me={me}
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className={`${isEditing ? "lg:col-span-3" : "lg:col-span-2"} space-y-6`}>
          {/* Inline save-error banner — surfaces failures from the edit
              save path right above the Overview card instead of in the
              action strip (which is now in the header). */}
          {isEditing && saveError && (
            <div className="bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 text-xs text-rose-800 flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              {saveError}
            </div>
          )}

          {/* ── Overview card ─────────────────────────────────────────
              Two-zone layout: stat grid on the left, KPI callouts on the
              right. Each stat gets a tinted icon so the eye can scan the
              fields without reading every label. The BOQ Item description
              moves into its own accent-bordered quote block below so long
              lines don't crowd the stat grid. */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">Overview</h2>
              {!isEditing && (
                <StatusChip status={estimation.status ?? "draft"} />
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-0">
              {/* Left: stat grid */}
              <dl className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-5 px-6 py-5 text-sm">
                <OverviewStat label="Project">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <span className="font-medium text-gray-900 truncate">
                      {estimation.projectName ?? "—"}
                    </span>
                    {estimation.scopeType === "ACTIVITY" && (
                      <span className="shrink-0 whitespace-nowrap rounded bg-accent-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-accent-700 border border-accent-200">
                        Free-Scope
                      </span>
                    )}
                  </span>
                </OverviewStat>

                <OverviewStat label="BOQ No">
                  <span className="text-xs font-semibold text-gray-900 px-1.5 py-0.5 rounded bg-sky-50 border border-sky-100">
                    {estimation.boqNo ?? "—"}
                  </span>
                </OverviewStat>

                <OverviewStat label="Phase">
                  {isEditing ? (
                    <SelectInput
                      value={phase}
                      onChange={setPhase}
                      placeholder="Select phase…"
                      options={PHASES.map((p) => ({ value: p, label: p }))}
                    />
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-violet-700 bg-violet-50 border border-violet-100 px-2 py-0.5 rounded-md">
                      {estimation.phase ?? "—"}
                    </span>
                  )}
                </OverviewStat>

                <OverviewStat label="BOQ Quantity">
                  {Number(estimation.boqQuantity) > 0 ? (
                    <span className="font-medium text-gray-900 tabular-nums">
                      {fmtQty(estimation.boqQuantity, estimation.boqUnit)}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                      <AlertTriangle className="w-3 h-3" />
                      Not set — totals will read 0
                    </span>
                  )}
                </OverviewStat>

                <OverviewStat label="Status">
                  {isEditing ? (
                    <SelectInput
                      value={editStatus}
                      onChange={setEditStatus}
                      options={STATUSES.map((s) => ({ value: s, label: s }))}
                    />
                  ) : (
                    <StatusChip status={estimation.status ?? "draft"} />
                  )}
                </OverviewStat>

                <OverviewStat label="Materials">
                  <span className="font-medium text-gray-900 tabular-nums">
                    {isEditing
                      ? lines.filter((l) => l.itemId).length
                      : (estimation.materialCount ?? materials.length)}
                  </span>
                </OverviewStat>
              </dl>

              {/* Right: KPI callouts. Stacked on lg+ screens so they
                  anchor the right edge the way a classic dashboard KPI
                  panel does. On mobile they collapse under the stat grid. */}
              <div className="lg:col-span-4 bg-gradient-to-br from-gray-50 to-white border-t lg:border-t-0 lg:border-l border-gray-100 p-5 flex flex-col gap-3">
                <div className="rounded-lg bg-white border border-gray-200 px-4 py-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                    Total Qty
                  </div>
                  <div className="mt-1 text-lg font-bold text-gray-900 tabular-nums">
                    {isEditing
                      ? fmtQty(editTotals.totalQty)
                      : fmtQty(estimation.totalQty)}
                  </div>
                </div>
                <div className="rounded-lg bg-gradient-to-br from-orange-50 to-sky-50 border border-orange-200 px-4 py-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-orange-700">
                    Estimated Cost
                  </div>
                  <div className="mt-1 text-2xl font-extrabold text-orange-700 tabular-nums">
                    {isEditing
                      ? fmtInr(editTotals.totalCost)
                      : fmtInr(estimation.totalCost)}
                  </div>
                </div>
              </div>
            </div>

            {/* BOQ Item description — anchored to its own row so long
                text doesn't wreck the stat grid alignment. Left indigo
                bar marks it as a reference detail, not a stat. */}
            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50">
              <div className="min-w-0">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-0.5">
                  BOQ Item
                </div>
                <p className="text-sm text-gray-800 leading-relaxed">
                  {estimation.boqDescription ?? "—"}
                </p>
              </div>
            </div>
          </div>

          {/* ── Material composition table ───────────────────────── */}
          <MaterialCompositionCard
            isEditing={isEditing}
            materials={materials}
            lines={lines}
            itemGroups={itemGroups}
            editTotals={editTotals}
            updateLine={updateLine}
            addLine={addLine}
            removeLine={removeLine}
            estimation={estimation}
          />

          {!isEditing && isRejected && estimation.rejectionReason && (
            <div className="bg-rose-50 border border-rose-200 rounded-xl px-5 py-4 text-sm text-rose-800">
              <div className="font-semibold mb-1">Rejection reason</div>
              <div>{estimation.rejectionReason}</div>
            </div>
          )}

          </div>

          {/* ── Right sidebar: Approval Timeline + Audit ──────────────
              Mirrors the PR / PO detail pattern so reviewers see who
              acted (and when) right next to the totals, not buried
              under the materials table. The Audit panel below it shows
              who created the estimation. Hidden in edit mode to keep
              the editing canvas focused. */}
          {!isEditing && (
            <div className="space-y-6">
              {/* Approval Timeline */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                <h3 className="text-sm font-semibold text-gray-900 mb-4">
                  Approval Timeline
                </h3>
                {!estimation.approval ? (
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
              </div>

              {/* Audit */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Audit</h3>
                <div className="space-y-3 text-xs">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                      Created
                    </div>
                    <div className="mt-0.5 text-gray-900">
                      {estimation.createdAt
                        ? formatDateTimeIST(estimation.createdAt)
                        : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                      Created By
                    </div>
                    <div className="mt-0.5 text-gray-900">
                      {estimation.createdByName ?? estimation.createdBy ?? "—"}
                    </div>
                  </div>
                  {estimation.updatedAt && (
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                        Last Updated
                      </div>
                      <div className="mt-0.5 text-gray-900">
                        {formatDateTimeIST(estimation.updatedAt)}
                      </div>
                    </div>
                  )}
                  {estimation.updatedByName && (
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                        Last Updated By
                      </div>
                      <div className="mt-0.5 text-gray-900">
                        {estimation.updatedByName}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </PageContainer>

      {/* Workflow (submit / approve / reject) confirmation */}
      <ConfirmDialog
        open={!!workflowAction}
        onClose={closeWorkflow}
        onConfirm={runWorkflowAction}
        loading={workflowPending}
        tone={workflowAction === "reject" ? "danger" : "primary"}
        title={
          workflowAction === "submit"
            ? "Submit for Approval"
            : workflowAction === "approve"
              ? "Approve Estimation"
              : workflowAction === "reject"
                ? "Reject Estimation"
                : ""
        }
        confirmLabel={
          workflowAction === "submit"
            ? "Submit"
            : workflowAction === "approve"
              ? "Approve"
              : "Reject"
        }
        message={
          workflowAction ? (
            <div className="space-y-3">
              <div>
                {workflowAction === "submit" && (
                  <>
                    Send estimation{" "}
                    <span className="font-semibold text-gray-900">
                      {estimation.boqNo ?? ""}
                    </span>{" "}
                    into the approval queue? You won&apos;t be able to edit it
                    until an approver actions it.
                  </>
                )}
                {workflowAction === "approve" && (
                  <>
                    Approve estimation{" "}
                    <span className="font-semibold text-gray-900">
                      {estimation.boqNo ?? ""}
                    </span>
                    ? It becomes the baseline for downstream procurement.
                  </>
                )}
                {workflowAction === "reject" && (
                  <>
                    Reject estimation{" "}
                    <span className="font-semibold text-gray-900">
                      {estimation.boqNo ?? ""}
                    </span>
                    ? The raiser will see your reason and can revise and
                    resubmit.
                  </>
                )}
              </div>
              {workflowAction === "reject" && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Reason
                  </label>
                  <textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    rows={3}
                    placeholder="e.g. waste factor looks high on cement line"
                    disabled={workflowPending}
                    autoFocus
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 disabled:bg-gray-50"
                  />
                </div>
              )}
              {workflowError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {workflowError}
                </div>
              )}
            </div>
          ) : null
        }
      />
    </>
  );
}

/**
 * Uniform stat cell used by the Overview grid. Icon sits in a tinted
 * circle on the left, label stacks above the value. Keeps the grid
 * scan-able without the reader having to parse every label.
 */
