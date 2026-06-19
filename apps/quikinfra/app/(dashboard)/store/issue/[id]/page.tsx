"use client";

/**
 * Material Issue — detail page.
 *
 * Mirrors the Purchase Requisition detail layout: a clean text-only
 * overview grid on the left, Approval Timeline + Audit in the right
 * sidebar. Submit for Approval + Approve / Reject live in the header
 * actions row — same pattern as PR/Estimation so the UX is uniform.
 */

import { toErrorMessage } from "@/lib/api/errors";
import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  ClipboardList,
  AlertTriangle,
  CheckCircle2,
  Send,
  Package,
} from "lucide-react";
import { PhotoAttachmentsCard } from "@/components/PhotoAttachmentsCard";
import {
  PageHeader,
  PageContainer,
  PageSkeleton,
  StatusChip,
  ApprovalTimeline,
  PrimaryButton,
} from "@/components/PageShell";
import { ApprovalActionBar } from "@/components/ApprovalActionBar";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useMaterialIssue } from "@/hooks/use-store";
import { usePermissions, type MeResponse } from "@/hooks/use-permissions";
import { USER_TYPE_CATALOG } from "@/lib/rbac/user-types";
import { canActOnStep } from "@/lib/approvals/workflow-rbac";

import type {
  ApprovalStep,
  ApprovalHistoryEntry,
  ApprovalInfo,
} from "@/lib/approvals/approval-info";
import type { IssueLine, IssueDetail } from "@/lib/store/material-issue-detail";

function roleLabel(key: string | null | undefined): string {
  if (!key) return "Any approver";
  return USER_TYPE_CATALOG.find((t) => t.key === key)?.label ?? key;
}

/** The header chip — while the issue is mid-flow, call out who it's
    waiting on so the requester doesn't have to open the timeline. */
function IssueStatusChip({ issue }: { issue: IssueDetail }) {
  const approval = issue?.approval;
  const status = String(issue?.status ?? "draft").toLowerCase();
  if (approval && approval.status === "pending_approval") {
    const step = approval.workflow?.steps?.find(
      (s: ApprovalStep) => s.stepOrder === approval.currentStepOrder,
    );
    const approver = step
      ? step.approverUserName
        ? `${step.approverUserName} (${roleLabel(step.approverRoleId)})`
        : roleLabel(step.approverRoleId)
      : "an approver";
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border bg-amber-50 text-amber-800 border-amber-200">
        Pending — {approver}
      </span>
    );
  }
  if (status === "approved") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border bg-green-50 text-green-700 border-green-200">
        Approved
      </span>
    );
  }
  if (status === "rejected") {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium border bg-red-50 text-red-700 border-red-200">
        Rejected
      </span>
    );
  }
  return <StatusChip status={issue?.status ?? "draft"} />;
}

/** History-row lookup used to render the "You approved at Step N" pill
    in the header for approvers who've already acted — mirrors the PR
    detail page behaviour. */
function priorActionByMe(
  me: MeResponse | null | undefined,
  issue: IssueDetail | null | undefined,
): ApprovalHistoryEntry | null {
  if (!me || !issue?.approval?.history) return null;
  return (
    [...issue.approval.history]
      .reverse()
      .find((h) => h.actionById === me.userId) ?? null
  );
}

/** True when the signed-in user is the expected actor for the issue's
    current workflow step — thin wrapper around the shared workflow-rbac
    helper so the UI gate matches the server exactly. */
function canActOnCurrentStep(
  me: MeResponse | null | undefined,
  issue: IssueDetail | null | undefined,
): boolean {
  if (!me || !issue?.approval) return false;
  if (issue.approval.status !== "pending_approval") return false;
  const step = issue.approval.workflow?.steps?.find(
    (s: ApprovalStep) => s.stepOrder === issue.approval?.currentStepOrder,
  );
  if (!step) return false;
  return canActOnStep(
    {
      userId: me.userId,
      roleKey: me.roleKey,
      projectIds:
        me.projectIds === null || me.projectIds === undefined
          ? undefined
          : me.projectIds,
    },
    {
      approverUserId: step.approverUserId ?? null,
      approverRoleId: step.approverRoleId ?? null,
    },
    issue.projectId ?? null,
  );
}

