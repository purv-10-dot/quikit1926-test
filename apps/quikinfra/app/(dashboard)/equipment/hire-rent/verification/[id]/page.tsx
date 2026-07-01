"use client";

/**
 * Hire-In Verification — detail page.
 *
 * Mirrors the Equipment Log detail page: PageHeader with status + actions
 * (Submit for Approval / workflow Approve-Return-Reject), grouped info cards,
 * an Approval Timeline, and an Audit sidebar. Status is driven by the
 * configured Hire & Rent approval workflow.
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
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useQueryClient } from "@tanstack/react-query";
import { useHireInVerification } from "@/hooks/use-equipment";
import { useUsers } from "@/hooks/use-users";
import { usePermissions, type MeResponse } from "@/hooks/use-permissions";
import { canActOnStep } from "@/lib/approvals/workflow-rbac";
import { USER_TYPE_CATALOG } from "@/lib/rbac/user-types";
import type {
  ApprovalStep,
  ApprovalHistoryEntry,
} from "@/lib/approvals/approval-info";
import type { HireInVerificationRecord } from "@/lib/equipment/equipment-types";
import { toErrorMessage } from "@/lib/api/errors";
import { toast } from "@/lib/toast";

const STATUS_LABEL: Record<string, string> = {
  pending_approval: "Pending Approval",
  submitted: "Pending Approval",
  computed: "Computed",
};

const SUBMITTABLE = new Set(["draft", "computed"]);

/** Matches PageShell's ApprovalTimeline entry shape. */
interface TimelineEntry {
  step: number;
  action: string;
  actionBy: string;
  actionAt: string;
  comments?: string;
  title?: string;
}

function roleLabel(key: string | null | undefined): string {
  if (!key) return "Any approver";
  return USER_TYPE_CATALOG.find((t) => t.key === key)?.label ?? key;
}

function priorActionByMe(
  me: MeResponse | null | undefined,
  v: HireInVerificationRecord | null | undefined,
): ApprovalHistoryEntry | null {
  if (!me || !v?.approval?.history) return null;
  return (
    [...v.approval.history].reverse().find((h) => h.actionById === me.userId) ??
    null
  );
}

function canActOnCurrentStep(
  me: MeResponse | null | undefined,
  v: HireInVerificationRecord | null | undefined,
): boolean {
  if (!me || !v?.approval) return false;
  if (v.approval.status !== "pending_approval") return false;
  const step = v.approval.workflow?.steps?.find(
    (s: ApprovalStep) => s.stepOrder === v.approval?.currentStepOrder,
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
    v.projectId ?? null,
  );
}

