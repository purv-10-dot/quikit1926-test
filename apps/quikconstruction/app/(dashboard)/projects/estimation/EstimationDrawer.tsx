"use client";

/**
 * New Material Estimation modal.
 *
 * Built specifically for this page (not the generic QuickCreateDrawer)
 * so we can:
 *   - Use the BOQCascadingPicker for a drill-down BOQ selector
 *   - Auto-fill `boqQuantity` the moment a leaf is picked (read-only)
 *   - Manage a repeating "Material Composition" section with Add/Remove
 *   - Run its own validation before POSTing to /api/projects/:id/estimations
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { X, Plus, Trash2, Loader2, AlertTriangle, Save, Send, Check, XCircle } from "lucide-react";
import { usePermissions } from "@/hooks/use-permissions";
import { useUpdateEstimation } from "@/hooks/use-projects";
import { useQueryClient } from "@tanstack/react-query";
import { BOQCascadingPicker, type BoqRow } from "@/components/BOQCascadingPicker";
import { useBOQ } from "@/hooks/use-projects";
import { useItems } from "@/hooks/use-masters";
import { PrimaryButton, SecondaryButton } from "@/components/PageShell";
import { SelectInput } from "@/components/FormDrawer";

interface MaterialLine {
  itemId: string;
  itemName: string;
  uomCode: string;
  qtyPerUnit: string;
  wasteFactor: string;
  standardRate: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Pre-select this project if the list page has a project filter active. */
  defaultProjectId?: string;
  /** Project list from the parent so the drawer doesn't re-fetch. */
  projects: Array<{ id: string; name: string; code?: string }>;
  /**
   * When present, the drawer opens in edit mode: form fields are
   * pre-filled from this row and Save hits PUT /api/estimations/:id
   * instead of POST /api/projects/:id/estimations. Pass null/undefined
   * for the create flow.
   */
  editData?: any | null;
}

const PHASES = [
  "Foundation",
  "Sub-structure",
  "Superstructure",
  "Finishing",
  "MEP",
  "External",
];

const STATUSES = ["Draft", "Active", "Approved", "Closed"];

const newLine = (): MaterialLine => ({
  itemId: "",
  itemName: "",
  uomCode: "",
  qtyPerUnit: "",
  wasteFactor: "0",
  standardRate: "",
});

