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
import { useEffect, useMemo, useRef, useState } from "react";
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
import { WorkflowConfirmDialog } from "@/components/WorkflowConfirmDialog";
import { useDPR, useDeleteDPR } from "@/hooks/use-projects";
import { usePermissions } from "@/hooks/use-permissions";
import { useWorkflowConfirm } from "@/hooks/use-workflow-confirm";

const MENU_KEY = "pm.dpr";

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

const fmtQty = (v: any, unit?: string | null) => {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return `${n.toLocaleString("en-IN", { maximumFractionDigits: 4 })}${unit ? ` ${unit}` : ""}`;
};

const HEADER_PILL =
  "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap shrink-0";

const PILL_TONE = {
  gray: "bg-gray-50 text-gray-700 border-gray-200",
  blue: "bg-blue-50 text-blue-700 border-blue-200",
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

  const { permissionMatrix, isSuper, hasRole } = usePermissions();
  const matrixRow = permissionMatrix?.[MENU_KEY];
  const canEdit = isSuper || !matrixRow || matrixRow.edit !== false;
  const canDelete = isSuper || !matrixRow || matrixRow.delete !== false;
  const canSubmit = canEdit;
  const canApprove =
    isSuper || hasRole(["tenant_admin", "project_manager"]);

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

  const workItems: any[] = useMemo(
    () => (Array.isArray(dpr?.workItems) ? dpr.workItems : []),
    [dpr],
  );

  // ApprovalTimeline expects { step, action, actionBy, actionAt, comments }.
  const approvalEntries =
    dpr?.approval?.history?.map((h: any) => ({
      step: h.stepOrder ?? 0,
      action: h.action,
      actionBy: h.actionByName ?? "User",
      actionAt: h.actionAt ? new Date(h.actionAt).toLocaleString() : "",
      comments: h.comments,
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
    } catch (err: any) {
      alert(err?.message ?? "Failed to delete");
    } finally {
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
                    : `${PILL_TONE.blue} hover:bg-blue-100`
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
                  <span className="font-mono text-xs font-semibold text-gray-900 px-1.5 py-0.5 rounded bg-sky-50 border border-sky-100">
                    {dpr.dprNumber ?? "—"}
                  </span>
                </Stat>
                <Stat label="Report Date">
                  <span className="text-gray-900">
                    {fmtDate(dpr.reportDate)}
                  </span>
                </Stat>
                <Stat label="Weather">
                  <span className="text-gray-900 capitalize">
                    {dpr.weatherCondition || "—"}
                  </span>
                </Stat>
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
                      <tr>
                        <th className="px-4 py-3 text-left font-bold w-10">
                          #
                        </th>
                        <th className="px-4 py-3 text-left font-bold">
                          BOQ Ref
                        </th>
                        <th className="px-4 py-3 text-left font-bold">
                          Description
                        </th>
                        <th className="px-4 py-3 text-right font-bold">
                          Today's Qty
                        </th>
                        <th className="px-4 py-3 text-right font-bold">
                          Cumulative
                        </th>
                        <th className="px-4 py-3 text-left font-bold">
                          Remarks
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {workItems.map((it: any, idx: number) => (
                        <tr key={idx} className="hover:bg-orange-50/20 transition-colors">
                          <td className="px-4 py-3 text-xs font-mono text-gray-400 tabular-nums">
                            {String(idx + 1).padStart(2, "0")}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-orange-700 font-bold">
                            {it.boqNo ?? it.boqItemId ?? "—"}
                          </td>
                          <td className="px-4 py-3 text-gray-900">
                            {it.description ?? "—"}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-gray-900">
                            {fmtQty(it.todayQty)}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-gray-900">
                            {fmtQty(it.cumulativeQty)}
                          </td>
                          <td className="px-4 py-3 text-gray-700 text-xs">
                            {it.remarks ?? "—"}
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
                    {dpr.approval.workflow.steps.map((s: any) => {
                      const isCurrent =
                        s.stepOrder === dpr.approval.currentStepOrder;
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
                    {dpr.createdAt
                      ? new Date(dpr.createdAt).toLocaleString()
                      : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                    Created By
                  </div>
                  <div className="mt-0.5 text-gray-900">
                    {dpr.createdBy ?? "—"}
                  </div>
                </div>
                {dpr.updatedAt && (
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                      Last Updated
                    </div>
                    <div className="mt-0.5 text-gray-900">
                      {new Date(dpr.updatedAt).toLocaleString()}
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
