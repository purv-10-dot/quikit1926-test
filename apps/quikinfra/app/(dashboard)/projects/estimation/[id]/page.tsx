"use client";

/**
 * Material Estimation — detail page with inline edit.
 *
 * Edit no longer opens a drawer modal; clicking Edit flips the page into
 * an inline edit mode where the Overview's editable fields (Phase,
 * Status) become dropdowns and the Material Composition rows become
 * editable inputs — same form shape the drawer used to collect, but
 * directly on the detail surface so the user never loses their place.
 *
 * Fields kept read-only in edit mode:
 *   - Project, BOQ No, BOQ Item, BOQ Quantity — changing these
 *     conceptually creates a new estimation. The drawer locks them too.
 *
 * Fields editable in edit mode:
 *   - Phase (dropdown), Status (dropdown)
 *   - Material composition: qty/unit, waste %, std rate — inputs
 *   - Add / Remove material rows
 *
 * Everything else (Delete, Submit for Approval, Approve/Reject) behaves
 * the same as before and is hidden while editing so the user can't
 * accidentally fire a workflow transition on unsaved changes.
 */

import { toErrorMessage } from "@/lib/api/errors";
import { formatDateTimeIST } from "@/lib/format/datetime";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Pencil,
  Plus,
  Send,
  Trash2,
  X as XIcon,
  Package,
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
import { GroupedMaterialSelect, type GroupedMaterialSelectItem } from "@/components/GroupedMaterialSelect";
import {
  useEstimation,
  useUpdateEstimation,
} from "@/hooks/use-projects";
import { useItems, useItemGroups } from "@/hooks/use-masters";
import { usePermissions } from "@/hooks/use-permissions";

const MENU_KEY = "pm.estimation";

import type { ApprovalHistoryEntry } from "@/lib/approvals/approval-info";
import type { EstimationMaterial, EstimationDetail } from "@/lib/projects/estimation-detail";

/**
 * Shared template for every element in the PageHeader actions row.
 * Same padding, radius, height, font-weight, icon size — only the
 * tone (see PILL_TONE) changes. Keeps Status · Edit · Submit reading
 * as a single coordinated group instead of three ad-hoc controls.
 */
const HEADER_PILL =
  "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors whitespace-nowrap shrink-0";

const PILL_TONE = {
  gray:     "bg-gray-50 text-gray-700 border-gray-200",
  blue:     "bg-orange-50 text-orange-700 border-orange-200",
  orange:   "bg-orange-50 text-orange-700 border-orange-200",
  emerald:  "bg-emerald-50 text-emerald-700 border-emerald-200",
  rose:     "bg-rose-50 text-rose-700 border-rose-200",
  amber:    "bg-amber-50 text-amber-700 border-amber-200",
  disabled: "bg-gray-50 text-gray-400 border-gray-200",
} as const;

/** Pick the right tone for the status pill without hard-coding at the call site. */
function statusPillTone(status: string | null | undefined): string {
  const s = String(status ?? "draft").toLowerCase();
  if (s === "approved" || s === "approved_stock_available" || s === "approved_indent_required") {
    return PILL_TONE.emerald;
  }
  if (s === "rejected") return PILL_TONE.rose;
  if (s === "pending_approval") return PILL_TONE.amber;
  if (s === "inactive") return PILL_TONE.disabled;
  return PILL_TONE.gray;
}