export function EstimationDrawer({
  open,
  onClose,
  defaultProjectId,
  projects,
  editData,
}: Props) {
  const isEdit = !!editData?.id;
  const qc = useQueryClient();

  // Status-transition helpers for the approval flow. Use the same
  // update mutation as the list page so cache invalidation stays
  // consistent.
  const updateMutation = useUpdateEstimation();
  const { isSuper, hasRole } = usePermissions();
  const currentStatus = (editData?.status ?? "").toLowerCase();
  const isDraft = currentStatus === "draft";
  const isPending = currentStatus === "pending_approval";
  const canApprove =
    isSuper || hasRole(["tenant_admin", "project_manager"]);
  const [workflowPending, setWorkflowPending] = useState(false);
  // Which workflow action is being confirmed — drives an inline
  // confirmation sheet rendered inside the drawer card. We avoid
  // a nested ConfirmDialog here because modal-on-modal looked
  // cramped; the inline panel keeps the user anchored in context.
  const [workflowAction, setWorkflowAction] = useState<
    "submit" | "approve" | "reject" | null
  >(null);
  const [rejectReason, setRejectReason] = useState("");

  const openWorkflow = (kind: "submit" | "approve" | "reject") => {
    if (!editData?.id) return;
    setRejectReason("");
    setWorkflowAction(kind);
  };
  const closeWorkflow = () => {
    if (workflowPending) return;
    setWorkflowAction(null);
    setRejectReason("");
  };
  const runWorkflowAction = async () => {
    if (!editData?.id || !workflowAction) return;
    const patch =
      workflowAction === "submit"
        ? { status: "pending_approval" as const }
        : workflowAction === "approve"
          ? { status: "approved" as const }
          : {
              status: "rejected" as const,
              rejectionReason: rejectReason.trim() || null,
            };
    setWorkflowPending(true);
    try {
      await updateMutation.mutateAsync({ id: editData.id, ...patch });
      setWorkflowAction(null);
      setRejectReason("");
      onClose();
    } catch (err: any) {
      alert(err?.message ?? "Action failed");
    } finally {
      setWorkflowPending(false);
    }
  };
  const handleSubmitForApproval = () => openWorkflow("submit");
  const handleApprove = () => openWorkflow("approve");
  const handleReject = () => openWorkflow("reject");

  // Drawer owns its own project selection now that the list page
  // no longer gates on project. The filter's current project (if any)
  // is used as the initial value.
  const [projectId, setProjectId] = useState<string>("");

  // Only fetch BOQ once a project is chosen in the drawer.
  const { data: boqData, isLoading: boqLoading } = useBOQ(
    open && projectId ? projectId : null
  );
  const { data: itemsData } = useItems();

  const boqItems: BoqRow[] = useMemo(() => {
    const raw: any[] = (boqData as any)?.items ?? (boqData as any)?.data ?? [];
    return raw.map((r) => ({
      id: r.id,
      boq_no: r.boq_no ?? r.boqNo,
      parent_boq_no: r.parent_boq_no ?? r.parentBoqNo ?? null,
      depth: r.depth ?? 0,
      is_group: r.is_group ?? r.isGroup ?? false,
      display_name: r.display_name ?? r.displayName ?? "",
      unit: r.unit ?? null,
      tender_qty:
        r.tender_qty != null
          ? Number(r.tender_qty)
          : r.tenderQty != null
          ? Number(r.tenderQty)
          : null,
      category: r.category,
      // preserve sort order for the picker's per-parent sort
      sort_order: r.sort_order ?? r.sortOrder ?? 0,
    }));
  }, [boqData]);

  const items = (itemsData?.data ?? []) as any[];

  // Form state
  const [selectedLeaf, setSelectedLeaf] = useState<BoqRow | null>(null);
  const [phase, setPhase] = useState(PHASES[0]);
  const [status, setStatus] = useState(STATUSES[0]);
  const [lines, setLines] = useState<MaterialLine[]>([newLine()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Ref on the Material Composition section so we can scroll it into
  // view when validation fails — the modal body is taller than the
  // viewport and the section sits below the fold by default, which
  // made it easy for users to miss.
  const materialSectionRef = useRef<HTMLDivElement | null>(null);

  // Reset when opening — prevents stale state from a previous open.
  // In edit mode, pre-fill from `editData`; in create mode, start blank
  // with the default project (if the list page had a filter active).
  useEffect(() => {
    if (!open) return;
    if (editData) {
      setProjectId(editData.projectId ?? "");
      setPhase(editData.phase ?? PHASES[0]);
      setStatus(editData.status ?? STATUSES[0]);
      setLines(
        Array.isArray(editData.materials) && editData.materials.length > 0
          ? editData.materials.map((m: any) => ({
              itemId: m.itemId ?? "",
              itemName: m.itemName ?? "",
              uomCode: m.uomCode ?? "",
              qtyPerUnit: String(m.qtyPerUnit ?? ""),
              wasteFactor: String(m.wastePercent ?? "0"),
              standardRate: String(m.standardRate ?? ""),
            }))
          : [newLine()]
      );
      // selectedLeaf is populated by the effect below once the BOQ
      // tree for this project finishes loading.
      setSelectedLeaf(null);
    } else {
      setProjectId(defaultProjectId ?? "");
      setSelectedLeaf(null);
      setPhase(PHASES[0]);
      setStatus(STATUSES[0]);
      setLines([newLine()]);
    }
    setError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultProjectId, editData?.id]);

  // Clear the cascading picker whenever the project changes — the BOQ
  // tree is project-scoped, so the previously-picked leaf is stale.
  // In edit mode we skip this wipe on the FIRST render after the BOQ
  // tree arrives so the saved leaf can re-hydrate.
  useEffect(() => {
    if (isEdit) return; // edit flow handles leaf rehydrate separately
    setSelectedLeaf(null);
  }, [projectId, isEdit]);

  // Edit-mode rehydrate: once the BOQ tree for the row's project has
  // arrived, find the saved leaf by id and stamp it onto selectedLeaf
  // so the cascading picker + BOQ qty input show the right values.
  useEffect(() => {
    if (!open || !isEdit || boqItems.length === 0) return;
    const leaf = boqItems.find((r) => r.id === editData.boqItemId);
    if (leaf) setSelectedLeaf(leaf);
  }, [open, isEdit, boqItems, editData?.boqItemId]);

  const boqQuantity = selectedLeaf?.tender_qty ?? null;
  const boqUnit = selectedLeaf?.unit ?? "";

  const addLine = () => setLines((prev) => [...prev, newLine()]);
  const removeLine = (idx: number) =>
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx)));

  const updateLine = (idx: number, field: keyof MaterialLine, value: string) => {
    setLines((prev) =>
      prev.map((row, i) => {
        if (i !== idx) return row;
        const next = { ...row, [field]: value };

        // Auto-fill name + UOM + rate when a material is picked
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
      })
    );
  };

  const handleSubmit = async () => {
    setError("");

    if (!projectId) {
      setError("Pick a project first");
      return;
    }
    if (!selectedLeaf) {
      setError("Pick a BOQ leaf item");
      return;
    }
    if (boqQuantity == null) {
      setError("Selected BOQ row has no tender quantity");
      return;
    }
    const validLines = lines.filter((l) => l.itemId && l.qtyPerUnit);
    if (validLines.length === 0) {
      setError(
        "Scroll down to the Material Composition section and add at least one material (material + qty/unit required)."
      );
      // Scroll the material section into view + highlight it so the
      // user immediately sees where the missing input is.
      requestAnimationFrame(() => {
        materialSectionRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        boqItemId: selectedLeaf.id,
        boqNo: selectedLeaf.boq_no,
        boqDescription: selectedLeaf.display_name,
        boqQuantity,
        boqUnit,
        phase,
        status,
        materials: validLines.map((l) => {
          const qtyPerUnit = parseFloat(l.qtyPerUnit) || 0;
          const wastePercent = parseFloat(l.wasteFactor) || 0;
          const rate = parseFloat(l.standardRate) || 0;
          const requiredQty = qtyPerUnit * (boqQuantity ?? 0);
          const totalQty = requiredQty * (1 + wastePercent / 100);
          return {
            itemId: l.itemId,
            itemName: l.itemName,
            uomCode: l.uomCode,
            qtyPerUnit,
            wastePercent,
            requiredQty,
            totalQty,
            standardRate: rate,
            estimatedCost: totalQty * rate,
          };
        }),
      };

      const url = isEdit
        ? `/api/estimations/${editData.id}`
        : `/api/projects/${projectId}/estimations`;
      const method = isEdit ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": `est-${projectId}-${editData?.id ?? "new"}-${Date.now()}`,
        },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      qc.invalidateQueries({ queryKey: ["estimations"] });
      onClose();
    } catch (err: any) {
      setError(err?.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  // Right-side slide-over drawer — matches the QuickCreateDrawer
  // convention used by Indents/RFQs/POs/Hindrance so the "Add"
  // experience stays consistent across modules. The dim backdrop
  // captures click-outside-to-close; the panel itself fills the
  // viewport height and uses an internal flex column so only the
  // form body scrolls while header + footer stay anchored.
  return (
    <div className="fixed inset-0 z-50">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />

      <div className="fixed right-0 top-0 bottom-0 w-full max-w-3xl bg-white shadow-2xl flex flex-col z-50 overflow-hidden">
        {/* Inline workflow confirmation — keeps the user inside the
            drawer context instead of stacking modal-on-modal. Covers the
            card content with a soft scrim so the form underneath is
            visible but muted. */}
        {workflowAction && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/60 backdrop-blur-sm px-4">
            <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
              <div className="flex items-start gap-4 px-5 py-4 border-b border-gray-100">
                <div
                  className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                    workflowAction === "reject"
                      ? "bg-rose-50 text-rose-600"
                      : workflowAction === "approve"
                        ? "bg-emerald-50 text-emerald-600"
                        : "bg-orange-50 text-orange-600"
                  }`}
                >
                  {workflowAction === "reject" ? (
                    <XCircle className="w-5 h-5" />
                  ) : workflowAction === "approve" ? (
                    <Check className="w-5 h-5" />
                  ) : (
                    <Send className="w-5 h-5" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-semibold text-gray-900">
                    {workflowAction === "submit"
                      ? "Submit for Approval"
                      : workflowAction === "approve"
                        ? "Approve Estimation"
                        : "Reject Estimation"}
                  </h3>
                  <p className="text-sm text-gray-600 mt-1 leading-relaxed">
                    {workflowAction === "submit" && (
                      <>
                        Send estimation{" "}
                        <span className="font-semibold text-gray-900">
                          {editData?.boqNo ?? ""}
                        </span>{" "}
                        into the approval queue? You won&apos;t be able to
                        edit it until an approver actions it.
                      </>
                    )}
                    {workflowAction === "approve" && (
                      <>
                        Approve estimation{" "}
                        <span className="font-semibold text-gray-900">
                          {editData?.boqNo ?? ""}
                        </span>
                        ? It becomes the baseline for downstream procurement.
                      </>
                    )}
                    {workflowAction === "reject" && (
                      <>
                        Reject estimation{" "}
                        <span className="font-semibold text-gray-900">
                          {editData?.boqNo ?? ""}
                        </span>
                        ? The raiser will see your reason and can revise and
                        resubmit.
                      </>
                    )}
                  </p>
                </div>
                <button
                  onClick={closeWorkflow}
                  disabled={workflowPending}
                  className="shrink-0 p-1 rounded-md text-gray-400 hover:bg-gray-100 disabled:opacity-40"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              {workflowAction === "reject" && (
                <div className="px-5 py-4 border-b border-gray-100">
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Reason (optional)
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
              <div className="flex items-center justify-end gap-2 px-5 py-3 bg-gray-50">
                <SecondaryButton
                  onClick={closeWorkflow}
                  disabled={workflowPending}
                >
                  Cancel
                </SecondaryButton>
                <button
                  onClick={runWorkflowAction}
                  disabled={workflowPending}
                  className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors text-white ${
                    workflowAction === "reject"
                      ? "bg-rose-600 hover:bg-rose-700 disabled:bg-rose-400"
                      : workflowAction === "approve"
                        ? "bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400"
                        : "bg-orange-600 hover:bg-orange-700 disabled:bg-orange-400"
                  }`}
                >
                  {workflowPending && (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  )}
                  {workflowPending
                    ? "Working…"
                    : workflowAction === "submit"
                      ? "Submit"
                      : workflowAction === "approve"
                        ? "Approve"
                        : "Reject"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              {isEdit ? "Edit Material Estimation" : "New Material Estimation"}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {isEdit
                ? "Update materials, waste %, and rates per unit of the BOQ item."
                : "Map a BOQ leaf item to its material composition."}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-sm text-red-700 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="flex-1">{error}</span>
              <button onClick={() => setError("")} className="text-red-400 hover:text-red-600">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* ── Project (spans full width) ── */}
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                Project <span className="text-red-500">*</span>
              </label>
              <SelectInput
                value={projectId}
                onChange={setProjectId}
                placeholder="Select project…"
                options={projects.map((p) => ({
                  value: p.id,
                  label: `${p.name}${p.code ? ` · ${p.code}` : ""}`,
                }))}
              />
            </div>

            {/* ── BOQ Item cascading picker (spans full width) ── */}
            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-gray-600 mb-2">
                BOQ Item <span className="text-red-500">*</span>
              </label>
              {!projectId ? (
                <div className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                  Pick a project above to load its BOQ tree.
                </div>
              ) : boqLoading ? (
                <div className="flex items-center text-sm text-gray-500 py-2">
                  <Loader2 className="w-4 h-4 animate-spin mr-2" /> Loading BOQ…
                </div>
              ) : boqItems.length === 0 ? (
                <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  This project has no BOQ imported yet. Go to Projects → BOQ to import first.
                </div>
              ) : (
                <BOQCascadingPicker
                  items={boqItems}
                  value={selectedLeaf?.id ?? null}
                  onSelect={setSelectedLeaf}
                  topPlaceholder="Select top-level BOQ group"
                />
              )}
            </div>

            {/* ── Construction Phase ── */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                Construction Phase <span className="text-red-500">*</span>
              </label>
              <SelectInput
                value={phase}
                onChange={setPhase}
                options={PHASES.map((p) => ({ value: p, label: p }))}
              />
            </div>

            {/* ── Status ── */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                Status <span className="text-red-500">*</span>
              </label>
              <SelectInput
                value={status}
                onChange={setStatus}
                options={STATUSES.map((s) => ({ value: s, label: s }))}
              />
            </div>

            {/* ── BOQ Quantity (auto-filled, read-only) ── */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">
                BOQ Quantity <span className="text-gray-400 font-normal">(Auto-filled)</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={boqQuantity != null ? String(boqQuantity) : ""}
                  readOnly
                  placeholder={selectedLeaf ? "" : "Pick a BOQ leaf above"}
                  className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-700 font-medium"
                />
                {boqUnit && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] uppercase font-semibold text-gray-400">
                    {boqUnit}
                  </span>
                )}
              </div>
            </div>

            {/* ── BOQ Description mirror ── */}
            {selectedLeaf && (
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Selected
                </label>
                <div className="text-xs text-gray-700 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2 truncate">
                  <span className="font-mono font-semibold">{selectedLeaf.boq_no}</span>
                  {" · "}
                  {selectedLeaf.display_name}
                </div>
              </div>
            )}
          </div>

          {/* ── Material Composition ── */}
          <div
            ref={materialSectionRef}
            className="border-t border-gray-200 pt-5 scroll-mt-4"
          >
            <div className="flex items-center justify-between mb-1">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">
                  Material Composition <span className="text-red-500">*</span>
                </h3>
                <p className="text-xs text-gray-500">
                  Define the materials required per unit of the BOQ item. At least one row required.
                </p>
              </div>
              <button
                type="button"
                onClick={addLine}
                className="inline-flex items-center gap-1 text-xs font-semibold text-orange-700 hover:text-orange-800 border border-orange-200 bg-orange-50 hover:bg-orange-100 px-3 py-1.5 rounded-lg"
              >
                <Plus className="w-3.5 h-3.5" /> Add Material
              </button>
            </div>

            {/* Card-style rows. The previous 7-column inline table was
                too cramped for the drawer width — narrow inputs made
                the numeric fields almost unusable and the headers
                wrapped across three lines. Splitting each line into
                two rows (Material on top, numeric fields below) gives
                the material picker full width and lets the numeric
                inputs breathe. The Total cell is read-only — calculated
                from BOQ qty × qty/unit × (1 + waste%) × std rate. */}
            <div className="mt-3 space-y-2">
              {lines.map((line, idx) => {
                const qtyPerUnit = parseFloat(line.qtyPerUnit) || 0;
                const waste = parseFloat(line.wasteFactor) || 0;
                const rate = parseFloat(line.standardRate) || 0;
                const req = (boqQuantity ?? 0) * qtyPerUnit;
                const total = req * (1 + waste / 100);
                const cost = total * rate;
                return (
                  <div
                    key={idx}
                    className="border border-gray-200 rounded-xl bg-white p-4"
                  >
                    {/* Row 1: line number + Material picker + Remove */}
                    <div className="flex items-start gap-3 mb-3">
                      <span className="text-[10px] font-bold text-gray-400 w-5 pt-2 shrink-0">
                        {idx + 1}.
                      </span>
                      <div className="flex-1 min-w-0">
                        <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">
                          Material <span className="text-red-500">*</span>
                        </label>
                        <SelectInput
                          value={line.itemId}
                          onChange={(v) => updateLine(idx, "itemId", v)}
                          placeholder="Select material…"
                          options={items.map((it: any) => ({
                            value: it.id,
                            label: it.name,
                          }))}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeLine(idx)}
                        disabled={lines.length <= 1}
                        className="mt-6 p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
                        title="Remove line"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Row 2: UOM | Qty/Unit | Waste% | Std Rate | Total */}
                    <div className="grid grid-cols-5 gap-2 pl-8">
                      <div>
                        <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">
                          UOM
                        </label>
                        <input
                          type="text"
                          value={line.uomCode}
                          onChange={(e) => updateLine(idx, "uomCode", e.target.value)}
                          className="w-full text-xs px-2 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500 text-center uppercase"
                          placeholder="—"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">
                          Qty / Unit
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={line.qtyPerUnit}
                          onChange={(e) => updateLine(idx, "qtyPerUnit", e.target.value)}
                          className="w-full text-xs px-2 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500 text-right"
                          placeholder="0"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">
                          Waste %
                        </label>
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          max="100"
                          value={line.wasteFactor}
                          onChange={(e) => updateLine(idx, "wasteFactor", e.target.value)}
                          className="w-full text-xs px-2 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500 text-right"
                          placeholder="0"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">
                          Std Rate (₹)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={line.standardRate}
                          onChange={(e) => updateLine(idx, "standardRate", e.target.value)}
                          className="w-full text-xs px-2 py-1.5 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-500 text-right"
                          placeholder="0.00"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1">
                          Total
                        </label>
                        <div className="w-full text-xs px-2 py-1.5 border border-gray-200 rounded-md bg-gray-50 text-right">
                          <div className="font-semibold text-gray-900">
                            {total > 0
                              ? total.toLocaleString("en-IN", { maximumFractionDigits: 2 })
                              : "—"}
                          </div>
                          {cost > 0 && (
                            <div className="text-[10px] text-gray-500 leading-none">
                              ₹ {cost.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer — state-aware buttons. When editing a pending row
            and the user can approve, the footer exposes Approve /
            Reject instead of (in addition to) Save. Draft rows get a
            Submit for Approval secondary action alongside Save. */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-gray-200 bg-gray-50 shrink-0">
          <div className="flex items-center gap-2">
            {isEdit && isPending && canApprove && (
              <>
                <button
                  type="button"
                  onClick={handleApprove}
                  disabled={workflowPending || saving}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50"
                >
                  <Check className="w-4 h-4" /> Approve
                </button>
                <button
                  type="button"
                  onClick={handleReject}
                  disabled={workflowPending || saving}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50"
                >
                  <XCircle className="w-4 h-4" /> Reject
                </button>
              </>
            )}
            {isEdit && isPending && !canApprove && (
              <span className="text-xs text-amber-600 italic">
                This estimation is pending approval. Only an approver can
                approve or reject it.
              </span>
            )}
            {isEdit && isDraft && (
              <button
                type="button"
                onClick={handleSubmitForApproval}
                disabled={workflowPending || saving}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold text-orange-700 bg-orange-50 border border-orange-200 hover:bg-orange-100 disabled:opacity-50"
              >
                <Send className="w-4 h-4" /> Submit for Approval
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <SecondaryButton onClick={onClose} disabled={saving || workflowPending}>
              Cancel
            </SecondaryButton>
            <PrimaryButton
              onClick={handleSubmit}
              disabled={saving || workflowPending || !projectId || !selectedLeaf}
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Saving…
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" /> {isEdit ? "Save Changes" : "Save Estimation"}
                </>
              )}
            </PrimaryButton>
          </div>
        </div>
      </div>
    </div>
  );
}