export default function HireInVerificationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { data: v, isLoading } = useHireInVerification(id);
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
  if (!v) {
    return (
      <PageContainer>
        <p className="text-gray-500 py-12 text-center">Verification not found</p>
      </PageContainer>
    );
  }

  const dash = (val: unknown) =>
    val === null || val === undefined || val === "" ? "—" : String(val);
  const money = (n: number | null | undefined) =>
    `₹ ${(n ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  const canSubmit = SUBMITTABLE.has(String(v.status).toLowerCase());

  const doSubmit = async () => {
    setSubmitError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/equipment/hire-in-verifications/${id}/submit`, {
        method: "POST",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      await qc.invalidateQueries({ queryKey: ["hire-in-verification", id] });
      await qc.invalidateQueries({ queryKey: ["hire-in-verifications"] });
      await qc.invalidateQueries({ queryKey: ["hire-rent-summary"] });
      toast.success("Submitted for approval");
      setSubmitOpen(false);
    } catch (err: unknown) {
      setSubmitError(toErrorMessage(err, "Failed to submit verification"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <PageHeader
        title={v.verificationNumber}
        subtitle={`Hire-In Verification — ${v.equipmentCode} · ${v.equipmentName}`}
        breadcrumbs={[
          { label: "Plant & Machinery", href: "/equipment/hire-rent" },
          { label: "Hire & Rent", href: "/equipment/hire-rent" },
          { label: v.verificationNumber },
        ]}
        onBack={() => router.push("/equipment/hire-rent")}
        actions={
          <div className="flex items-center gap-2">
            <StatusChip status={v.status} label={STATUS_LABEL[v.status] ?? undefined} />
            {canSubmit && me?.userId === v.createdBy && (
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
              const canAct = canActOnCurrentStep(me, v);
              const prior = !canAct ? priorActionByMe(me, v) : null;
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
                  entityType="hire-in-verification"
                  entityId={id}
                  currentStatus={v.status}
                  requiredPermission="construction.equipment_hire_rent.approve"
                  actionEndpoint={`/api/equipment/hire-in-verifications/${id}/approve`}
                  invalidateKeys={[
                    ["hire-in-verifications"],
                    ["hire-in-verification", id],
                    ["hire-rent-summary"],
                  ]}
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
            <Card title="Verification Details">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <InfoField
                  label="Equipment"
                  value={`${v.equipmentCode} — ${v.equipmentName}`}
                />
                <InfoField label="Vendor" value={dash(v.vendorName)} />
                <InfoField label="Period" value={`${v.periodFrom} → ${v.periodTo}`} />
                <InfoField label="Basis" value={dash(v.rateBasis)} />
                <InfoField label="Rate" value={money(v.rate)} />
                <InfoField label="GST %" value={dash(v.gstPercent)} />
                <InfoField
                  label="Status"
                  value={
                    <StatusChip
                      status={v.status}
                      label={STATUS_LABEL[v.status] ?? undefined}
                    />
                  }
                />
              </div>
            </Card>

            <Card title="Quantities">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <InfoField label="Logged" value={dash(v.loggedQty)} />
                <InfoField label="Vendor Claimed" value={dash(v.vendorClaimedQty)} />
                <InfoField label="Variance" value={dash(v.varianceQty)} />
                <InfoField label="Min Guaranteed" value={dash(v.minGuaranteedQty)} />
                <InfoField label="Billable" value={dash(v.billableQty)} highlight />
              </div>
            </Card>

            <Card title="Amounts">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <InfoField label="Payable" value={money(v.payableAmount)} />
                <InfoField label="GST" value={money(v.gstAmount)} />
                <InfoField label="Total" value={money(v.totalAmount)} highlight />
              </div>
            </Card>

            {String(v.status).toLowerCase() === "rejected" && v.rejectReason && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4">
                <p className="text-xs font-semibold text-red-700 uppercase tracking-wider mb-1">
                  Rejection reason
                </p>
                <p className="text-sm text-red-700">{v.rejectReason}</p>
              </div>
            )}

            {v.returnReason && String(v.status).toLowerCase() !== "approved" && (
              <div className="rounded-xl border border-orange-200 bg-orange-50 px-5 py-4">
                <p className="text-xs font-semibold text-orange-700 uppercase tracking-wider mb-1">
                  Returned for revision
                </p>
                <p className="text-sm text-orange-700">{v.returnReason}</p>
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
              {canSubmit && !v.approval ? (
                <p className="text-sm text-gray-500">Not yet submitted for approval.</p>
              ) : !v.approval ? (
                <p className="text-sm text-gray-500">
                  Submitted, but no approval instance is linked to this verification.
                </p>
              ) : (
                (() => {
                  const approval = v.approval!;
                  const entries: TimelineEntry[] = [
                    {
                      step: 0,
                      action: "request",
                      title: "Requested",
                      actionBy: approval.requestedByName || "Requester",
                      actionAt: new Date(approval.requestedAt ?? "").toLocaleString(),
                    },
                  ];

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
                        action: acted.action,
                        actionBy: acted.actionByName || approverLabel,
                        actionAt: new Date(acted.actionAt ?? "").toLocaleString(),
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
                      actionAt: isCurrent ? "Awaiting action" : "Not yet reached",
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
                  value={v.createdAt ? new Date(v.createdAt).toLocaleString() : "—"}
                />
                <InfoField label="Created By" value={userName(v.createdBy)} />
                <InfoField
                  label="Updated"
                  value={v.updatedAt ? new Date(v.updatedAt).toLocaleString() : "—"}
                />
                <InfoField label="Updated By" value={userName(v.updatedBy)} />
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
            Submit verification{" "}
            <span className="font-semibold text-gray-900">{v.verificationNumber}</span>{" "}
            for approval? It will be routed through the active Hire &amp; Rent workflow
            and you won&apos;t be able to edit it until an approver returns it.
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