function fmtQty(v: unknown, unit?: string | null) {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return `${n.toLocaleString("en-IN", { maximumFractionDigits: 4 })}${unit ? ` ${unit}` : ""}`;
}
function fmtInr(v: unknown) {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return `₹ ${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}
function fmtDate(v: unknown): string {
  if (!v) return "—";
  try {
    const d = new Date(v as string | number | Date);
    if (Number.isNaN(d.getTime())) return String(v);
    return d.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return String(v);
  }
}
function fmtDateTime(v: unknown): string {
  if (!v) return "—";
  try {
    const d = new Date(v as string | number | Date);
    if (Number.isNaN(d.getTime())) return String(v);
    return d.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(v);
  }
}

export default function MaterialIssueDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { data: issue, isLoading } = useMaterialIssue(id);
  const { me } = usePermissions();

  // Submit-for-Approval confirmation dialog state. Kept separate from
  // the ApprovalActionBar's internal confirm (used for Approve/Reject)
  // because Submit has a different copy and a different endpoint.
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);
  const [submitPending, setSubmitPending] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSubmit = () => {
    setSubmitError(null);
    setSubmitConfirmOpen(true);
  };

  const doSubmit = async () => {
    setSubmitError(null);
    setSubmitPending(true);
    try {
      const res = await fetch(`/api/store/issues/${id}/submit`, {
        method: "POST",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      // Refresh both the detail row (for the timeline + status) and
      // the list so the user sees the flip immediately on back-nav.
      qc.invalidateQueries({ queryKey: ["material-issue", id] });
      qc.invalidateQueries({ queryKey: ["material-issues"] });
      setSubmitConfirmOpen(false);
    } catch (err: unknown) {
      setSubmitError(toErrorMessage(err, "Failed to submit for approval"));
    } finally {
      setSubmitPending(false);
    }
  };

  const lines: IssueLine[] = useMemo(
    () => (Array.isArray(issue?.lines) ? issue.lines : []),
    [issue],
  );

  // Rollups for the KPI panel — preferred server-calculated totals when
  // present, otherwise derived from the line rows so an older record
  // without them still renders a meaningful number.
  const totals = useMemo(() => {
    let totalQty = 0;
    let totalAmount = 0;
    for (const l of lines) {
      const q = Number(l.quantity ?? l.issueQty ?? l.qty ?? 0);
      const r = Number(l.unitRate ?? l.rate ?? l.standardRate ?? 0);
      if (Number.isFinite(q)) totalQty += q;
      if (Number.isFinite(q * r)) totalAmount += q * r;
    }
    return { totalQty, totalAmount };
  }, [lines]);

  if (isLoading) return <PageSkeleton />;
  if (!issue) {
    return (
      <>
        <PageHeader
          title="Material Issue"
          breadcrumbs={[
            { label: "Store", href: "/store" },
            { label: "Material Issue", href: "/store/issue" },
            { label: id },
          ]}
          onBack={() => router.push("/store/issue")}
        />
        <PageContainer>
          <p className="text-gray-500 py-12 text-center">Issue not found.</p>
        </PageContainer>
      </>
    );
  }

  const status = String(issue.status ?? "draft").toLowerCase();
  const contractorLabel =
    issue.issueType === "Self Work"
      ? issue.teamDepartment
      : issue.contractorName ?? issue.issuedToName ?? issue.contractorId;

  // Timeline source for the shared ApprovalTimeline component. Shape
  // must match the `ApprovalTimelineEntry` interface exported from
  // PageShell — specifically `step` (not `stepOrder`), `actionBy`
  // (not `actionByName`), and a formatted `actionAt`. Getting any of
  // these wrong rendered "Step undefined" / raw user cuids in the
  // timeline.
  const approvalEntries =
    issue.approval?.history?.map((h: ApprovalHistoryEntry) => ({
      step: h.stepOrder,
      action: h.action,
      actionBy: h.actionByName ?? "User",
      actionAt: fmtDateTime(h.actionAt),
      comments: h.comments ?? undefined,
    })) ?? [];

  const myPriorAction = priorActionByMe(me, issue);

  return (
    <>
      <PageHeader
        title={issue.issueNumber ?? `Issue ${id}`}
        subtitle={`Material Issue — ${issue.projectName ?? "—"}`}
        breadcrumbs={[
          { label: "Store", href: "/store" },
          { label: "Material Issue", href: "/store/issue" },
          { label: issue.issueNumber ?? id },
        ]}
        onBack={() => router.push("/store/issue")}
        actions={
          // Same action-row shape as the PR detail page:
          //   [ Status chip ] [ Submit for Approval (draft only) ]
          //   [ ApprovalActionBar (current-step approver) ]
          //   [ "You approved/rejected at Step N" pill (already acted) ]
          <div className="flex items-center gap-2">
            <IssueStatusChip issue={issue} />
            {String(issue.status ?? "").toLowerCase() === "draft" && (
              <PrimaryButton
                onClick={handleSubmit}
                disabled={submitPending}
              >
                <Send className="w-4 h-4" /> Submit for Approval
              </PrimaryButton>
            )}
            {(() => {
              const canAct = canActOnCurrentStep(me, issue);
              // If the viewer already acted at an earlier step, show a
              // compact non-clickable confirmation in place of buttons
              // so they get feedback their prior action was recorded.
              if (!canAct && myPriorAction) {
                const label =
                  myPriorAction.action === "approve"
                    ? `You approved at Step ${myPriorAction.stepOrder}`
                    : myPriorAction.action === "reject"
                      ? `You rejected at Step ${myPriorAction.stepOrder}`
                      : `You returned at Step ${myPriorAction.stepOrder}`;
                const tone =
                  myPriorAction.action === "approve"
                    ? "bg-green-50 text-green-700 border-green-200"
                    : myPriorAction.action === "reject"
                      ? "bg-red-50 text-red-700 border-red-200"
                      : "bg-orange-50 text-orange-700 border-orange-200";
                return (
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs border ${tone}`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" /> {label}
                  </span>
                );
              }
              // Live Approve / Reject / Return bar — only rendered for
              // the current-step approver (canAct === true). Passing
              // hidden={!canAct} opts out of the legacy permission
              // gate so the bar follows the workflow-rbac helper
              // instead of the matrix key.
              return (
                <ApprovalActionBar
                  entityType="materialIssue"
                  entityId={id}
                  currentStatus={issue.status ?? undefined}
                  requiredPermission="store.issue.approve"
                  actionEndpoint={`/api/store/issues/${id}/approve`}
                  invalidateKeys={[
                    ["material-issues"],
                    ["material-issue", id],
                  ]}
                  hidden={!canAct}
                />
              );
            })()}
          </div>
        }
      />

      <PageContainer>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-6">
          {/* ── Overview card ─────────────────────────────────────── */}
          {/* Clean text-only grid — mirrors the Purchase Requisition
              detail layout. No per-field icons; labels are uppercase
              and values sit directly below. */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-6 py-5">
            <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-8 gap-y-5 text-sm">
              <Stat label="Issue No" mono>
                {issue.issueNumber ?? "—"}
              </Stat>
              <Stat label="Project">{issue.projectName ?? "—"}</Stat>
              <Stat label="Issue Type">{issue.issueType ?? "—"}</Stat>
              <Stat label="Issue Date">{fmtDate(issue.issueDate)}</Stat>

              <Stat
                label={
                  issue.issueType === "Self Work"
                    ? "Team / Department"
                    : "Contractor"
                }
              >
                {contractorLabel ?? "—"}
              </Stat>
              <Stat label="PR Reference" mono>
                {issue.prReference ?? "—"}
              </Stat>
              {issue.woReference && (
                <Stat label="WO Reference" mono>
                  {issue.woReference}
                </Stat>
              )}
              <Stat label="Status">
                <StatusChip status={issue.status ?? "draft"} />
              </Stat>

              {issue.vehicleNo && (
                <Stat label="Vehicle No." mono>
                  {issue.vehicleNo}
                </Stat>
              )}
              {issue.gatePassNo && (
                <Stat label="Gate Pass No." mono>
                  {issue.gatePassNo}
                </Stat>
              )}
              {issue.issuedBy && <Stat label="Issued By">{issue.issuedBy}</Stat>}
              {issue.receivedBy && (
                <Stat label="Received By">{issue.receivedBy}</Stat>
              )}

              <Stat label="Items">{lines.length || issue.lineCount || 0}</Stat>
              <Stat label="Total Qty">{fmtQty(totals.totalQty)}</Stat>
              {(issue.transactionAmount !== undefined ||
                totals.totalAmount > 0) && (
                <Stat label="Transaction Amount" strong>
                  {fmtInr(issue.transactionAmount ?? totals.totalAmount)}
                </Stat>
              )}
            </dl>

            {/* Purpose + remarks + photo attachments — quoted below
                the grid. Kept full width so long notes / thumbnail
                rows don't squeeze the main grid. */}
            {(issue.purpose || issue.remarks || issue.photoAttachment) && (
              <div className="mt-5 pt-5 border-t border-gray-100 space-y-4">
                {issue.purpose && (
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">
                      Purpose
                    </div>
                    <p className="text-sm text-gray-800 leading-relaxed">
                      {issue.purpose}
                    </p>
                  </div>
                )}
                {issue.remarks && (
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">
                      Remarks
                    </div>
                    <p className="text-sm text-gray-700 leading-relaxed">
                      {issue.remarks}
                    </p>
                  </div>
                )}
                <PhotoAttachmentsCard
                  title="Photo Attachments"
                  raw={issue.photoAttachment}
                  variant="compact"
                />
              </div>
            )}
          </div>

          {/* Optional e-way bill notice */}
          {issue.ewayBillNo && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-3 text-xs text-gray-700 flex items-center gap-3">
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                <AlertTriangle className="w-3 h-3" /> E-Way Bill
              </span>
              <span className="font-mono">{issue.ewayBillNo}</span>
              {issue.intercityTransfer && (
                <span className="ml-auto text-[10px] text-gray-500">
                  Intercity — exempt threshold
                </span>
              )}
            </div>
          )}

          {/* ── Issue items table ─────────────────────────────────── */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">
                Issue Items ({lines.length})
              </h2>
            </div>

            {lines.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <Package className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">No items on this issue.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-[10px] uppercase text-gray-500 tracking-wider border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left font-bold w-10">#</th>
                      <th className="px-4 py-3 text-left font-bold">Material</th>
                      <th className="px-4 py-3 text-left font-bold">
                        Source Location
                      </th>
                      <th className="px-4 py-3 text-right font-bold">Req. Qty</th>
                      <th className="px-4 py-3 text-right font-bold">
                        Issue Qty
                      </th>
                      <th className="px-4 py-3 text-right font-bold">
                        Avail. Stock
                      </th>
                      <th className="px-4 py-3 text-left font-bold">Batch No.</th>
                      <th className="px-4 py-3 text-left font-bold">
                        Equipment No.
                      </th>
                      <th className="px-6 py-3 text-left font-bold">Remarks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {lines.map((l: IssueLine, idx: number) => (
                      <tr
                        key={l.id ?? l.itemId ?? idx}
                        className="hover:bg-indigo-50/20 transition-colors"
                      >
                        <td className="px-4 py-3 text-xs font-mono text-gray-400 tabular-nums">
                          {String(idx + 1).padStart(2, "0")}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-medium text-gray-900 truncate">
                              {l.itemName ?? "—"}
                            </span>
                            {l.uomCode && (
                              <span className="inline-flex items-center text-[10px] font-semibold uppercase tracking-wider text-teal-700 bg-teal-50 border border-teal-100 px-1.5 py-0.5 rounded">
                                {l.uomCode}
                              </span>
                            )}
                          </div>
                          {l.itemCode && (
                            <div className="text-[10px] text-gray-400 font-mono mt-0.5">
                              {l.itemCode}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-700">
                          {l.sourceLocationName ?? l.locationName ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                          {fmtQty(l.reqQty ?? l.requestedQty)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-semibold text-gray-900">
                          {fmtQty(l.quantity ?? l.issueQty)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-gray-600">
                          {fmtQty(l.availableStock)}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-700">
                          {l.batchNo ?? "—"}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-gray-700">
                          {l.equipmentNo ?? "—"}
                        </td>
                        <td className="px-6 py-3 text-xs text-gray-500">
                          {l.remarks ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          </div>
          {/* ── Sidebar (right column) — mirrors the PR detail layout
              with an Approval Timeline and an Audit card. */}
          <div className="space-y-5">
            {issue.approval && approvalEntries.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                <div className="px-5 py-3 border-b border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-900">
                    Approval Timeline
                  </h3>
                </div>
                <div className="px-5 py-4">
                  <ApprovalTimeline entries={approvalEntries} />
                </div>
              </div>
            )}

            {status === "rejected" && issue.rejectionReason && (
              <div className="bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-sm text-rose-800">
                <div className="font-semibold mb-1">Rejection reason</div>
                <div>{issue.rejectionReason}</div>
              </div>
            )}

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-4">
              <div className="flex items-center gap-2 mb-3">
                <ClipboardList className="w-4 h-4 text-gray-400" />
                <h3 className="text-sm font-semibold text-gray-900">Audit</h3>
              </div>
              <dl className="space-y-3 text-xs">
                <AuditField label="Created" value={fmtDateTime(issue.createdAt)} />
                <AuditField
                  label="Created By"
                  value={issue.createdByName ?? issue.createdBy ?? "—"}
                />
                <AuditField label="Updated" value={fmtDateTime(issue.updatedAt)} />
                <AuditField
                  label="Updated By"
                  value={issue.updatedByName ?? issue.updatedBy ?? "—"}
                />
                {(issue.approvedByName || issue.approvedBy) && (
                  <AuditField
                    label="Approved By"
                    value={issue.approvedByName ?? issue.approvedBy}
                  />
                )}
                {(issue.rejectedByName || issue.rejectedBy) && (
                  <AuditField
                    label="Rejected By"
                    value={issue.rejectedByName ?? issue.rejectedBy}
                  />
                )}
                {issue.createdByApproval && (
                  <AuditField
                    label="Source"
                    value="Auto-created from approved PR"
                  />
                )}
              </dl>
            </div>
          </div>
        </div>
      </PageContainer>

      {/* Submit-for-Approval confirmation — mirrors the PR detail
          dialog: explains the consequence (editing lockout until an
          approver actions the issue) and surfaces any server error
          inline without closing the modal, so the user can read it. */}
      <ConfirmDialog
        open={submitConfirmOpen}
        onClose={() => {
          if (!submitPending) {
            setSubmitConfirmOpen(false);
            setSubmitError(null);
          }
        }}
        onConfirm={doSubmit}
        title="Submit for Approval"
        confirmLabel="Submit"
        tone="primary"
        loading={submitPending}
        message={
          <>
            Submit Material Issue{" "}
            <span className="font-semibold text-gray-900">
              {issue.issueNumber ?? id}
            </span>{" "}
            for approval? It will be routed through the active Material
            Issue workflow and you won&apos;t be able to edit it until an
            approver actions it.
            {submitError && (
              <span className="mt-3 block rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {submitError}
              </span>
            )}
          </>
        }
      />
    </>
  );
}

/** Plain label/value cell used by the Overview grid — no icons, same
    look as the Purchase Requisition detail page. */
function Stat({
  label,
  children,
  mono,
  strong,
}: {
  label: string;
  children: React.ReactNode;
  mono?: boolean;
  strong?: boolean;
}) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
        {label}
      </div>
      <div
        className={`mt-1 text-sm text-gray-900 truncate ${mono ? "font-mono text-xs" : ""} ${
          strong ? "font-semibold" : ""
        }`}
      >
        {children}
      </div>
    </div>
  );
}

function AuditField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
        {label}
      </div>
      <div className="mt-0.5 text-gray-800">{value ?? "—"}</div>
    </div>
  );
}
