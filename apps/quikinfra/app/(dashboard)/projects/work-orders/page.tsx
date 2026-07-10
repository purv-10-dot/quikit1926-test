"use client";

/**
 * Work Orders — list page (matches reference screenshot).
 *
 * Layout:
 *   [ Total WOs | Active | Total Value | Avg Progress ]      ← KPI cards
 *   [ 🔍 Search | filter | export ]                           ← action strip
 *   ┌──────────────────────────────────────────────────────┐
 *   │ WO DETAILS | PROJECT & TYPE | CONTRACTOR | SCHEDULE  │
 *   │             | VALUE & PROGRESS | STATUS | ACTIONS    │
 *   └──────────────────────────────────────────────────────┘
 *
 * Each row renders multi-line cells: WO number + date underneath,
 * project name with a "Work Order / Without Material" chip row,
 * contractor with icon, schedule (start - end), value with progress
 * bar + %, and a Draft/Approved/Closed status pill.
 */

import { toErrorMessage } from "@/lib/api/errors";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  Briefcase,
  CheckCircle2,
  IndianRupee,
  Percent,
  Search,
  Filter as FilterIcon,
  Download,
  Calendar,
  Building2,
  FileText,
  ChevronRight,
  Plus,
  Pencil,
  Trash2,
  Send,
  Check,
  X as XIcon,
} from "lucide-react";
import { PageHeader, PageContainer } from "@/components/PageShell";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { WorkOrderDrawer } from "./new/WorkOrderDrawer";
import {
  useWorkOrders,
  useUpdateWorkOrder,
} from "@/hooks/use-projects";
import { usePermissions, useMenuActions } from "@/hooks/use-permissions";

const MENU_KEY = "pm.work_orders";

const STATUS_COLORS: Record<string, string> = {
  draft:            "bg-slate-50 text-slate-600 border-slate-200",
  pending_approval: "bg-amber-50 text-amber-700 border-amber-200",
  approved:         "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected:         "bg-rose-50 text-rose-700 border-rose-200",
  in_progress:      "bg-sky-50 text-sky-700 border-sky-200",
  completed:        "bg-emerald-50 text-emerald-700 border-emerald-200",
  closed:           "bg-slate-100 text-slate-600 border-slate-300",
  inactive:         "bg-rose-50 text-rose-600 border-rose-200",
};

interface WorkOrderRow {
  id: string; woNumber?: string; type?: string; workType?: string;
  contractorName?: string; projectName?: string; status?: string;
  plannedStart?: string; plannedEnd?: string; createdAt?: string;
  progressPct?: number | string; totalAmount?: number | string;
  canActOnCurrentStep?: boolean;
  [key: string]: unknown;
}

