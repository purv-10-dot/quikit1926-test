"use client";

import { toErrorMessage } from "@/lib/api/errors";
import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, Plus, Trash2, AlertTriangle, FileText, CheckCircle2, Circle } from "lucide-react";
import { PrimaryButton, SecondaryButton } from "@/components/PageShell";
import { GroupedMaterialSelect } from "@/components/GroupedMaterialSelect";
import { SelectInput, RIGHT_DRAWER_BACKDROP, RIGHT_DRAWER_FRAME, RIGHT_DRAWER_PANEL } from "@/components/FormDrawer";
import { BOQCascadingPicker, type BoqRow } from "@/components/BOQCascadingPicker";
import { useCreatePR, usePurchaseRequisitions } from "@/hooks/use-purchase";
import { useProjects, useItems, useItemGroups, useUOMs, useLocations, useWorkCategories } from "@/hooks/use-masters";
import { useEstimations, useBOQ } from "@/hooks/use-projects";
import { usePermissions } from "@/hooks/use-permissions";

interface PRLine {
  itemId: string;
  itemName: string;
  quantity: string;
  uomId: string;
  uomCode: string;
  estimatedRate: string;
  specification: string;
  priority: string;
  availableStock: string;
}

interface PrEstMaterial {
  itemId?: string; itemName?: string; uomCode?: string;
  estimatedCost?: number | string; totalQty?: number | string; qtyPerUnit?: number | string;
}
interface PrEstimation {
  id?: string; status?: string; boqItemId?: string; boqNo?: string;
  materials?: PrEstMaterial[];
}
interface PrExisting {
  lines?: Array<{ itemId?: string }>;
}

const newLine = (): PRLine => ({
  itemId: "", itemName: "", quantity: "", uomId: "", uomCode: "",
  estimatedRate: "", specification: "", priority: "MEDIUM", availableStock: "0",
});

