"use client";

/**
 * Equipment Log — detail page.
 *
 * Mirrors the purchase detail pages: PageHeader with breadcrumbs + status +
 * actions, a main column of grouped info cards (Log Details / Meter /
 * Utilisation & Fuel / Remarks), and an Audit sidebar card. Drafts get a
 * Submit for Approval action; the change history is available via the log
 * book table's history icon.
 */

import { useMemo, useState, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import { Send, CheckCircle2 } from "lucide-react";
import {
  PageHeader,
  PageContainer,
  StatusChip,
  PrimaryButton,
  ApprovalTimeline,
  PageSkeleton,
} from "@/components/PageShell";
import { ApprovalActionBar } from "@/components/ApprovalActionBar";
import { formatDateTimeIST } from "@/lib/format/datetime";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useQueryClient } from "@tanstack/react-query";
import { useEquipmentLog } from "@/hooks/use-equipment";
import { useUsers } from "@/hooks/use-users";
import { usePermissions, type MeResponse } from "@/hooks/use-permissions";
import { canActOnStep } from "@/lib/approvals/workflow-rbac";
import { USER_TYPE_CATALOG } from "@/lib/rbac/user-types";
import type {
  ApprovalStep,
  ApprovalHistoryEntry,
} from "@/lib/approvals/approval-info";
import type { EquipmentLogRecord } from "@/lib/equipment/equipment-types";
import { toErrorMessage } from "@/lib/api/errors";
import { toast } from "@/lib/toast";

const STATUS_LABEL: Record<string, string> = {
  pending_approval: "Pending Approval",
  submitted: "Pending Approval",
};

/** Matches PageShell's ApprovalTimeline entry shape. */
interface TimelineEntry {
  step: number;
  action: string;
  actionBy: string;
  actionAt: string;
  comments?: string;
  title?: string;
}

/** Human-readable label for a userType key stored in workflow steps. */
function roleLabel(key: string | null | undefined): string {
  if (!key) return "Any approver";
  return USER_TYPE_CATALOG.find((t) => t.key === key)?.label ?? key;
}

/**
 * Returns the most recent history row where the current user acted — used to
 * render a "You already approved at step N" indicator in place of the live
 * action buttons for users who've moved past their step.
 */
function priorActionByMe(
  me: MeResponse | null | undefined,
  log: EquipmentLogRecord | null | undefined,
): ApprovalHistoryEntry | null {
  if (!me || !log?.approval?.history) return null;
  return (
    [...log.approval.history].reverse().find((h) => h.actionById === me.userId) ??
    null
  );
}

/**
 * True when the logged-in user is the expected actor for the current step.
 * Mirrors the server-side canActOnStep exactly so the UI hides the action bar
 * unless the viewer is actually allowed to act.
 */
function canActOnCurrentStep(
  me: MeResponse | null | undefined,
  log: EquipmentLogRecord | null | undefined,
): boolean {
  if (!me || !log?.approval) return false;
  if (log.approval.status !== "pending_approval") return false;
  const step = log.approval.workflow?.steps?.find(
    (s: ApprovalStep) => s.stepOrder === log.approval?.currentStepOrder,
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
    log.projectId ?? null,
  );
}