export default function WorkOrdersPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { canAdd } = useMenuActions("/projects/work-orders");
  // Right-side "Add" drawer — replaces the previous full-page navigation
  // to /projects/work-orders/new. The /new route still works for direct
  // URL access; this just makes the list-page "+ New" button feel like
  // the rest of the app's QuickCreateDrawer flows.
  const [addDrawerOpen, setAddDrawerOpen] = useState(false);
  // Workflow confirmation — Submit / Approve / Reject route through a
  // shared ConfirmDialog so the UX matches Material Estimation + PR.
  const [workflowAction, setWorkflowAction] = useState<
    { kind: "submit" | "approve" | "reject"; row: WorkOrderRow } | null
  >(null);
  const [rejectReason, setRejectReason] = useState("");
  const [workflowPending, setWorkflowPending] = useState(false);
  // Server-side workflow errors (e.g. "No active Work Order workflow is
  // configured") render inline inside the confirm modal — same pattern as
  // Material Estimation — so the user doesn't get bounced through a native
  // browser alert.
  const [workflowError, setWorkflowError] = useState<string | null>(null);

  const { data: result, isLoading } = useWorkOrders({ search });
  const updateMutation = useUpdateWorkOrder();

  // RBAC — mirrors the Material Estimation gate.
  const { permissionMatrix, isSuper } = usePermissions();
  const matrixRow = permissionMatrix?.[MENU_KEY];
  const canEdit = isSuper || !matrixRow || matrixRow.edit !== false;
  const canDelete = isSuper || !matrixRow || matrixRow.delete !== false;
  const canSubmit = canEdit;
  // Approve/Reject visibility is decided PER ROW by the workflow's
  // current step (server-computed in the list API as
  // `row.canActOnCurrentStep`).
  const canApproveRow = (row: WorkOrderRow): boolean =>
    isSuper || row?.canActOnCurrentStep === true;

  const openWorkflow = (
    kind: "submit" | "approve" | "reject",
    row: WorkOrderRow,
  ) => {
    setRejectReason("");
    setWorkflowError(null);
    setWorkflowAction({ kind, row });
  };
  const closeWorkflow = () => {
    if (workflowPending) return;
    setWorkflowAction(null);
    setRejectReason("");
    setWorkflowError(null);
  };
  const runWorkflowAction = async () => {
    if (!workflowAction) return;
    const { kind, row } = workflowAction;
    setWorkflowPending(true);
    setWorkflowError(null);
    try {
      if (kind === "submit") {
        const res = await fetch(
          `/api/projects/work-orders/${row.id}/submit`,
          { method: "POST" },
        );
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      } else {
        const action = kind === "approve" ? "approve" : "reject";
        const res = await fetch(
          `/api/projects/work-orders/${row.id}/approve`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action,
              comments: kind === "reject" ? rejectReason.trim() : undefined,
            }),
          },
        );
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      }
      qc.invalidateQueries({ queryKey: ["work-orders"] });
      setWorkflowAction(null);
      setRejectReason("");
      setWorkflowError(null);
    } catch (err: unknown) {
      // Keep the modal open so the user can read the failure reason
      // (e.g. "No active Work Order workflow is configured") without
      // bouncing through a native browser alert.
      setWorkflowError(toErrorMessage(err, "Action failed"));
    } finally {
      setWorkflowPending(false);
    }
  };

  const allRows = useMemo(() => (result?.data ?? []) as unknown as WorkOrderRow[], [result]);
  const rows = useMemo(
    () => allRows.filter((r) => r.status !== "inactive"),
    [allRows]
  );

  // KPIs
  const totalWOs = rows.length;
  const activeWOs = rows.filter(
    (r) => r.status === "approved" || r.status === "in_progress"
  ).length;
  const totalValue = rows.reduce((s, r) => s + (Number(r.totalAmount) || 0), 0);
  const avgProgress =
    rows.length === 0
      ? 0
      : rows.reduce((s, r) => s + (Number(r.progressPct) || 0), 0) / rows.length;

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await updateMutation.mutateAsync({
        id: deleteTarget.id,
        status: "inactive",
      });
      setDeleteTarget(null);
    } catch { /* error toast handled globally */ }
    finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Work Orders"
        subtitle="Assign BOQ scope to contractors with negotiated rates"
        breadcrumbs={[
          { label: "Projects", href: "/projects" },
          { label: "Work Orders" },
        ]}
        actions={
          canAdd ? (
            <button
              type="button"
              onClick={() => setAddDrawerOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold text-white bg-gradient-to-b from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 shadow-brand active:translate-y-[1px] transition-all"
            >
              <Plus className="w-4 h-4" /> New Work Order
            </button>
          ) : null
        }
      />

      <PageContainer>
        {/* ── KPI cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
          <KPICard
            icon={<Briefcase className="w-5 h-5" />}
            label="Total Work Orders"
            value={totalWOs.toString()}
            tone="indigo"
          />
          <KPICard
            icon={<CheckCircle2 className="w-5 h-5" />}
            label="Active WOs"
            value={activeWOs.toString()}
            tone="green"
          />
          <KPICard
            icon={<IndianRupee className="w-5 h-5" />}
            label="Total Value"
            value={`₹${totalValue.toLocaleString("en-IN", {
              maximumFractionDigits: 0,
            })}`}
            tone="indigo"
          />
          <KPICard
            icon={<Percent className="w-5 h-5" />}
            label="Avg. Progress"
            value={`${avgProgress.toFixed(1)}%`}
            tone="amber"
          />
        </div>

        {/* ── Action strip ── */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-soft overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white">
            <div className="flex items-center gap-2 flex-1 max-w-sm">
              <div className="relative w-full">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search Work Orders…"
                  className="w-full text-sm pl-9 pr-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-400 transition-shadow"
                />
              </div>
            </div>
            <button
              type="button"
              className="p-2 text-slate-400 hover:text-orange-700 hover:bg-orange-50 rounded-lg border border-transparent hover:border-orange-200 transition-colors"
              title="Filters"
            >
              <FilterIcon className="w-4 h-4" />
            </button>
            <button
              type="button"
              className="p-2 text-slate-400 hover:text-orange-700 hover:bg-orange-50 rounded-lg border border-transparent hover:border-orange-200 transition-colors"
              title="Export"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>

          {/* ── Table ── */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gradient-to-b from-slate-50 to-slate-100/70 border-b border-slate-200">
                <tr className="text-[11px] uppercase font-bold text-slate-600 tracking-wider">
                  <th className="px-4 py-3 text-left">WO Details</th>
                  <th className="px-4 py-3 text-left">Project & Type</th>
                  <th className="px-4 py-3 text-left">Contractor</th>
                  <th className="px-4 py-3 text-left">Schedule</th>
                  <th className="px-4 py-3 text-left">Value & Progress</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-500">
                      Loading work orders…
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-16 text-center">
                      <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-orange-50 text-orange-500 mb-3 ring-4 ring-orange-50/60">
                        <Briefcase className="w-6 h-6" />
                      </div>
                      <div className="text-sm font-semibold text-slate-800">
                        No work orders yet
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        Click <b className="text-orange-700">New Work Order</b> to create one.
                      </p>
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => (
                    <WorkOrderRow
                      key={row.id}
                      row={row}
                      canEdit={canEdit}
                      canDelete={canDelete}
                      canSubmit={canSubmit}
                      canApprove={canApproveRow(row)}
                      onOpen={() => router.push(`/projects/work-orders/${row.id}`)}
                      onEdit={() =>
                        router.push(`/projects/work-orders/${row.id}/edit`)
                      }
                      onDelete={() => setDeleteTarget(row)}
                      onSubmit={() => openWorkflow("submit", row)}
                      onApprove={() => openWorkflow("approve", row)}
                      onReject={() => openWorkflow("reject", row)}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </PageContainer>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => !deleting && setDeleteTarget(null)}
        onConfirm={confirmDelete}
        loading={deleting}
        tone="danger"
        title="Delete Work Order"
        confirmLabel="Delete"
        message={
          deleteTarget ? (
            <>
              Mark{" "}
              <span className="font-semibold text-slate-900">
                {deleteTarget.woNumber}
              </span>{" "}
              as inactive? It will be hidden from the list.
            </>
          ) : null
        }
      />

      <ConfirmDialog
        open={!!workflowAction}
        onClose={closeWorkflow}
        onConfirm={runWorkflowAction}
        loading={workflowPending}
        tone={workflowAction?.kind === "reject" ? "danger" : "primary"}
        title={
          workflowAction?.kind === "submit"
            ? "Submit for Approval"
            : workflowAction?.kind === "approve"
              ? "Approve Work Order"
              : workflowAction?.kind === "reject"
                ? "Reject Work Order"
                : ""
        }
        confirmLabel={
          workflowAction?.kind === "submit"
            ? "Submit"
            : workflowAction?.kind === "approve"
              ? "Approve"
              : "Reject"
        }
        message={
          workflowAction ? (
            <div className="space-y-3">
              <div>
                {workflowAction.kind === "submit" && (
                  <>
                    Send work order{" "}
                    <span className="font-semibold text-slate-900">
                      {workflowAction.row.woNumber ?? ""}
                    </span>{" "}
                    into the approval queue? You won&apos;t be able to edit it
                    until an approver actions it.
                  </>
                )}
                {workflowAction.kind === "approve" && (
                  <>
                    Approve work order{" "}
                    <span className="font-semibold text-slate-900">
                      {workflowAction.row.woNumber ?? ""}
                    </span>
                    ? Once approved it becomes the binding contract with the
                    contractor.
                  </>
                )}
                {workflowAction.kind === "reject" && (
                  <>
                    Reject work order{" "}
                    <span className="font-semibold text-slate-900">
                      {workflowAction.row.woNumber ?? ""}
                    </span>
                    ? The raiser will see your reason and can revise and
                    resubmit.
                  </>
                )}
              </div>
              {workflowAction.kind === "reject" && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Reason
                  </label>
                  <textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    rows={3}
                    placeholder="e.g. rate negotiation incomplete — pending finance sign-off"
                    disabled={workflowPending}
                    autoFocus
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-rose-400 disabled:bg-slate-50 transition-shadow"
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

      <WorkOrderDrawer
        open={addDrawerOpen}
        onClose={() => setAddDrawerOpen(false)}
        onSaved={() => {
          setAddDrawerOpen(false);
          qc.invalidateQueries({ queryKey: ["work-orders"] });
        }}
      />
    </>
  );
}

function KPICard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "indigo" | "green" | "amber";
}) {
  // Map every legacy tone to the unified construction-ERP palette so all
  // KPIs across modules share one visual language (no indigo/green tone
  // contention with brand orange).
  const toneClasses = {
    indigo: "bg-orange-50 text-orange-600 ring-orange-100",      // Primary metric → brand
    green:  "bg-emerald-50 text-emerald-600 ring-emerald-100",   // Success / active
    amber:  "bg-amber-50 text-amber-600 ring-amber-100",         // Warn / progress
  }[tone];
  const stripe = {
    indigo: "from-orange-400 to-orange-600",
    green:  "from-emerald-400 to-emerald-600",
    amber:  "from-sky-400 to-sky-600",
  }[tone];
  return (
    <div className="relative bg-white border border-slate-200 rounded-xl shadow-soft px-5 py-4 flex items-center gap-4 overflow-hidden">
      <span aria-hidden className={`absolute top-0 left-0 h-0.5 w-full bg-gradient-to-r ${stripe} opacity-80`} />
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center ring-1 ${toneClasses}`}>
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
        <div className="text-xl font-bold text-slate-900 mt-0.5 tabular-nums">{value}</div>
      </div>
    </div>
  );
}

function WorkOrderRow({
  row,
  canEdit,
  canDelete,
  canSubmit,
  canApprove,
  onOpen,
  onEdit,
  onDelete,
  onSubmit,
  onApprove,
  onReject,
}: {
  row: WorkOrderRow;
  canEdit: boolean;
  canDelete: boolean;
  canSubmit: boolean;
  canApprove: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onSubmit: () => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const createdAt = row.createdAt
    ? new Date(row.createdAt).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "numeric",
        year: "numeric",
      })
    : "—";
  const status = String(row.status ?? "draft").toLowerCase();
  const isDraft = status === "draft";
  const isPending = status === "pending_approval";
  const isApproved = status === "approved";
  // Once approved, the WO is the contract with the contractor — silently
  // editing or deleting would break the audit trail. Lock both actions
  // but keep them visible (greyed) so the state is explicit.
  const baseLocked = isApproved;
  const lockReason = isApproved ? "Locked — work order is approved" : "";
  const statusColor = STATUS_COLORS[row.status ?? "draft"] ?? STATUS_COLORS.draft;
  const progressPct = Number(row.progressPct) || 0;
  const totalAmount = Number(row.totalAmount) || 0;

  return (
    <tr className="border-t border-slate-100 hover:bg-orange-50/40 transition-colors">
      {/* WO Details */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-orange-50 to-orange-100 text-orange-600 flex items-center justify-center shrink-0 ring-1 ring-orange-100">
            <FileText className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold text-slate-900">{row.woNumber}</div>
            <div className="text-[11px] text-slate-500">{createdAt}</div>
          </div>
        </div>
      </td>

      {/* Project & Type */}
      <td className="px-4 py-3">
        <div className="text-sm font-semibold text-slate-900">
          {row.projectName ?? "—"}
        </div>
        <div className="flex gap-1.5 mt-1">
          <span className="inline-block text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-orange-50 text-orange-700 border border-orange-200">
            {row.type ?? "Work Order"}
          </span>
          <span className="inline-block text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-50 text-slate-600 border border-slate-200">
            {row.workType ? row.workType.split(" ").slice(0, 2).join(" ") : "—"}
          </span>
        </div>
      </td>

      {/* Contractor */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2 text-sm text-slate-900">
          <Building2 className="w-3.5 h-3.5 text-slate-400" />
          {row.contractorName ?? "—"}
        </div>
      </td>

      {/* Schedule */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2 text-xs text-slate-700">
          <Calendar className="w-3.5 h-3.5 text-slate-400" />
          {formatDate(row.plannedStart) ?? "TBD"}
          <span className="text-slate-400">-</span>
          {formatDate(row.plannedEnd) ?? "TBD"}
        </div>
      </td>

      {/* Value & Progress */}
      <td className="px-4 py-3">
        <div className="text-sm font-bold text-slate-900 tabular-nums">
          ₹{totalAmount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
        </div>
        <div className="mt-1">
          <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden w-24">
            <div
              className="h-full bg-gradient-to-r from-orange-400 to-orange-600 rounded-full transition-all"
              style={{ width: `${Math.min(100, progressPct)}%` }}
            />
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5 font-semibold tabular-nums">
            {progressPct.toFixed(0)}%
          </div>
        </div>
      </td>

      {/* Status */}
      <td className="px-4 py-3">
        <span
          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${statusColor}`}
        >
          {(row.status ?? "draft").replace(/_/g, " ")}
        </span>
      </td>

      {/* Actions */}
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1 flex-wrap">
          {canEdit && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (baseLocked) return;
                onEdit();
              }}
              disabled={baseLocked}
              className={`p-1.5 rounded-lg transition-colors ${
                baseLocked
                  ? "text-slate-300 cursor-not-allowed"
                  : "text-slate-500 hover:bg-orange-50 hover:text-orange-700"
              }`}
              title={baseLocked ? lockReason : "Edit"}
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
          {canDelete && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (baseLocked) return;
                onDelete();
              }}
              disabled={baseLocked}
              className={`p-1.5 rounded-lg transition-colors ${
                baseLocked
                  ? "text-slate-300 cursor-not-allowed"
                  : "text-slate-500 hover:bg-rose-50 hover:text-rose-600"
              }`}
              title={baseLocked ? lockReason : "Delete"}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Workflow actions — filled pills so they stand out from the
              base icon buttons; mirrors the Material Estimation UX. */}
          {isDraft && canSubmit && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSubmit();
              }}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold text-orange-700 bg-orange-50 border border-orange-200 hover:bg-orange-100 transition"
              title="Submit for approval"
            >
              <Send className="w-3 h-3" /> Submit
            </button>
          )}
          {isPending && canApprove && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onApprove();
                }}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 transition"
                title="Approve"
              >
                <Check className="w-3 h-3" /> Approve
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onReject();
                }}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100 transition"
                title="Reject"
              >
                <XIcon className="w-3 h-3" /> Reject
              </button>
            </>
          )}
          {isPending && !canApprove && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200">
              Awaiting approver
            </span>
          )}
          {isApproved && (
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200"
              title={lockReason}
            >
              <Check className="w-3 h-3" /> Locked
            </span>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              window.open(
                `/api/projects/work-orders/${row.id}/preview/pdf`,
                "_blank",
                "noopener",
              );
            }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-orange-700 hover:bg-orange-50 transition-colors"
            title="View PDF"
          >
            <FileText className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onOpen}
            className="p-1.5 rounded-lg text-slate-400 hover:text-orange-700 hover:bg-orange-50 transition-colors"
            title="Open"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function formatDate(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