/** Human-readable label so "pending_approval" renders as "Pending Approval". */
function statusLabel(status: string | null | undefined): string {
  const s = String(status ?? "draft");
  return s
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

// Same enums the drawer used to expose so form state stays interchangeable
// with existing estimations saved from the drawer.
const PHASES = [
  "Foundation",
  "Sub-structure",
  "Superstructure",
  "Finishing",
  "MEP",
  "External",
];
const STATUSES = ["Draft", "Active", "Approved", "Closed"];

/** Form shape per material row during inline edit. */
interface MaterialLine {
  itemId: string;
  itemName: string;
  uomCode: string;
  qtyPerUnit: string;
  wasteFactor: string;
  standardRate: string;
}

const newLine = (): MaterialLine => ({
  itemId: "",
  itemName: "",
  uomCode: "",
  qtyPerUnit: "",
  wasteFactor: "0",
  standardRate: "",
});

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

/** Compute row totals the same way the drawer did on save. */
function rowTotals(row: MaterialLine, boqQuantity: number) {
  const qtyPerUnit = parseFloat(row.qtyPerUnit) || 0;
  const wastePercent = parseFloat(row.wasteFactor) || 0;
  const rate = parseFloat(row.standardRate) || 0;
  const requiredQty = qtyPerUnit * (boqQuantity || 0);
  const totalQty = requiredQty * (1 + wastePercent / 100);
  return { qtyPerUnit, wastePercent, rate, requiredQty, totalQty, estimatedCost: totalQty * rate };
}

export default function EstimationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();
  const { data: estimation, isLoading } = useEstimation(id);
  const { data: itemsData } = useItems();
  const { data: itemGroupsData } = useItemGroups();
  const updateMutation = useUpdateEstimation();

  const { permissionMatrix, isSuper } = usePermissions();
  const matrixRow = permissionMatrix?.[MENU_KEY];
  const canEdit = isSuper || !matrixRow || matrixRow.edit !== false;
  // Detail page intentionally does NOT expose Delete — destructive
  // actions live on the list only. `canDelete` from the matrix is
  // consulted there, not here.
  const canSubmit = canEdit;
  // Approve/Reject visibility is driven by the actual workflow step the
  // instance is parked on (server-computed in the estimation GET), not
  // by the caller's role. Falls back to false until the approval payload
  // arrives so we don't flash buttons during initial load.
  const canApprove =
    isSuper || estimation?.approval?.canActOnCurrentStep === true;

  const [workflowAction, setWorkflowAction] = useState<
    "submit" | "approve" | "reject" | null
  >(null);
  const [rejectReason, setRejectReason] = useState("");
  const [workflowPending, setWorkflowPending] = useState(false);
  // Error message shown inline at the bottom of the workflow dialog when
  // submit / approve / reject fails (e.g. "No active Material Estimation
  // workflow is configured."). Mirrors the PR / PO / Indent flows so
  // server-side workflow errors stay inside the modal instead of falling
  // back to a native browser alert.
  const [workflowError, setWorkflowError] = useState<string | null>(null);

  // ── Inline edit state ──────────────────────────────────────────
  const [isEditing, setIsEditing] = useState(false);
  const [phase, setPhase] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [lines, setLines] = useState<MaterialLine[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const items = (itemsData?.data ?? []) as unknown as Array<
    GroupedMaterialSelectItem & { standardRate?: number | string | null }
  >;
  const itemGroups = itemGroupsData?.data ?? [];

  const status = String(estimation?.status ?? "draft").toLowerCase();
  const isDraft = status === "draft";
  const isPending = status === "pending_approval";
  const isApproved = status === "approved";
  const isRejected = status === "rejected";
  const isInactive = status === "inactive";
  const baseLocked = isApproved || isInactive;

  // Seed the form whenever the estimation payload arrives or the user
  // flips back into edit mode after a save.
  const seedFromEstimation = () => {
    if (!estimation) return;
    setPhase(estimation.phase ?? "");
    setEditStatus(estimation.status ?? "Draft");
    const seeded: MaterialLine[] = (Array.isArray(estimation.materials) ? estimation.materials : []).map(
      (m: EstimationMaterial) => ({
        itemId: m.itemId ?? "",
        itemName: m.itemName ?? "",
        uomCode: m.uomCode ?? "",
        qtyPerUnit: m.qtyPerUnit?.toString() ?? "",
        wasteFactor: m.wastePercent?.toString() ?? "0",
        standardRate: m.standardRate?.toString() ?? "",
      }),
    );
    setLines(seeded.length ? seeded : [newLine()]);
    setSaveError(null);
  };

  // Auto-seed when editing first becomes available (helps when a user
  // refreshes mid-edit; the form re-reads from server).
  useEffect(() => {
    if (isEditing) seedFromEstimation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditing, estimation?.id]);

  const materials: EstimationMaterial[] = useMemo(
    () => (Array.isArray(estimation?.materials) ? estimation.materials : []),
    [estimation],
  );

  // Live totals during edit — previews what the user will save.
  const editTotals = useMemo(() => {
    const boqQty = Number(estimation?.boqQuantity) || 0;
    let totalQty = 0;
    let totalCost = 0;
    for (const l of lines) {
      const r = rowTotals(l, boqQty);
      totalQty += r.totalQty;
      totalCost += r.estimatedCost;
    }
    return { totalQty, totalCost };
  }, [lines, estimation?.boqQuantity]);

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

  const openWorkflow = (kind: "submit" | "approve" | "reject") => {
    setRejectReason("");
    setWorkflowError(null);
    setWorkflowAction(kind);
  };
  const closeWorkflow = () => {
    if (workflowPending) return;
    setWorkflowAction(null);
    setRejectReason("");
    setWorkflowError(null);
  };
  const runWorkflowAction = async () => {
    if (!workflowAction) return;
    setWorkflowPending(true);
    setWorkflowError(null);
    try {
      if (workflowAction === "submit") {
        const res = await fetch(`/api/estimations/${id}/submit`, {
          method: "POST",
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      } else {
        const action = workflowAction === "approve" ? "approve" : "reject";
        const res = await fetch(`/api/estimations/${id}/approve`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            comments:
              workflowAction === "reject" ? rejectReason.trim() : undefined,
          }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
      }
      qc.invalidateQueries({ queryKey: ["estimation", id] });
      qc.invalidateQueries({ queryKey: ["estimations"] });
      setWorkflowAction(null);
      setRejectReason("");
      setWorkflowError(null);
    } catch (err: unknown) {
      // Keep the modal open so the user can read the failure reason
      // (e.g. "No active Material Estimation workflow is configured")
      // without bouncing through a native browser alert.
      setWorkflowError(toErrorMessage(err, "Action failed"));
    } finally {
      setWorkflowPending(false);
    }
  };

// ── Inline edit handlers ───────────────────────────────────────
  const beginEdit = () => {
    seedFromEstimation();
    setIsEditing(true);
  };
  const cancelEdit = () => {
    setIsEditing(false);
    setSaveError(null);
  };
  const updateLine = (
    idx: number,
    field: keyof MaterialLine,
    value: string,
  ) => {
    setLines((prev) =>
      prev.map((row, i) => {
        if (i !== idx) return row;
        const next = { ...row, [field]: value };
        // Auto-fill name / UOM / rate when picking a material from master.
        if (field === "itemId") {
          if (value) {
            const item = items.find((it) => it.id === value);
            if (item) {
              next.itemName = item.name ?? "";
              next.uomCode = item.uomCode ?? "";
              next.standardRate = item.standardRate?.toString() ?? "";
            }
          } else {
            next.itemName = "";
            next.uomCode = "";
            next.standardRate = "";
          }
        }
        return next;
      }),
    );
  };
  const addLine = () => setLines((prev) => [...prev, newLine()]);
  const removeLine = (idx: number) =>
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)));

  const saveEdit = async () => {
    setSaveError(null);
    // Minimal validation — matches the drawer's rules.
    const validLines = lines.filter((l) => l.itemId && l.qtyPerUnit);
    if (validLines.length === 0) {
      setSaveError("Add at least one material with qty/unit.");
      return;
    }
    const boqQty = Number(estimation.boqQuantity) || 0;
    const materialsPayload = validLines.map((l) => {
      const r = rowTotals(l, boqQty);
      return {
        itemId: l.itemId,
        itemName: l.itemName,
        uomCode: l.uomCode,
        qtyPerUnit: r.qtyPerUnit,
        wastePercent: r.wastePercent,
        requiredQty: r.requiredQty,
        totalQty: r.totalQty,
        standardRate: r.rate,
        estimatedCost: r.estimatedCost,
      };
    });
    setSaving(true);
    try {
      await updateMutation.mutateAsync({
        id,
        phase,
        status: editStatus,
        materials: materialsPayload,
      });
      qc.invalidateQueries({ queryKey: ["estimation", id] });
      qc.invalidateQueries({ queryKey: ["estimations"] });
      setIsEditing(false);
    } catch (err: unknown) {
      setSaveError(toErrorMessage(err, "Save failed"));
    } finally {
      setSaving(false);
    }
  };

  // ApprovalTimeline expects { step, action, actionBy, actionAt, comments } —
  // map the API's history rows to that shape. Also format the timestamp
  // via toLocaleString so the panel doesn't render the raw ISO string.
  const approvalEntries =
    estimation.approval?.history?.map((h: ApprovalHistoryEntry) => ({
      step: h.stepOrder ?? 0,
      action: h.action,
      actionBy: h.actionByName ?? "User",
      actionAt: h.actionAt ? formatDateTimeIST(h.actionAt) : "",
      comments: h.comments ?? undefined,
    })) ?? [];

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
                    onClick={() => !baseLocked && beginEdit()}
                    disabled={baseLocked}
                    className={`${HEADER_PILL} ${
                      baseLocked
                        ? `${PILL_TONE.disabled} cursor-not-allowed`
                        : `${PILL_TONE.blue} hover:bg-orange-100`
                    }`}
                    title={
                      baseLocked
                        ? "Locked — estimation is approved"
                        : "Edit estimation"
                    }
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
                  <span className="font-medium text-gray-900 truncate">
                    {estimation.projectName ?? "—"}
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
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-gray-900">
                  Material Composition
                </h2>
              </div>
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-full">
                {isEditing ? lines.length : materials.length} line
                {(isEditing ? lines.length : materials.length) === 1 ? "" : "s"}
              </span>
            </div>

            {/* Warning banner when BOQ Qty is 0 — totals will all read
                zero regardless of rates/waste until the user sets it. */}
            {Number(estimation.boqQuantity) === 0 && (
              <div className="mx-6 mt-4 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[11px] text-amber-800 flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                BOQ Quantity is not set — every row&apos;s Total Qty and Amount
                will compute to zero.
              </div>
            )}

            {/* Read-only render */}
            {!isEditing && (
              <>
                {materials.length === 0 ? (
                  <div className="px-6 py-12 text-center">
                    <Package className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">No material lines.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="bg-gray-50 text-[10px] uppercase text-gray-500 tracking-wider border-b border-gray-200">
                        <tr>
                          <th className="px-4 py-3 text-left font-bold w-10">
                            #
                          </th>
                          <th className="px-4 py-3 text-left font-bold">
                            Material
                          </th>
                          <th className="px-4 py-3 text-right font-bold">
                            Qty / Unit
                          </th>
                          <th className="px-4 py-3 text-right font-bold">
                            Waste %
                          </th>
                          <th className="px-4 py-3 text-right font-bold">
                            Total Qty
                          </th>
                          <th className="px-4 py-3 text-right font-bold">
                            Std Rate (₹)
                          </th>
                          <th className="px-6 py-3 text-right font-bold">
                            Amount (₹)
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {materials.map((m: EstimationMaterial, idx: number) => (
                          <tr key={m.itemId ?? idx} className="hover:bg-indigo-50/20 transition-colors">
                            <td className="px-4 py-3 text-xs text-gray-400 tabular-nums">
                              {String(idx + 1).padStart(2, "0")}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-gray-900">
                                  {m.itemName ?? "—"}
                                </span>
                                {m.uomCode && (
                                  <span className="inline-flex items-center text-[10px] font-semibold uppercase tracking-wider text-teal-700 bg-teal-50 border border-teal-100 px-1.5 py-0.5 rounded">
                                    {m.uomCode}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                              {fmtQty(m.qtyPerUnit)}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums">
                              {m.wastePercent ? (
                                <span className="inline-flex items-center text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded">
                                  {m.wastePercent}%
                                </span>
                              ) : (
                                <span className="text-gray-400">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                              {fmtQty(m.totalQty)}
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums text-gray-700">
                              {fmtInr(m.standardRate)}
                            </td>
                            <td className="px-6 py-3 text-right tabular-nums font-semibold text-gray-900">
                              {fmtInr(m.estimatedCost)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-gradient-to-r from-gray-50 to-orange-50/40 border-t-2 border-gray-200 text-sm font-bold">
                        <tr>
                          <td className="px-4 py-3 uppercase text-[10px] tracking-wider text-gray-500" colSpan={6}>
                            Grand Total
                          </td>
                          <td className="px-6 py-3 text-right tabular-nums text-orange-700 text-base">
                            {fmtInr(estimation.totalCost)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </>
            )}

            {/* Edit render — editable rows + add/remove */}
            {isEditing && (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                    <tr>
                      <th className="px-4 py-2.5 text-left font-medium">
                        Material <span className="text-rose-500">*</span>
                      </th>
                      <th className="px-3 py-2.5 text-right font-medium w-28">
                        Qty / Unit <span className="text-rose-500">*</span>
                      </th>
                      <th className="px-3 py-2.5 text-right font-medium w-24">
                        Waste %
                      </th>
                      <th className="px-3 py-2.5 text-right font-medium w-28">
                        Total Qty
                      </th>
                      <th className="px-3 py-2.5 text-right font-medium w-28">
                        Std Rate (₹)
                      </th>
                      <th className="px-3 py-2.5 text-right font-medium w-32">
                        Amount (₹)
                      </th>
                      <th className="px-2 py-2.5 w-10" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {lines.map((l, idx) => {
                      const r = rowTotals(l, Number(estimation.boqQuantity) || 0);
                      return (
                        <tr key={idx}>
                          <td className="px-4 py-2">
                            <GroupedMaterialSelect
                              value={l.itemId}
                              onChange={(v) => updateLine(idx, "itemId", v)}
                              items={items}
                              groups={itemGroups.map((g) => ({
                                id: g.id,
                                name: g.name,
                                status: g.status,
                              }))}
                              placeholder="Select material…"
                              size="sm"
                            />
                            {l.uomCode && (
                              <div className="text-[10px] text-gray-500 mt-1">
                                {l.uomCode}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              step="0.0001"
                              min="0"
                              value={l.qtyPerUnit}
                              onChange={(e) =>
                                updateLine(idx, "qtyPerUnit", e.target.value)
                              }
                              className="w-full text-right text-sm px-2.5 py-1.5 border border-gray-300 rounded-md tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={l.wasteFactor}
                              onChange={(e) =>
                                updateLine(idx, "wasteFactor", e.target.value)
                              }
                              className="w-full text-right text-sm px-2.5 py-1.5 border border-gray-300 rounded-md tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-700">
                            {fmtQty(r.totalQty)}
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={l.standardRate}
                              onChange={(e) =>
                                updateLine(idx, "standardRate", e.target.value)
                              }
                              className="w-full text-right text-sm px-2.5 py-1.5 border border-gray-300 rounded-md tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums font-medium text-gray-900">
                            {fmtInr(r.estimatedCost)}
                          </td>
                          <td className="px-2 py-2 text-center">
                            <button
                              type="button"
                              onClick={() => removeLine(idx)}
                              disabled={lines.length <= 1}
                              title={
                                lines.length <= 1
                                  ? "At least one row is required"
                                  : "Remove row"
                              }
                              className="p-1.5 rounded-md text-gray-400 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-gray-50 text-sm font-semibold">
                    <tr>
                      <td className="px-4 py-3" colSpan={5}>
                        Total
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {fmtInr(editTotals.totalCost)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
                <div className="px-4 py-3 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={addLine}
                    className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Material
                  </button>
                </div>
              </div>
            )}
          </div>

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
function OverviewStat({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start min-w-0">
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
          {label}
        </div>
        <div className="mt-0.5 text-sm text-gray-900 truncate">{children}</div>
      </div>
    </div>
  );
}
