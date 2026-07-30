"use client";

import { toErrorMessage } from "@/lib/api/errors";
import { formatDateTimeIST } from "@/lib/format/datetime";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { type GroupedMaterialSelectItem } from "@/components/GroupedMaterialSelect";
import { useEstimation, useUpdateEstimation } from "@/hooks/use-projects";
import { useItemGroups } from "@/hooks/use-masters";
import { usePermissions } from "@/hooks/use-permissions";
import type { ApprovalHistoryEntry } from "@/lib/approvals/approval-info";
import type { EstimationMaterial } from "@/lib/projects/estimation-detail";
import { newLine, rowTotals, type MaterialLine } from "./shared";

const MENU_KEY = "pm.estimation";

export function useEstimationDetail(id: string) {
  const router = useRouter();
  const qc = useQueryClient();
  const { data: estimation, isLoading } = useEstimation(id);
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
        // Clearing the material clears its derived fields; the auto-fill on
        // pick is handled by the picker's onSelect (lazy — no full item load).
        if (field === "itemId" && !value) {
          next.itemName = "";
          next.uomCode = "";
          next.standardRate = "";
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
    const boqQty = Number(estimation?.boqQuantity) || 0;
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
    estimation?.approval?.history?.map((h: ApprovalHistoryEntry) => ({
      step: h.stepOrder ?? 0,
      action: h.action,
      actionBy: h.actionByName ?? "User",
      actionAt: h.actionAt ? formatDateTimeIST(h.actionAt) : "",
      comments: h.comments ?? undefined,
    })) ?? [];

  return {
    router,
    qc,
    estimation,
    isLoading,
    updateMutation,
    canEdit,
    canSubmit,
    canApprove,
    workflowAction,
    setWorkflowAction,
    rejectReason,
    setRejectReason,
    workflowPending,
    setWorkflowPending,
    workflowError,
    setWorkflowError,
    isEditing,
    setIsEditing,
    phase,
    setPhase,
    editStatus,
    setEditStatus,
    lines,
    setLines,
    saving,
    setSaving,
    saveError,
    setSaveError,
    itemGroups,
    status,
    isDraft,
    isPending,
    isApproved,
    isRejected,
    isInactive,
    baseLocked,
    seedFromEstimation,
    materials,
    editTotals,
    openWorkflow,
    closeWorkflow,
    runWorkflowAction,
    beginEdit,
    cancelEdit,
    updateLine,
    addLine,
    removeLine,
    saveEdit,
    approvalEntries,
  };
}
