"use client";

/**
 * Maintenance Job Card — detail page.
 *
 * Mirrors the equipment log-book detail page: PageHeader with breadcrumbs +
 * status + actions, a main column of grouped info cards (Job Details /
 * Spares / Costs / Remarks), and an Audit sidebar. Open cards expose
 * Close / Cancel actions (same as the list row menu).
 */

import { useMemo, useState, type ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";
import {
  PageHeader,
  PageContainer,
  StatusChip,
  PrimaryButton,
  ApprovalTimeline,
  PageSkeleton,
} from "@/components/PageShell";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { formatDateTimeIST } from "@/lib/format/datetime";
import { useJobCard, usePatchJobCard } from "@/hooks/use-equipment";
import { useUsers } from "@/hooks/use-users";
import { USER_TYPE_CATALOG } from "@/lib/rbac/user-types";
import type { ApprovalStep } from "@/lib/approvals/approval-info";
import { toErrorMessage } from "@/lib/api/errors";

function formatCurrency(n: number) {
  return `₹ ${(Number(n) || 0).toLocaleString("en-IN")}`;
}

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

export default function JobCardDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: card, isLoading } = useJobCard(id);
  const { data: usersData } = useUsers();
  const patchMutation = usePatchJobCard();

  const [action, setAction] = useState<"close" | "cancel" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const nameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of usersData?.data ?? []) {
      map.set(u.id, u.fullName?.trim() || u.email || u.id);
    }
    return map;
  }, [usersData]);
  const userName = (uid: string | null | undefined) =>
    uid ? (nameById.get(uid) ?? uid) : "—";

  if (isLoading) return <PageSkeleton />;
  if (!card) {
    return (
      <PageContainer>
        <p className="text-gray-500 py-12 text-center">Job card not found</p>
      </PageContainer>
    );
  }

  const dash = (v: unknown) =>
    v === null || v === undefined || v === "" ? "—" : String(v);
  const isOpen = card.status === "open";

  const runAction = async () => {
    if (!action) return;
    setActionError(null);
    try {
      await patchMutation.mutateAsync({ id, action });
      setAction(null);
    } catch (err: unknown) {
      setActionError(toErrorMessage(err, "Action failed"));
    }
  };

  return (
    <>
      <PageHeader
        title={card.jobNumber}
        subtitle={`Job Card — ${card.equipmentCode} · ${card.equipmentName}`}
        breadcrumbs={[
          { label: "Plant & Machinery", href: "/equipment/maintenance" },
          { label: "Maintenance", href: "/equipment/maintenance" },
          { label: card.jobNumber },
        ]}
        onBack={() => router.push("/equipment/maintenance")}
        actions={
          <div className="flex items-center gap-2">
            <StatusChip status={card.status} />
            {isOpen && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setActionError(null);
                    setAction("cancel");
                  }}
                  className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg border border-gray-200 text-sm font-medium text-red-600 hover:bg-red-50"
                >
                  <XCircle className="w-4 h-4" /> Cancel
                </button>
                <PrimaryButton
                  onClick={() => {
                    setActionError(null);
                    setAction("close");
                  }}
                >
                  <CheckCircle2 className="w-4 h-4" /> Close Card
                </PrimaryButton>
              </>
            )}
          </div>
        }
      />

      <PageContainer>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card title="Job Details">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <InfoField label="Job #" value={card.jobNumber} />
                <InfoField
                  label="Equipment"
                  value={`${card.equipmentCode} — ${card.equipmentName}`}
                />
                <InfoField label="Type" value={<span className="capitalize">{card.jobType}</span>} />
                <InfoField label="Project" value={dash(card.projectName)} />
                <InfoField label="Service Date" value={card.serviceDate} />
                <InfoField label="Meter at Service" value={dash(card.meterAtService)} />
                <InfoField label="Downtime (hrs)" value={dash(card.downtimeHours)} />
                <InfoField label="Status" value={<StatusChip status={card.status} />} />
                <InfoField
                  label="Reported Problem"
                  value={dash(card.reportedProblem)}
                  span={4}
                />
              </div>
            </Card>

            <Card title={`Spares Consumed (${card.spares?.length ?? 0})`}>
              {!card.spares || card.spares.length === 0 ? (
                <p className="text-sm text-gray-500">No spares logged.</p>
              ) : (
                <div className="overflow-x-auto -mx-1">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50/50">
                        <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">Description</th>
                        <th className="px-3 py-2 text-right text-[10px] font-semibold text-gray-500 uppercase w-20">Qty</th>
                        <th className="px-3 py-2 text-right text-[10px] font-semibold text-gray-500 uppercase w-28">Rate (₹)</th>
                        <th className="px-3 py-2 text-right text-[10px] font-semibold text-gray-500 uppercase w-32">Amount (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {card.spares.map((s) => (
                        <tr key={s.id}>
                          <td className="px-3 py-2 text-gray-900">{s.description}</td>
                          <td className="px-3 py-2 text-right text-gray-700 tabular-nums">
                            {s.qty.toLocaleString("en-IN")}
                          </td>
                          <td className="px-3 py-2 text-right text-gray-700 tabular-nums">
                            {s.rate.toLocaleString("en-IN")}
                          </td>
                          <td className="px-3 py-2 text-right font-medium text-gray-900 tabular-nums">
                            {s.amount.toLocaleString("en-IN")}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            <Card title="Costs">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <InfoField label="Labour Cost" value={formatCurrency(card.labourCost)} />
                <InfoField label="External Service Cost" value={formatCurrency(card.serviceCost)} />
                <InfoField label="Total Cost" value={formatCurrency(card.totalCost)} highlight />
              </div>
            </Card>

            {card.remarks && (
              <Card title="Remarks">
                <p className="text-sm text-gray-700 whitespace-pre-wrap">
                  {card.remarks}
                </p>
              </Card>
            )}
          </div>

          <div className="space-y-6">
            {/* Approval Timeline */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <span className="inline-block w-1 h-3.5 bg-accent-500 rounded-sm" />
                Approval Timeline
              </h3>
              {!card.approval ? (
                <p className="text-sm text-gray-500">
                  Not yet submitted for approval.
                </p>
              ) : (
                (() => {
                  const approval = card.approval!;
                  // First row: who submitted the card.
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
                  value={formatDateTimeIST(card.createdAt)}
                />
                <InfoField label="Created By" value={userName(card.createdBy)} />
                <InfoField
                  label="Updated"
                  value={formatDateTimeIST(card.updatedAt)}
                />
                <InfoField label="Updated By" value={userName(card.updatedBy)} />
              </div>
            </div>
          </div>
        </div>
      </PageContainer>

      <ConfirmDialog
        open={action !== null}
        onClose={() => {
          if (!patchMutation.isPending) {
            setAction(null);
            setActionError(null);
          }
        }}
        onConfirm={runAction}
        title={action === "cancel" ? "Cancel Job Card" : "Close Job Card"}
        confirmLabel={action === "cancel" ? "Cancel Card" : "Close Card"}
        tone={action === "cancel" ? "danger" : "primary"}
        loading={patchMutation.isPending}
        message={
          <>
            {action === "cancel" ? (
              <>
                Cancel job card{" "}
                <span className="font-semibold text-gray-900">{card.jobNumber}</span>?
                The machine may return to service if no other cards are open.
              </>
            ) : (
              <>
                Close job card{" "}
                <span className="font-semibold text-gray-900">{card.jobNumber}</span>?
                The machine&apos;s last-service meter will be updated.
              </>
            )}
            {actionError && (
              <span className="mt-3 block rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {actionError}
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
        <span className="inline-block w-1 h-3.5 bg-accent-500 rounded-sm" />
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
  span,
}: {
  label: string;
  value: ReactNode;
  highlight?: boolean;
  span?: number;
}) {
  return (
    <div className={span === 4 ? "col-span-2 md:col-span-4" : ""}>
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