export function PRCreateDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [projectId, setProjectId] = useState("");
  const [requiredDate, setRequiredDate] = useState("");
  const [purpose, setPurpose] = useState("");
  const [workCategoryId, setWorkCategoryId] = useState("");
  const [deliveryLocationId, setDeliveryLocationId] = useState("");
  const [isUrgent, setIsUrgent] = useState(false);
  const [urgencyJustification, setUrgencyJustification] = useState("");
  const [lines, setLines] = useState<PRLine[]>([newLine()]);
  const [selectedBoq, setSelectedBoq] = useState<BoqRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const { data: projectsData } = useProjects();
  const { data: itemsData } = useItems();
  const { data: itemGroupsData } = useItemGroups();
  const { data: uomData } = useUOMs();
  const { data: locData } = useLocations({ projectId: projectId || undefined });
  const { data: wcData } = useWorkCategories();
  // Material Estimations already filled for the picked project. Only the
  // approved ones are surfaced — drafts and pending-approval estimations
  // shouldn't drive procurement.
  const { data: estimationsData } = useEstimations(projectId || null);
  // BOQ tree for the picked project — drives the cascading BOQ picker.
  const { data: boqData } = useBOQ(projectId || null);
  // Existing PRs for this project — used to flag "Raised" vs "Not Raised"
  // per material in the estimation reference.
  const { data: existingPRsData } = usePurchaseRequisitions({ projectId: projectId || undefined });
  const createMutation = useCreatePR();
  const { me } = usePermissions();

  // Per-material remaining budget for the project (filtered to the
  // picked BOQ leaf when present). Used to render Estimated / Consumed
  // / Remaining columns on the estimation card and to gate submit when
  // a PR line exceeds its remaining qty.
  const { data: budgetData } = useQuery({
    queryKey: [
      "pr-estimation-budget",
      projectId || "__none__",
      selectedBoq?.id ?? "__all__",
    ],
    queryFn: async () => {
      const params = new URLSearchParams({ projectId });
      if (selectedBoq?.id) params.set("boqItemId", selectedBoq.id);
      const res = await fetch(
        `/api/purchase/requisitions/estimation-budget?${params.toString()}`,
      );
      if (!res.ok) throw new Error(await res.text());
      return (await res.json()) as {
        data: Array<{
          itemId: string;
          itemName: string;
          uomCode: string;
          estimated: number;
          consumed: number;
          remaining: number;
        }>;
      };
    },
    enabled: !!projectId,
  });
  const budgetByItem = useMemo(() => {
    const map = new Map<string, { estimated: number; consumed: number; remaining: number; itemName: string; uomCode: string }>();
    for (const row of budgetData?.data ?? []) {
      map.set(row.itemId, row);
    }
    return map;
  }, [budgetData]);

  // Hide commercial info (Rate, Amount, Estimated Total) from field users.
  // Field users are the transactional `USER` role — site engineers,
  // store keepers, etc. — who shouldn't see procurement pricing. The
  // estimated rate still flows through to the payload because it gets
  // auto-filled from the item master when the row picks a material;
  // the user just doesn't see or edit it.
  const isFieldUser = me?.userType === "USER";

  // Only offer projects the current user is actually assigned to. If the
  // user has no restriction (super admin, or empty assignment → treated as
  // unrestricted), show everything. Hiding forbidden projects up front
  // prevents the common "I created a PR but it disappeared" confusion —
  // the PR list also filters by projectsAssigned, so picking a project the
  // user can't see would create a ghost PR they can't find.
  const allProjects = projectsData?.data ?? [];
  const allowedProjectIds = me?.projectIds ?? null;
  const projects = useMemo(() => {
    const active = allProjects.filter((p) => p?.status !== "inactive");
    if (!allowedProjectIds || allowedProjectIds.length === 0) return active;
    const allow = new Set(allowedProjectIds);
    return active.filter((p) => allow.has(p.id));
  }, [allProjects, allowedProjectIds]);
  const items = useMemo(() => itemsData?.data ?? [], [itemsData]);
  const itemGroups = useMemo(() => {
    const raw = itemGroupsData?.data ?? [];
    return raw.filter((g) => (g?.status ?? "active").toLowerCase() !== "inactive");
  }, [itemGroupsData]);
  const uoms = uomData?.data ?? [];
  const locations = locData?.data ?? [];
  const workCategories = wcData?.data ?? [];
  // Only approved estimations are eligible to drive a PR.
  const estimations: PrEstimation[] = useMemo(
    () => ((estimationsData?.data ?? []) as unknown as PrEstimation[]).filter(
      (e) => (e?.status ?? "").toLowerCase() === "approved",
    ),
    [estimationsData],
  );

  // Flatten the BOQ payload into the shape BOQCascadingPicker expects.
  // The BOQ endpoint may return either snake_case (`boq_no`) or camelCase
  // (`boqNo`) depending on the layer — coerce both.
  const boqRows: BoqRow[] = useMemo(() => {
    const raw = boqData?.items ?? boqData?.data ?? [];
    return raw.map((r) => ({
      id: r.id ?? "",
      boq_no: r.boq_no ?? r.boqNo ?? "",
      parent_boq_no: r.parent_boq_no ?? r.parentBoqNo ?? null,
      depth: r.depth ?? 0,
      is_group: r.is_group ?? r.isGroup ?? false,
      display_name: r.display_name ?? r.displayName ?? r.description ?? "",
      unit: r.unit ?? r.uomCode ?? null,
      tender_qty:
        r.tender_qty != null
          ? Number(r.tender_qty)
          : r.tenderQty != null
          ? Number(r.tenderQty)
          : null,
      category: r.category,
    }));
  }, [boqData]);

  // Set of itemIds already requested on any PR for this project — used to
  // mark each estimation material as Raised vs Not Raised.
  const raisedItemIds = useMemo(() => {
    const set = new Set<string>();
    const prs: PrExisting[] = (existingPRsData?.data ?? []) as unknown as PrExisting[];
    for (const pr of prs) {
      for (const ln of pr.lines ?? []) {
        if (ln?.itemId) set.add(ln.itemId);
      }
    }
    return set;
  }, [existingPRsData]);

  // Estimations to display: only AFTER a BOQ leaf is selected. Until
  // then the user sees the BOQ picker on its own — no premature
  // material list.
  const visibleEstimations = useMemo(() => {
    if (!selectedBoq) return [];
    return estimations.filter(
      (e) =>
        e.boqItemId === selectedBoq.id ||
        e.boqNo === selectedBoq.boq_no,
    );
  }, [estimations, selectedBoq]);

  // Same scope as `visibleEstimations` but BEFORE filtering by status —
  // used to detect the "estimation exists but is pending approval" case
  // so we can surface a banner instead of silently showing nothing.
  const pendingEstimationsForBoq = useMemo(() => {
    if (!selectedBoq) return [];
    const all = estimationsData?.data ?? [];
    return all.filter(
      (e) =>
        (e.boqItemId === selectedBoq.id || e.boqNo === selectedBoq.boq_no) &&
        (e?.status ?? "").toLowerCase() !== "approved",
    );
  }, [estimationsData, selectedBoq]);


  // Reset form when drawer opens
  useEffect(() => {
    if (open) {
      setProjectId("");
      setRequiredDate("");
      setPurpose("");
      setWorkCategoryId("");
      setDeliveryLocationId("");
      setIsUrgent(false);
      setUrgencyJustification("");
      setLines([newLine()]);
      setSelectedBoq(null);
      setError("");
    }
  }, [open]);

  // Clear the BOQ selection when the user switches projects — a BOQ row
  // from the previous project would no longer exist in `boqRows`.
  useEffect(() => {
    setSelectedBoq(null);
  }, [projectId]);

  const addLine = () => setLines(prev => [...prev, newLine()]);

  const removeLine = (idx: number) => {
    if (lines.length <= 1) return;
    setLines(prev => prev.filter((_, i) => i !== idx));
  };

  /**
   * Update a single field on a single line, correctly handling
   * dependent-state resets when the material itself changes or clears.
   *
   * Line isolation: each call only touches `lines[idx]`. The spread-copy
   * + per-row replacement below guarantees no other row is mutated.
   *
   * Stale state kill list when `itemId` changes (or clears):
   *   - itemName, uomId, uomCode — reset to the new item (or empty)
   *   - estimatedRate — reset (was cached from previous item master)
   *   - availableStock — reset (was cached from previous item master)
   *   - amount is always recomputed from qty × rate, so no reset needed
   *     as long as qty and rate are consistent with the current itemId.
   *   - specification is NOT reset — it's free-text the user typed.
   *   - priority is NOT reset — it's a user choice.
   */
  const updateLine = (idx: number, field: keyof PRLine, value: string) => {
    setLines(prev => {
      const updated = prev.map((l, i) => (i === idx ? { ...l } : l));
      const row = updated[idx];
      if (!row) return prev;

      (row as unknown as Record<string, string>)[field] = value;

      // ── Dependent resets when the MATERIAL changes ───────────────
      if (field === "itemId") {
        // Always wipe the dependent fields first — applies to BOTH
        // "cleared to empty" and "switched to a different item".
        row.itemName = "";
        row.uomId = "";
        row.uomCode = "";
        row.estimatedRate = "";
        row.availableStock = "0";

        // Then, if a new item was chosen, backfill from the master.
        if (value) {
          const item = items.find((i) => i.id === value);
          if (item) {
            row.itemName = item.name ?? "";
            row.uomId = item.uomId ?? "";
            row.uomCode = item.uomCode ?? "";
            row.estimatedRate = item.standardRate ?? "";
            row.availableStock = item.currentStock ?? "0";
          }
        }
      }

      // ── Dependent reset when UOM changes on its own ──────────────
      // If the user overrides the UOM, the cached stock figure was for
      // the old UOM — zero it out so the stock-warning math doesn't lie.
      if (field === "uomId" && value !== row.uomId) {
        row.availableStock = "0";
      }

      return updated;
    });
  };

  const lineAmount = (line: PRLine) => (parseFloat(line.quantity) || 0) * (parseFloat(line.estimatedRate) || 0);
  const totalAmount = lines.reduce((sum, l) => sum + lineAmount(l), 0);

  const requestedByItem = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of lines) {
      if (!l.itemId) continue;
      const qty = parseFloat(l.quantity) || 0;
      if (qty <= 0) continue;
      map.set(l.itemId, (map.get(l.itemId) ?? 0) + qty);
    }
    return map;
  }, [lines]);

  const overBudgetItems = useMemo(() => {
    const out: Array<{
      itemId: string;
      itemName: string;
      uomCode: string;
      requested: number;
      remaining: number;
    }> = [];
    for (const [itemId, requested] of requestedByItem) {
      const b = budgetByItem.get(itemId);
      if (!b) continue;
      if (requested > b.remaining) {
        out.push({
          itemId,
          itemName: b.itemName,
          uomCode: b.uomCode,
          requested,
          remaining: b.remaining,
        });
      }
    }
    return out;
  }, [requestedByItem, budgetByItem]);

  const overBudgetItemIds = useMemo(
    () => new Set(overBudgetItems.map((b) => b.itemId)),
    [overBudgetItems],
  );

  const handleSubmit = async () => {
    setError("");

    // Validation
    if (!projectId) { setError("Please select a project"); return; }
    if (!requiredDate) { setError("Please set a required date"); return; }
    {
      // 7-day procurement lead time. The input element already
      // enforces `min={today+7}`, but a typed or programmatically-set
      // value could slip through — re-check before we POST so the API
      // can't be tricked into a same-week PR.
      const earliest = new Date();
      earliest.setHours(0, 0, 0, 0);
      earliest.setDate(earliest.getDate() + 7);
      const picked = new Date(requiredDate);
      if (picked < earliest) {
        const fmt = (d: Date) => d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
        setError(`Required date must be on or after ${fmt(earliest)} (7-day lead time).`);
        return;
      }
    }
    if (isUrgent && !urgencyJustification.trim()) { setError("Urgency justification is required"); return; }

    // Pull the row indices the user actually filled in so the error
    // messages line up with the visible row numbers (filtering would
    // re-number them and confuse the user).
    const filled = lines
      .map((l, idx) => ({ l, idx }))
      .filter(({ l }) =>
        Boolean(
          l.itemId ||
          l.quantity ||
          l.uomId ||
          l.estimatedRate ||
          (l.specification && l.specification.trim()),
        ),
      );
    if (filled.length === 0) { setError("Add at least one material line"); return; }

    if (overBudgetItems.length > 0) {
      const first = overBudgetItems[0];
      setError(
        `${first.itemName || first.itemId} exceeds estimation budget: requested ${first.requested}${first.uomCode ? ` ${first.uomCode}` : ""}, only ${first.remaining} left.`,
      );
      return;
    }

    for (const { l, idx } of filled) {
      const n = idx + 1;
      if (!l.itemId) { setError(`Line ${n}: Material is required`); return; }
      if (!l.uomId) { setError(`Line ${n}: UOM is required`); return; }
      if (!l.quantity || parseFloat(l.quantity) <= 0) {
        setError(`Line ${n}: Quantity must be > 0`); return;
      }
    }
    const validLines = filled.map(({ l }) => l);

    setSaving(true);
    try {
      await createMutation.mutateAsync({
        projectId,
        requiredDate,
        purpose,
        workCategoryId: workCategoryId || undefined,
        deliveryLocationId: deliveryLocationId || undefined,
        isUrgent,
        urgencyJustification: isUrgent ? urgencyJustification : "",
        footerNote: "",
        lines: validLines.map(l => ({
          itemId: l.itemId,
          quantity: l.quantity,
          uomId: l.uomId,
          estimatedRate: l.estimatedRate,
          specification: l.specification,
          priority: l.priority,
          requestedFor: "Project",
        })),
      });
      onClose();
    } catch (err: unknown) {
      setError(toErrorMessage(err, "Failed to create PR. Please try again."));
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <>
      <div className={RIGHT_DRAWER_BACKDROP} onClick={onClose} />
      <div className={RIGHT_DRAWER_FRAME}>
        <div className={`${RIGHT_DRAWER_PANEL} max-w-3xl`}>
        <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-6 py-4 sm:px-8">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Create Purchase Requisition</h2>
            <p className="text-xs text-gray-500 mt-0.5">Request materials needed for site operations</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-6 sm:px-8 sm:py-6">
          {/* PR Header Fields */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-4">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">PR Header</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Project <span className="text-red-500">*</span></label>
                <SelectInput
                  value={projectId}
                  onChange={setProjectId}
                  disabled={projects.length === 0}
                  placeholder={projects.length === 0 ? "No projects assigned — ask admin" : "Select project..."}
                  options={projects.map((p) => ({ value: p.id, label: `${p.code} — ${p.name}` }))}
                />
                {allowedProjectIds && allowedProjectIds.length > 0 && projects.length < allProjects.length && (
                  <p className="text-[11px] text-gray-400 mt-1">
                    Showing your {projects.length} assigned project{projects.length === 1 ? "" : "s"}.
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Required By Date <span className="text-red-500">*</span></label>
                {(() => {
                  // Min = today + 7 days. Procurement needs at least a
                  // 7-day lead time to source materials, so anything
                  // earlier than a week from today is blocked. No
                  // upper cap — far-future dates are valid.
                  const earliest = new Date();
                  earliest.setDate(earliest.getDate() + 7);
                  const fmt = (d: Date) => d.toISOString().split("T")[0];
                  return (
                    <>
                      <input type="date" value={requiredDate} onChange={e => setRequiredDate(e.target.value)}
                        min={fmt(earliest)}
                        className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                      <p className="text-[10px] text-gray-400 mt-1">
                        Minimum 7-day lead time. Earliest pick: {earliest.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}.
                      </p>
                    </>
                  );
                })()}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Work Category</label>
                <SelectInput
                  value={workCategoryId}
                  onChange={setWorkCategoryId}
                  placeholder="Optional"
                  options={workCategories.map((w) => ({ value: w.id, label: w.name }))}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Delivery Location</label>
                <SelectInput
                  value={deliveryLocationId}
                  onChange={setDeliveryLocationId}
                  placeholder={
                    projectId && locations.length === 0
                      ? "No locations for this project — ask admin to add one"
                      : "Select location"
                  }
                  options={locations.map((l) => ({ value: l.id, label: l.name }))}
                />
                {projectId && locations.length === 0 && (
                  <p className="text-[11px] text-amber-600 mt-1">
                    This project has no store/warehouse yet. Create one in Masters → Locations.
                  </p>
                )}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Purpose / Reason</label>
              <input type="text" value={purpose} onChange={e => setPurpose(e.target.value)} placeholder="e.g. Foundation work phase 2"
                className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
            </div>

            {/* Urgent */}
            <div className={`p-3 rounded-lg border ${isUrgent ? "bg-amber-50 border-amber-200" : "bg-white border-gray-200"}`}>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={isUrgent} onChange={e => setIsUrgent(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-orange-600 focus:ring-orange-500" />
                <span className="text-sm font-medium text-gray-700">Mark as URGENT</span>
              </label>
              {isUrgent && (
                <div className="mt-2">
                  <input type="text" value={urgencyJustification} onChange={e => setUrgencyJustification(e.target.value)}
                    placeholder="Justification for urgency (required)"
                    className="w-full px-3 py-2 rounded-lg border border-amber-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-500" />
                </div>
              )}
            </div>
          </div>

          {/* BOQ Item — mandatory standalone section. Picking a leaf
              loads the matching approved estimation panel below (which
              only renders when at least one of its materials has
              already been raised in another PR). Wrapper is
              `relative z-10` so popovers anchor correctly here. */}
          {projectId && (
            <div className="relative z-10 bg-white border border-gray-200 rounded-xl px-4 py-3">
              <label className="block text-xs font-medium text-gray-700 mb-1">
                BOQ Item <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              {boqRows.length === 0 ? (
                <p className="text-[11px] text-gray-400">
                  No BOQ available for this project yet.
                </p>
              ) : (
                <BOQCascadingPicker
                  items={boqRows}
                  value={selectedBoq?.id ?? null}
                  onSelect={setSelectedBoq}
                  topPlaceholder="Select top-level BOQ group"
                />
              )}
              <p className="text-[10px] text-gray-400 mt-2">
                Optional — drill down: group → child → line item. Picking a line item loads its material estimation.
              </p>
            </div>
          )}

          {/* Pending-approval banner — shown when a BOQ leaf has an
              estimation, but none of them are approved yet. Without this,
              the user just sees nothing after picking the BOQ and assumes
              there's no estimation at all. */}
          {projectId && selectedBoq && visibleEstimations.length === 0 && pendingEstimationsForBoq.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              <div className="text-xs text-amber-800 leading-relaxed">
                <div className="font-semibold mb-0.5">Estimation pending approval</div>
                A material estimation exists for this BOQ item, but it is not yet
                approved
                {(() => {
                  const statuses = Array.from(
                    new Set(
                      pendingEstimationsForBoq
                        .map((e) => String(e?.status ?? "draft").toLowerCase())
                        .filter(Boolean),
                    ),
                  );
                  return statuses.length > 0 ? (
                    <> (status: <span className="font-semibold">{statuses.join(", ")}</span>)</>
                  ) : null;
                })()}
                . Get it approved under <span className="font-semibold">Projects → Estimation</span> to
                auto-fill materials here. You can still raise this PR manually below.
              </div>
            </div>
          )}

          {/* Material Estimation reference — read-only. Only APPROVED
              estimations are surfaced. The panel renders as soon as a
              BOQ leaf is selected and an approved estimation exists for
              it; each row carries a Raised / Not Raised badge built
              from the project's existing PRs so the requester can see
              at a glance which materials are still pending. */}
          {projectId && selectedBoq && visibleEstimations.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl">
              <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200 rounded-t-xl">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-indigo-600" />
                  <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                    Material Estimation
                  </h3>
                </div>
                <span className="text-[10px] text-gray-400 uppercase tracking-wider">
                  Approved only · Read-only
                </span>
              </div>
              <div className="divide-y divide-gray-100">
                {visibleEstimations.map((est) => {
                  const mats: PrEstMaterial[] = Array.isArray(est.materials) ? est.materials : [];
                  const totalCost = mats.reduce(
                    (sum, m) => sum + (parseFloat(String(m.estimatedCost ?? "0")) || 0),
                    0,
                  );
                  return (
                    <div key={est.id} className="p-4">
                      {mats.length > 0 ? (
                        <div className="overflow-x-auto border border-gray-100 rounded-lg">
                          <table className="w-full text-xs">
                            <thead className="bg-gray-50">
                              <tr>
                                <th className="px-3 py-2 text-left text-[10px] font-semibold text-gray-500 uppercase">
                                  Material
                                </th>
                                <th className="px-3 py-2 text-center text-[10px] font-semibold text-gray-500 uppercase w-24">
                                  PR Status
                                </th>
                                <th className="px-3 py-2 text-right text-[10px] font-semibold text-gray-500 uppercase w-24">
                                  Estimated
                                </th>
                                <th className="px-3 py-2 text-right text-[10px] font-semibold text-gray-500 uppercase w-24">
                                  Consumed
                                </th>
                                <th className="px-3 py-2 text-right text-[10px] font-semibold text-gray-500 uppercase w-24">
                                  Remaining
                                </th>
                                <th className="px-3 py-2 text-right text-[10px] font-semibold text-gray-500 uppercase w-32">
                                  Total (₹)
                                </th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                              {mats.map((m, mi: number) => {
                                const total = parseFloat(String(m.estimatedCost ?? "0")) || 0;
                                const isRaised = m.itemId && raisedItemIds.has(m.itemId);
                                const budget = m.itemId ? budgetByItem.get(m.itemId) : null;
                                const estimated = budget?.estimated ?? Number(m.totalQty ?? m.qtyPerUnit ?? 0);
                                const consumed = budget?.consumed ?? 0;
                                const remaining = budget
                                  ? budget.remaining
                                  : Math.max(0, estimated - consumed);
                                const requested = m.itemId
                                  ? requestedByItem.get(m.itemId) ?? 0
                                  : 0;
                                const isOver = !!budget && requested > budget.remaining;
                                return (
                                  <tr
                                    key={`${m.itemId ?? "x"}-${mi}`}
                                    className={isOver ? "bg-rose-50/60" : undefined}
                                  >
                                    <td className="px-3 py-2 text-gray-800">
                                      {m.itemName ?? m.itemId ?? "—"}
                                      {m.uomCode && (
                                        <span className="ml-1.5 text-[10px] text-gray-400 uppercase">
                                          {m.uomCode}
                                        </span>
                                      )}
                                    </td>
                                    <td className="px-3 py-2 text-center">
                                      {isRaised ? (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-50 text-green-700 text-[10px] font-semibold">
                                          <CheckCircle2 className="w-3 h-3" />
                                          Raised
                                        </span>
                                      ) : (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-[10px] font-semibold">
                                          <Circle className="w-3 h-3" />
                                          Not Raised
                                        </span>
                                      )}
                                    </td>
                                    <td className="px-3 py-2 text-right tabular-nums text-gray-700">
                                      {estimated.toLocaleString("en-IN", { maximumFractionDigits: 4 })}
                                    </td>
                                    <td className="px-3 py-2 text-right tabular-nums text-gray-700">
                                      {consumed.toLocaleString("en-IN", { maximumFractionDigits: 4 })}
                                    </td>
                                    <td
                                      className={`px-3 py-2 text-right tabular-nums font-semibold ${
                                        isOver
                                          ? "text-rose-700"
                                          : remaining <= 0
                                            ? "text-amber-700"
                                            : "text-emerald-700"
                                      }`}
                                    >
                                      {remaining.toLocaleString("en-IN", { maximumFractionDigits: 4 })}
                                      {isOver && (
                                        <span className="ml-1 text-[10px] font-bold uppercase">
                                          over
                                        </span>
                                      )}
                                    </td>
                                    <td className="px-3 py-2 text-right tabular-nums font-medium text-gray-900">
                                      {total > 0
                                        ? total.toLocaleString("en-IN", {
                                            minimumFractionDigits: 2,
                                          })
                                        : "—"}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                            <tfoot>
                              <tr className="bg-gray-50/50 border-t border-gray-100">
                                <td
                                  colSpan={5}
                                  className="px-3 py-2 text-right text-[10px] font-semibold text-gray-500 uppercase"
                                >
                                  Estimated Cost
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums font-bold text-gray-900">
                                  ₹{" "}
                                  {totalCost.toLocaleString("en-IN", {
                                    minimumFractionDigits: 2,
                                  })}
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      ) : (
                        <p className="text-xs text-gray-500 text-center py-4">
                          This approved estimation has no materials.
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Line Items */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Material Lines ({lines.length})</h3>
              <button onClick={addLine} className="text-xs text-orange-600 hover:text-orange-700 font-semibold flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" /> Add Line
              </button>
            </div>

            {overBudgetItems.length > 0 && (
              <div className="mb-3 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
                  <div className="flex-1 text-xs text-rose-800 leading-relaxed">
                    <div className="font-semibold mb-1">
                      Over estimation budget — adjust before saving
                    </div>
                    <ul className="space-y-0.5">
                      {overBudgetItems.map((b) => (
                        <li key={b.itemId}>
                          <span className="font-semibold">{b.itemName || b.itemId}</span>:
                          requested {b.requested}
                          {b.uomCode ? ` ${b.uomCode}` : ""}, only {b.remaining} remaining.
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-3">
              {lines.map((line, i) => {
                const amt = lineAmount(line);
                const stockLow = line.quantity && parseFloat(line.quantity) > parseFloat(line.availableStock || "0");
                const isOverBudget = !!line.itemId && overBudgetItemIds.has(line.itemId);
                return (
                  <div
                    key={i}
                    className={`border rounded-xl p-4 bg-white ${
                      isOverBudget ? "border-rose-300 ring-1 ring-rose-200" : "border-gray-200"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-xs font-bold text-gray-400 mt-2 w-5 shrink-0">{i + 1}.</span>
                      <div className="flex-1 space-y-3">
                        {/* Row 1: Material + Priority */}
                        <div className="grid grid-cols-4 gap-3">
                          <div className="col-span-3">
                            <label className="block text-[10px] font-medium text-gray-500 mb-1">Material *</label>
                            <GroupedMaterialSelect
                              value={line.itemId}
                              onChange={(v) => updateLine(i, "itemId", v)}
                              items={items}
                              groups={itemGroups.map((g) => ({ id: g.id, name: g.name, status: g.status }))}
                              placeholder="Pick group → material…"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-medium text-gray-500 mb-1">Priority</label>
                            <SelectInput
                              value={line.priority}
                              onChange={(v) => updateLine(i, "priority", v)}
                              options={[
                                { value: "LOW", label: "Low" },
                                { value: "MEDIUM", label: "Medium" },
                                { value: "HIGH", label: "High" },
                                { value: "URGENT", label: "Urgent" },
                              ]}
                            />
                          </div>
                        </div>

                        {/* Row 2: Qty, UOM, Stock, [Rate, Amount].
                            Rate + Amount are hidden for field users —
                            grid drops from 5 columns to 3. */}
                        <div className={`grid gap-3 ${isFieldUser ? "grid-cols-3" : "grid-cols-5"}`}>
                          <div>
                            <label className="block text-[10px] font-medium text-gray-500 mb-1">
                              Quantity *
                              {isOverBudget && (
                                <span className="ml-1.5 text-[9px] font-bold uppercase text-rose-600">
                                  over budget
                                </span>
                              )}
                            </label>
                            <input type="number" step="0.01" min="0" value={line.quantity}
                              onChange={e => updateLine(i, "quantity", e.target.value)}
                              placeholder="0"
                              className={`w-full px-2.5 py-2 rounded-lg border text-sm focus:outline-none focus:ring-2 ${
                                isOverBudget
                                  ? "border-rose-400 bg-rose-50 focus:ring-rose-300"
                                  : "border-gray-300 focus:ring-orange-500"
                              }`} />
                          </div>
                          <div>
                            <label className="block text-[10px] font-medium text-gray-500 mb-1">UOM *</label>
                            <SelectInput
                              value={line.uomId}
                              onChange={(v) => updateLine(i, "uomId", v)}
                              placeholder="—"
                              options={uoms.map((u) => ({ value: u.id, label: u.code }))}
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-medium text-gray-500 mb-1">Avail. Stock</label>
                            <div className={`px-2.5 py-2 rounded-lg text-sm font-medium ${stockLow ? "bg-red-50 text-red-700 border border-red-200" : "bg-green-50 text-green-700 border border-green-200"}`}>
                              {line.availableStock || "0"}
                              {stockLow && <AlertTriangle className="w-3 h-3 inline ml-1" />}
                            </div>
                          </div>
                          {!isFieldUser && (
                            <div>
                              <label className="block text-[10px] font-medium text-gray-500 mb-1">Rate (₹)</label>
                              <input type="number" step="0.01" min="0" value={line.estimatedRate}
                                onChange={e => updateLine(i, "estimatedRate", e.target.value)}
                                placeholder="0.00"
                                className="w-full px-2.5 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                            </div>
                          )}
                          {!isFieldUser && (
                            <div>
                              <label className="block text-[10px] font-medium text-gray-500 mb-1">Amount</label>
                              <div className="px-2.5 py-2 rounded-lg bg-gray-50 border border-gray-200 text-sm font-bold text-gray-900">
                                ₹ {amt.toLocaleString("en-IN")}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Row 3: Specification */}
                        <div>
                          <label className="block text-[10px] font-medium text-gray-500 mb-1">Specification / Grade</label>
                          <input type="text" value={line.specification} onChange={e => updateLine(i, "specification", e.target.value)}
                            placeholder="Grade, brand, size..."
                            className="w-full px-2.5 py-2 rounded-lg border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500" />
                        </div>
                      </div>

                      <button onClick={() => removeLine(i)} disabled={lines.length <= 1}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 mt-6 shrink-0 disabled:opacity-30">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <button onClick={addLine}
              className="w-full mt-3 py-2.5 border-2 border-dashed border-gray-300 rounded-xl text-sm text-gray-500 hover:text-orange-600 hover:border-orange-300 transition-colors flex items-center justify-center gap-1.5 font-medium">
              <Plus className="w-4 h-4" /> Add Another Material
            </button>
          </div>

          {/* Total — hidden for field users (USER role) since the
              estimate sums commercial info they aren't shown above. */}
          {!isFieldUser ? (
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-5">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm text-gray-600">{lines.filter(l => l.itemId).length} items</span>
                </div>
                <div className="text-right">
                  <span className="text-xs text-gray-500 block">Estimated Total</span>
                  <span className="text-2xl font-bold text-gray-900">₹ {totalAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-gray-50 border border-gray-200 rounded-xl px-5 py-3 text-xs text-gray-500">
              {lines.filter(l => l.itemId).length} item{lines.filter(l => l.itemId).length === 1 ? "" : "s"} added.
            </div>
          )}
        </div>

        {/* Sticky error strip — pinned above the footer so the user
            sees the failure reason right next to the Create button no
            matter how far down they've scrolled. The previous in-body
            banner could scroll out of view, leaving the user confused
            about why nothing happened on click. */}
        {error && (
          <div className="border-t border-red-200 bg-red-50 px-6 py-3 flex items-start gap-2 shrink-0">
            <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
            <div className="flex-1 text-sm text-red-700 leading-snug">{error}</div>
            <button
              onClick={() => setError("")}
              className="text-red-400 hover:text-red-600 shrink-0"
              aria-label="Dismiss error"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className="flex shrink-0 items-center justify-between bg-white px-6 py-5 sm:px-8">
          <div className="text-xs text-gray-500">
            Status: <span className="font-medium text-gray-700">Draft</span>
          </div>
          <div className="flex items-center gap-3">
            <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
            <PrimaryButton onClick={handleSubmit} disabled={saving || overBudgetItems.length > 0}>
              {saving ? "Creating..." : "Create PR (Draft)"}
            </PrimaryButton>
          </div>
        </div>
        </div>
      </div>
    </>
  );
}

