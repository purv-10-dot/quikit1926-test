"use client";

import { toErrorMessage } from "@/lib/api/errors";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Calculator, Check, Eye, Pencil, Send, Trash2, X as XIcon } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { PageFrame, PageHeader, PageContainer, StatusChip } from "@/components/PageShell";
import { DataTable, type ColDef } from "@/components/DataTable";
import { useEstimations, useUpdateEstimation } from "@/hooks/use-projects";
import { useProjects } from "@/hooks/use-masters";
import { usePermissions } from "@/hooks/use-permissions";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { toast } from "@/lib/toast";
import dynamic from "next/dynamic";
const EstimationDrawer = dynamic(
  () => import("./EstimationDrawer").then((m) => m.EstimationDrawer),
  { ssr: false },
);

// Matrix lookup helpers — read the effective permission matrix that
// `usePermissions` computes and ask "can this user add / edit /
// delete under the `pm.estimation` menu key?". Super admins bypass
// the matrix via `isSuper`.
const MENU_KEY = "pm.estimation";

interface EstimationRow {
  id: string; boqNo?: string; boqDescription?: string; boqUnit?: string;
  boqQuantity?: number | string; materialCount?: number; materials?: unknown[];
  totalCost?: number | string; status?: string; canActOnCurrentStep?: boolean;
  // Mirrors the server row in lib/projects/estimation-repository.ts — without
  // these the index signature below widens them to `unknown`.
  projectId: string; projectName?: string | null;
  [key: string]: unknown;
}