export default function EquipmentLogDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { data: log, isLoading } = useEquipmentLog(id);
  const { data: usersData } = useUsers();
  const { me } = usePermissions();

  const nameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of usersData?.data ?? []) {
      map.set(u.id, u.fullName?.trim() || u.email || u.id);
    }
    return map;
  }, [usersData]);
  const userName = (uid: string | null | undefined) =>
    uid ? (nameById.get(uid) ?? uid) : "—";

  const [submitOpen, setSubmitOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (isLoading) return <PageSkeleton />;
  if (!log) {
    return (
      <PageContainer>
        <p className="text-gray-500 py-12 text-center">Equipment log not found</p>
      </PageContainer>
    );
  }

  const meterLabel = log.meterType === "km" ? "Meter (KM)" : "Meter (Hours)";
  const dash = (v: unknown) =>
    v === null || v === undefined || v === "" ? "—" : String(v);
  const isDraft = String(log.status).toLowerCase() === "draft";

  const doSubmit = async () => {
    setSubmitError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/equipment/logs/${id}/submit`, {
        method: "POST",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      await qc.invalidateQueries({ queryKey: ["equipment-log", id] });
      await qc.invalidateQueries({ queryKey: ["equipment-logs"] });
      await qc.invalidateQueries({ queryKey: ["equipment-logs-summary"] });
      toast.success("Submitted for approval");
      setSubmitOpen(false);
    } catch (err: unknown) {
      setSubmitError(toErrorMessage(err, "Failed to submit log"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <PageHeader
        title={log.equipmentCode}
        subtitle={`Equipment Log — ${log.equipmentName}`}
        breadcrumbs={[
          { label: "Plant & Machinery", href: "/equipment/log-book" },
          { label: "Log Book", href: "/equipment/log-book" },
          { label: log.equipmentCode },
        ]}
        onBack={() => router.push("/equipment/log-book")}
        actions={
          <div className="flex items-center gap-2">
            <StatusChip
              status={log.status}
              label={STATUS_LABEL[log.status] ?? undefined}
            />
            {isDraft && me?.userId === log.createdBy && (
              <PrimaryButton
                onClick={() => {
                  setSubmitError(null);
                  setSubmitOpen(true);
                }}
              >
                <Send className="w-4 h-4" /> Submit for Approval
              </PrimaryButton>
            )}
            {(() => {
              const canAct = canActOnCurrentStep(me, log);
              const prior = !canAct ? priorActionByMe(me, log) : null;
              // If the viewer already acted at an earlier step, show a compact
              // non-clickable confirmation in place of buttons so they get
              // feedback that their prior action was recorded.
              if (prior) {
                const label =
                  prior.action === "approve"
                    ? `You approved at Step ${prior.stepOrder}`
                    : prior.action === "reject"
                      ? `You rejected at Step ${prior.stepOrder}`
                      : `You returned at Step ${prior.stepOrder}`;
                const tone =
                  prior.action === "approve"
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : prior.action === "reject"
                      ? "bg-rose-50 text-rose-700 border-rose-200"
                      : "bg-orange-50 text-orange-700 border-orange-200";
                return (
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs border ${tone}`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {label}
                  </span>
                );
              }
              return (
                <ApprovalActionBar
                  entityType="equipment-log"
                  entityId={id}
                  currentStatus={log.status}
                  requiredPermission="construction.equipment_log.approve"
                  actionEndpoint={`/api/equipment/logs/${id}/approve`}
                  invalidateKeys={[
                    ["equipment-logs"],
                    ["equipment-log", id],
                    ["equipment-logs-summary"],
                  ]}
                  // Workflow-aware gating — only the current step's actor sees
                  // live buttons.
                  hidden={!canAct}
                />
              );
            })()}
          </div>
        }
      />

      <PageContainer>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card title="Log Details">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <InfoField
                  label="Equipment"
                  value={`${log.equipmentCode} — ${log.equipmentName}`}
                />
                <InfoField label="Project" value={dash(log.projectName)} />
                <InfoField label="Date" value={log.logDate} />
                <InfoField label="Shift" value={dash(log.shift)} />
                <InfoField
                  label="Status"
                  value={
                    <StatusChip
                      status={log.status}
                      label={STATUS_LABEL[log.status] ?? undefined}
                    />
                  }
                />
              </div>
            </Card>

            <Card title={meterLabel}>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <InfoField label="Opening" value={dash(log.openingMeter)} />
                <InfoField label="Closing" value={dash(log.closingMeter)} />
                <InfoField label="Run" value={dash(log.run)} highlight />
                <InfoField label="Meter reset" value={log.meterReset ? "Yes" : "No"} />
              </div>
            </Card>

            <Card title="Utilisation & Fuel">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <InfoField label="Idle Hrs" value={dash(log.idleHours)} />
                <InfoField label="Breakdown Hrs" value={dash(log.breakdownHours)} />
                <InfoField label="Diesel Issued (L)" value={dash(log.dieselIssued)} />
                <InfoField label="L / unit" value={dash(log.fuelRate)} />
                <InfoField label="Operator" value={dash(log.operatorName)} />
                <InfoField label="Productivity Qty" value={dash(log.productivityQty)} />
                <InfoField label="Output UOM" value={dash(log.outputUom)} />
              </div>
            </Card>

            {log.remarks && (
              <Card title="Remarks">
                <p className="text-sm text-gray-700 whitespace-pre-wrap">
                  {log.remarks}
                </p>
              </Card>
            )}

            {String(log.status).toLowerCase() === "rejected" &&
              log.rejectReason && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4">
                  <p className="text-xs font-semibold text-red-700 uppercase tracking-wider mb-1">
                    Rejection reason
                  </p>
                  <p className="text-sm text-red-700">{log.rejectReason}</p>
                </div>
              )}
          </div>

          <div className="space-y-6">
            {/* Approval Timeline */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <span className="inline-block w-1 h-3.5 bg-orange-500 rounded-sm" />
                Approval Timeline
              </h3>
              {isDraft ? (
                <p className="text-sm text-gray-500">
                  Not yet submitted for approval.
                </p>
              ) : !log.approval ? (
                <p className="text-sm text-gray-500">
                  Submitted, but no approval instance is linked to this log.
                </p>
              ) : (
                (() => {
                  const approval = log.approval!;
                  // First row: who submitted the log.
                  const entries: TimelineEntry[] = [
                    {
                      step: 0,
                      action: "request",
                      title: "Requested",
                      actionBy: approval.requestedByName || "Requester",
                      actionAt: formatDateTimeIST(approval.requestedAt),
                    },
                  ];

                  // One row per CONFIGURED step. Use the last matching history
                  // row if the step is already completed, else render it as the
                  // current "Next up" pending row or an "Upcoming" row.
                  (approval.workflow?.steps ?? []).forEach((s: ApprovalStep) => {
                    const acted = [...(approval.history ?? [])]
                      .reverse()
                      .find((h) => h.stepOrder === s.stepOrder);
                    const approverLabel = s.approverUserName
                      ? `${s.approverUserName} (${roleLabel(s.approverRoleId)})`
                      : roleLabel(s.approverRoleId);

                    if (acted) {
                      entries.push({
                        step: s.stepOrder,
                        action: acted.action, // approve | reject | return
                        actionBy: acted.actionByName || approverLabel,
                        actionAt: formatDateTimeIST(acted.actionAt),
                        comments: acted.comments || undefined,
                      });
                      return;
                    }

                    const isCurrent =
                      approval.status === "pending_approval" &&
                      approval.currentStepOrder === s.stepOrder;
                    entries.push({
                      step: s.stepOrder,
                      action: isCurrent ? "current" : "upcoming",
                      title: isCurrent
                        ? `Next — Step ${s.stepOrder}`
                        : `Upcoming — Step ${s.stepOrder}`,
                      actionBy: approverLabel,
                      actionAt: isCurrent
                        ? "Awaiting action"
                        : "Not yet reached",
                    });
                  });
                  return <ApprovalTimeline entries={entries} />;
                })()
              )}
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Audit</h3>
              <div className="space-y-3">
                <InfoField
                  label="Created"
                  value={formatDateTimeIST(log.createdAt)}
                />
                <InfoField label="Created By" value={userName(log.createdBy)} />
                <InfoField
                  label="Updated"
                  value={formatDateTimeIST(log.updatedAt)}
                />
                <InfoField label="Updated By" value={userName(log.updatedBy)} />
              </div>
            </div>
          </div>
        </div>
      </PageContainer>

      <ConfirmDialog
        open={submitOpen}
        onClose={() => {
          if (!submitting) {
            setSubmitOpen(false);
            setSubmitError(null);
          }
        }}
        onConfirm={doSubmit}
        title="Submit for Approval"
        confirmLabel="Submit"
        tone="primary"
        loading={submitting}
        message={
          <>
            Submit this equipment log for{" "}
            <span className="font-semibold text-gray-900">
              {log.equipmentCode} · {log.logDate}
            </span>
            ? Once approved, the machine meter reading will be updated.
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

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-2">
        <span className="inline-block w-1 h-3.5 bg-orange-500 rounded-sm" />
        {title}
      </h3>
      {children}
    </div>
  );
}

function InfoField({
  label,
  value,
  highlight,
}: {
  label: string;
  value: ReactNode;
  highlight?: boolean;
}) {
  return (
    <div>
      <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wider">
        {label}
      </p>
      <div
        className={`text-sm mt-0.5 ${highlight ? "font-bold text-gray-900" : "text-gray-700"}`}
      >
        {value ?? "—"}
      </div>
    </div>
  );
}