export default function EstimationPage() {
  const router = useRouter();
  // Drawer is for the CREATE flow only — Edit routes to the detail
  // page at /projects/estimation/[id]. Keeping the drawer here avoids
  // a second modal layout for quick new-row creation.
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editRow, setEditRow] = useState<any | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [deleting, setDeleting] = useState(false);
  // Workflow confirmation modal — replaces native window.confirm/prompt
  // so the UX matches the rest of the app (backdrop, tone colouring,
  // inline loading state, and a proper textarea for rejection reasons).
  const [workflowAction, setWorkflowAction] = useState<
    { kind: "submit" | "approve" | "reject"; row: EstimationRow } | null
  >(null);
  const [rejectReason, setRejectReason] = useState("");
  const [workflowPending, setWorkflowPending] = useState(false);
  // Surface API errors inline in the confirm modal instead of a top-right
  // toast — keeps the message next to the action that caused it (e.g.
  // "no workflow configured" when an admin hits Submit).
  const [workflowError, setWorkflowError] = useState<string | null>(null);

  const { data: projects } = useProjects();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("createdAt");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    setPage(1);
  }, [search, sortBy, sortOrder, pageSize]);

  // `excludeInactive` hides soft-deleted rows server-side so the pager's
  // totals and pages are accurate (the old client filter would leave short
  // pages). PR drawer / consumption callers use the unpaged path instead.
  const { data: result, isLoading } = useEstimations(null, {
    search: search || undefined,
    page,
    pageSize,
    sortBy,
    sortOrder,
    excludeInactive: true,
  });
  const updateMutation = useUpdateEstimation();
  const qc = useQueryClient();
  const data = useMemo(() => result?.data ?? [], [result]);
  const total = result?.total ?? 0;

  // RBAC gating — hide New/Edit/Delete controls when the user's
  // permission matrix doesn't grant the action on `pm.estimation`.
  // Super admins (`isSuper`) and users with no matrix bypass the
  // check and retain full access.
  const { me, permissionMatrix, isSuper, hasModule } = usePermissions();

  // Scope the project list to projects the user is actually assigned
  // to. `me.projectIds === null` means "unrestricted" (super admin /
  // cross-site role) — show everything. An empty array means restricted
  // with no assignments — show nothing. Otherwise intersect.
  //
  // Without this scoping, site-bound users saw every project in the
  // tenant on the Material Estimation drawer and list filter even
  // though they couldn't actually open estimations for those projects.
  const visibleProjects = useMemo(() => {
    const all = (projects?.data ?? []).filter(
      (p) => p?.status !== "inactive",
    );
    const allowed = me?.projectIds ?? null;
    if (allowed === null) return all;
    if (allowed.length === 0) return [];
    const allow = new Set(allowed);
    return all.filter((p) => allow.has(p.id));
  }, [projects?.data, me?.projectIds]);

  const freeScopeProjectIds = useMemo(
    () =>
      new Set(
        (projects?.data ?? [])
          .filter((p) => p?.executionMode === "FREE_SCOPE")
          .map((p) => p.id),
      ),
    [projects?.data],
  );
  const matrixRow = permissionMatrix?.[MENU_KEY];
  const canAdd = isSuper || !matrixRow || matrixRow.add !== false;
  const canEdit = isSuper || !matrixRow || matrixRow.edit !== false;
  const canDelete = isSuper || !matrixRow || matrixRow.delete !== false;
  // Submit = the raiser can push a draft into the approval queue.
  // Uses the same gate as Edit since the creator is the submitter.
  const canSubmit = canEdit;
  // Approve/Reject visibility is decided PER ROW by the workflow's
  // current step (server-computed in the list API as
  // `row.canActOnCurrentStep`). The role-based fallback is gone —
  // it caused approvers further down the chain (and raisers whose
  // step auto-skipped) to see buttons they couldn't actually use.
  const canApproveRow = (row: EstimationRow): boolean =>
    isSuper || row?.canActOnCurrentStep === true;
  // Additional sanity check: the user must have the PROJECT MGMT module
  // assigned at all. Use the short module key ("project_mgmt") the user
  // record actually stores — `hasModule` from the hook handles the
  // super-admin / unrestricted cases. An earlier version compared
  // against the uppercase label "PROJECT MGMT" and always evaluated
  // false, hiding New/Edit/Delete for every site admin.
  const hasEstimationModule = hasModule("project_mgmt");

  // Status-transition helpers. All three open a shared ConfirmDialog
  // driven by `workflowAction`; confirmation fires `runWorkflowAction`
  // which reuses `updateMutation` so the list auto-refreshes (React
  // Query invalidates on success) and the chip flips colour without
  // a page reload.
  const openWorkflow = (kind: "submit" | "approve" | "reject", row: EstimationRow) => {
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
  // Route all three actions through the real workflow endpoints so a
  // `CnApprovalInstance` is created / advanced / closed properly — same
  // path PR/Indent/PO use. Falling back to a direct PATCH would skip
  // the approval-chain bookkeeping and the "who approved what" audit
  // trail the detail page renders.
  const runWorkflowAction = async () => {
    if (!workflowAction) return;
    const { kind, row } = workflowAction;
    setWorkflowPending(true);
    setWorkflowError(null);
    try {
      if (kind === "submit") {
        const res = await fetch(`/api/estimations/${row.id}/submit`, {
          method: "POST",
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      } else {
        const action = kind === "approve" ? "approve" : "reject";
        const res = await fetch(`/api/estimations/${row.id}/approve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            comments: kind === "reject" ? rejectReason.trim() : undefined,
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      }
      // Refresh the list so the status chip flips immediately.
      qc.invalidateQueries({ queryKey: ["estimations"] });
      toast.success(
        kind === "submit"
          ? "Submitted for approval"
          : kind === "approve"
            ? "Estimation approved"
            : "Estimation rejected",
      );
      setWorkflowAction(null);
      setRejectReason("");
    } catch (err: unknown) {
      setWorkflowError(toErrorMessage(err, "Action failed"));
    } finally {
      setWorkflowPending(false);
    }
  };

  // Soft-deleted (inactive) rows are excluded server-side via
  // `excludeInactive` above, so `data` is already the visible set.

  const openCreate = () => {
    setEditRow(null);
    setDrawerOpen(true);
  };
  // Edit opens the full-page edit form (mirrors the Work Order edit page)
  // rather than the read-only detail page or a drawer.
  const openEdit = (row: EstimationRow) => {
    router.push(`/projects/estimation/${row.id}/edit`);
  };
  // Edit now routes to the detail page so the form has a full-page
  // surface and workflow actions don't have to stack modals. The
  // status chip and the Edit icon in the Actions column both use this.
  const openDetail = (row: EstimationRow) => {
    router.push(`/projects/estimation/${row.id}`);
  };
  const closeDrawer = () => {
    setDrawerOpen(false);
    setEditRow(null);
  };

  // Soft delete = set status to "inactive". The row stays in the
  // demo-store but is filtered out of `visibleData` above.
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

  const columns: ColDef<EstimationRow>[] = [
    {
      key: "boqNo",
      label: "BOQ No",
      width: "110px",
      sortable: true,
      searchable: true,
      render: (row) => (
        <span className="text-xs font-semibold text-gray-700">
          {row.boqNo ?? "—"}
        </span>
      ),
    },
    {
      key: "boqDescription",
      label: "BOQ Item",
      sortable: false,
      searchable: true,
      render: (row) => {
        const desc = row.boqDescription ?? "—";
        const sliced = desc.length > 60 ? `${desc.slice(0, 60).trimEnd()}…` : desc;
        return (
          <span className="text-gray-900" title={desc}>
            {sliced}
          </span>
        );
      },
    },
    {
      key: "projectName",
      label: "Project",
      sortable: true,
      searchable: true,
      render: (row) => (
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="truncate">{row.projectName}</span>
          {freeScopeProjectIds.has(row.projectId) && (
            <span className="shrink-0 whitespace-nowrap rounded bg-accent-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-accent-700 border border-accent-200">
              Free-Scope
            </span>
          )}
        </div>
      ),
    },
    {
      key: "boqQuantity",
      label: "BOQ Qty",
      type: "number",
      sortable: false,
      render: (row) =>
        row.boqQuantity
          ? `${Number(row.boqQuantity).toLocaleString("en-IN")} ${row.boqUnit ?? ""}`
          : "—",
    },
    {
      key: "phase",
      label: "Phase",
      width: "130px",
      sortable: true,
    },
    {
      key: "materialCount",
      label: "Materials",
      type: "number",
      width: "90px",
      sortable: false,
      render: (row) => row.materialCount ?? row.materials?.length ?? 0,
    },
    {
      key: "totalCost",
      label: "Est. Cost",
      type: "number",
      sortable: true,
      render: (row) =>
        row.totalCost ? (
          <span className="whitespace-nowrap tabular-nums">
            ₹ {Number(row.totalCost).toLocaleString("en-IN", { maximumFractionDigits: 0 })}
          </span>
        ) : (
          "—"
        ),
    },
    {
      key: "status",
      label: "Status",
      width: "120px",
      sortable: true,
      render: (row) => <StatusChip status={row.status ?? "draft"} />,
    },
    {
      key: "__actions",
      label: "Actions",
      // View/Edit/Delete are icon-only; Submit/Approve/Reject render as
      // labeled pills (matches the Work Orders list), so the column
      // needs enough room for the icons plus "Approve" + "Reject" to sit
      // on one line without wrapping. Right-aligned so the controls sit at
      // the end of the row, grouped next to the history icon.
      width: "240px",
      sortable: false,
      searchable: false,
      hideable: false,
      freezable: false,
      align: "right",
      render: (row) => {
        // Normalize so empty string / null / mixed-case all collapse to
        // a single canonical lowercase value before the comparisons.
        // Without this, `?? "draft"` only catches null/undefined and an
        // empty string slips through, which is why the Submit pill was
        // not rendering for rows whose status came back as "".
        const status = String(row.status ?? "").trim().toLowerCase() || "draft";
        const isDraft = status === "draft";
        const isPending = status === "pending_approval" || status === "submitted";
        const isApproved = status === "approved";
        // Submitted and approved rows can't be edited/deleted — the
        // raiser is told at submit time that the row is frozen until the
        // approver acts, and any silent change afterwards would break the
        // audit trail the downstream procurement flow reads. Buttons stay
        // visible (greyed) with a lock tooltip.
        const baseLocked = isPending || isApproved;
        const lockReason = isPending
          ? "Locked — awaiting approver action"
          : "Locked — estimation is approved";

        return (
          <div className="flex items-center justify-end gap-0.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openDetail(row);
              }}
              className="inline-flex items-center justify-center w-7 h-7 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition"
              title="View"
              aria-label="View"
            >
              <Eye className="w-3.5 h-3.5" />
            </button>
            {canEdit && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (baseLocked) return;
                  openEdit(row);
                }}
                disabled={baseLocked}
                className={`inline-flex items-center justify-center w-7 h-7 rounded-md transition ${
                  baseLocked
                    ? "text-gray-300 cursor-not-allowed"
                    : "text-accent-600 hover:bg-accent-50 hover:text-accent-700"
                }`}
                title={baseLocked ? lockReason : "Edit"}
                aria-label="Edit"
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
                  setDeleteTarget(row);
                }}
                disabled={baseLocked}
                className={`inline-flex items-center justify-center w-7 h-7 rounded-md transition ${
                  baseLocked
                    ? "text-gray-300 cursor-not-allowed"
                    : "text-red-600 hover:bg-red-50 hover:text-red-700"
                }`}
                title={baseLocked ? lockReason : "Delete"}
                aria-label="Delete"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
            {isDraft && canSubmit && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  openWorkflow("submit", row);
                }}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold text-orange-700 bg-orange-50 border border-orange-200 hover:bg-orange-100 transition"
                title="Submit for approval"
              >
                <Send className="w-3 h-3" /> Submit
              </button>
            )}
            {isPending && canApproveRow(row) && (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openWorkflow("approve", row);
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
                    openWorkflow("reject", row);
                  }}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 hover:bg-rose-100 transition"
                  title="Reject"
                >
                  <XIcon className="w-3 h-3" /> Reject
                </button>
              </>
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
        title="Material Estimation"
        subtitle="Map BOQ leaf items to material compositions with waste percentages"
        breadcrumbs={[
          { label: "Projects", href: "/projects" },
          { label: "Material Estimation" },
        ]}
      />

      <PageContainer fill>
        <div className="mb-4 inline-flex items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 shadow-sm">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-slate-500 to-slate-700 text-white">
            <Calculator className="h-4 w-4" />
          </span>
          <span className="text-xl font-bold tabular-nums leading-none text-slate-900">
            {isLoading ? "—" : total}
          </span>
          <span className="text-sm font-medium text-slate-500">
            Total estimations
          </span>
        </div>
        <DataTable
          id="projects-estimation"
          columns={columns}
          data={data as unknown as EstimationRow[]}
          loading={isLoading}
          serverMode
          serverTotal={total}
          serverPage={page}
          serverPageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          onSearchChange={setSearch}
          onSortChange={(key, dir) => {
            setSortBy(key);
            setSortOrder(dir);
          }}
          // RBAC: `onAdd` is only wired when the user's matrix grants
          // the "add" action on `pm.estimation`. Passing `undefined`
          // causes the DataTable to hide its "+ New" button entirely.
          onAdd={canAdd && hasEstimationModule ? openCreate : undefined}
          addLabel="New Material Estimation"
          historyEntityType="material_estimations,material_estimation,estimation"
          getHistoryEntityId={(row) => String(row.id ?? "")}
          // Estimations have no document number, so the drawer's default
          // label resolution falls through to the raw row id. Build a
          // readable subtitle from the BOQ ref + item instead.
          getHistoryRowLabel={(row) => {
            const desc = String(row.boqDescription ?? "").trim();
            const short = desc.length > 48 ? `${desc.slice(0, 48).trimEnd()}…` : desc;
            const label = [row.boqNo, short].filter(Boolean).join(" · ");
            return label || String(row.projectName ?? "Material Estimation");
          }}
        />
      </PageContainer>
      </PageFrame>

      <EstimationDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        projects={visibleProjects}
        editData={editRow}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => !deleting && setDeleteTarget(null)}
        onConfirm={confirmDelete}
        loading={deleting}
        tone="danger"
        title="Delete Material Estimation"
        confirmLabel="Delete"
        message={
          deleteTarget ? (
            <>
              Mark the estimation for{" "}
              <span className="font-semibold text-gray-900">
                {deleteTarget.boqNo ?? ""}
              </span>
              {deleteTarget.boqDescription
                ? ` — ${deleteTarget.boqDescription}`
                : null}{" "}
              as inactive? It will be hidden from the list. You can recover
              it later via the demo-store JSON file or by editing the row.
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
              ? "Approve Estimation"
              : workflowAction?.kind === "reject"
                ? "Reject Estimation"
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
                    Send estimation{" "}
                    <span className="font-semibold text-gray-900">
                      {workflowAction.row.boqNo ?? ""}
                    </span>{" "}
                    into the approval queue? The raiser won&apos;t be able
                    to edit it again until an approver actions it.
                  </>
                )}
                {workflowAction.kind === "approve" && (
                  <>
                    Approve estimation{" "}
                    <span className="font-semibold text-gray-900">
                      {workflowAction.row.boqNo ?? ""}
                    </span>
                    {workflowAction.row.boqDescription
                      ? ` — ${workflowAction.row.boqDescription}`
                      : null}
                    ? Once approved it becomes the baseline for downstream
                    procurement.
                  </>
                )}
                {workflowAction.kind === "reject" && (
                  <>
                    Reject estimation{" "}
                    <span className="font-semibold text-gray-900">
                      {workflowAction.row.boqNo ?? ""}
                    </span>
                    ? The raiser will see your reason and can revise and
                    resubmit.
                  </>
                )}
              </div>
              {workflowAction.kind === "reject" && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Reason (optional)
                  </label>
                  <textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    rows={3}
                    placeholder="e.g. waste factor looks high on cement line"
                    disabled={workflowPending}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500 disabled:bg-gray-50"
                  />
                </div>
              )}
              {workflowError && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
                >
                  <svg
                    aria-hidden
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    className="h-4 w-4 mt-0.5 shrink-0"
                  >
                    <path
                      fillRule="evenodd"
                      d="M18 10A8 8 0 11 2 10a8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span className="leading-snug">{workflowError}</span>
                </div>
              )}
            </div>
          ) : null
        }
      />
    </>
  );
}
