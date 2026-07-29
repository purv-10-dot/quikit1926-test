"use client";

import { toErrorMessage } from "@/lib/api/errors";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import type { GroupedMaterialSelectItem } from "@/components/GroupedMaterialSelect";
import { groupWorkItemsByBoq } from "@/lib/projects/boq-work-groups";
import {
  useProjects, useItemGroups, useUOMs,
  useContractors, useLocations, useMachinery,
} from "@/hooks/use-masters";
import { useWorkOrders, useBOQ, useActivities } from "@/hooks/use-projects";
import type { ActivityLeafOption } from "@/components/ActivityScopePicker";
import {
  parseStoredWeatherDetail,
  type DprWeatherDetail,
} from "@/lib/weather/dpr-weather";
import type {
  WorkItem,
  MaterialRow,
  ManpowerRow,
  StaffRow,
  MachineryRow,
  BoqPickerRow,
  DPRRecord,
} from "../lib/types";
import {
  MANPOWER_TRADES,
  newMaterial,
  newManpower,
  newStaff,
  newMachinery,
} from "../lib/constants";

export function useDprForm(
  editData?: DPRRecord,
  opts: { embedded?: boolean; onSaved?: () => void } = {},
) {
  const { embedded = false, onSaved } = opts;
  const isEdit = !!editData?.id;
  const router = useRouter();
  const qc = useQueryClient();
  const { data: projectsResult } = useProjects();
  const { data: itemGroupsResult } = useItemGroups();
  const { data: uomsResult } = useUOMs();
  const { data: contractorsResult } = useContractors();
  const { data: locationsResult } = useLocations();
  const { data: machineryResult } = useMachinery();

  const projects = (projectsResult?.data ?? []) as unknown as Array<{
    id: string; name?: string; code?: string; projectCode?: string;
    location?: string; city?: string; state?: string;
    executionMode?: string;
  }>;
  const itemGroups = (itemGroupsResult?.data ?? []) as Array<{ id: string; name?: string; status?: string; itemCount?: number }>;
  const uoms = (uomsResult?.data ?? []) as Array<{ id: string; code?: string }>;
  const contractors = (contractorsResult?.data ?? []) as Array<{ id: string; name: string; status?: string }>;
  const locations = (locationsResult?.data ?? []) as Array<{ id: string; name?: string; status?: string }>;
  const machineryMaster = (machineryResult?.data ?? []) as Array<{
    id: string; code?: string; name?: string; type?: string; status?: string;
  }>;

  // Header state
  const [projectId, setProjectId] = useState(() => editData?.projectId ?? "");
  // Where consumed materials are deducted from on approval. Required by the
  // approve endpoint whenever the DPR logs material consumption.
  const [consumptionLocationId, setConsumptionLocationId] = useState(
    () => editData?.consumptionLocationId ?? "",
  );
  // Project dropdown options. In EDIT mode the DPR's own project must always
  // be selectable even if the (user-scoped / still-loading / inactive)
  // projects list doesn't include it — otherwise a DPR that already has a
  // project shows the empty "Select Project…" placeholder.
  const projectOptions = useMemo(() => {
    const opts = projects.map((p) => ({
      value: p.id,
      label: `${p.name ?? ""}${p.executionMode === "FREE_SCOPE" ? " · Free-Scope" : ""}`,
    }));
    if (editData?.projectId && !opts.some((o) => o.value === editData.projectId)) {
      opts.unshift({
        value: editData.projectId,
        label: editData.projectName || "Current project",
      });
    }
    return opts;
  }, [projects, editData?.projectId, editData?.projectName]);
  const selectedProject = useMemo(
    () =>
      projects.find((p) => p.id === projectId) ??
      (editData?.projectId && editData.projectId === projectId
        ? { id: editData.projectId, name: editData.projectName || "Current project" }
        : undefined),
    [projects, projectId, editData?.projectId, editData?.projectName],
  );
  const isFreeScope =
    (selectedProject as { executionMode?: string } | undefined)?.executionMode ===
    "FREE_SCOPE";

  // Work Orders for the selected project (drives the Contractor/WO dropdown
  // on each work-done row). Only active WOs are worth picking.
  const { data: workOrdersResult } = useWorkOrders(
    projectId ? { projectId } : undefined
  );
  // Only APPROVED work orders are a binding contract with the contractor —
  // drafts / pending-approval WOs aren't valid to book DPR progress against,
  // so they're excluded from the Contractor / WO picker. `in_progress` is an
  // approved WO already underway, so it stays selectable too.
  const projectWorkOrders = useMemo(
    () =>
      (workOrdersResult?.data ?? []).filter(
        (wo) => wo.status === "approved" || wo.status === "in_progress"
      ),
    [workOrdersResult]
  );
  const [reportDate, setReportDate] = useState<string>(
    () => editData?.reportDate ?? new Date().toISOString().split("T")[0]
  );

  // General info & weather
  const [weatherCondition, setWeatherCondition] = useState<"Clear" | "Cloudy" | "Rain">(
    () =>
      ((editData?.weatherCondition as "Clear" | "Cloudy" | "Rain") ?? "Clear")
  );
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherHint, setWeatherHint] = useState("");
  const [weatherDetail, setWeatherDetail] = useState<DprWeatherDetail | null>(() =>
    parseStoredWeatherDetail(editData?.weatherDetail),
  );
  const [workHalted, setWorkHalted] = useState(!!editData?.workHalted);
  const [siteRemarks, setSiteRemarks] = useState(editData?.siteRemarks ?? "");

  // Weather auto-suggest is disabled for now — the /api/projects/dpr/weather
  // endpoint needs WEATHER_API_KEY (OpenWeather) which isn't configured, so the
  // call was returning WEATHER_NOT_CONFIGURED. The manual Clear/Cloudy/Rain
  // pills below still work. To re-enable, uncomment this effect and set
  // WEATHER_API_KEY in the env.
  //
  // useEffect(() => {
  //   if (isEdit) return;
  //   if (!projectId || !reportDate) return;
  //
  //   const ac = new AbortController();
  //   let cancelled = false;
  //   setWeatherLoading(true);
  //   setWeatherHint("");
  //   setWeatherDetail(null);
  //
  //   (async () => {
  //     try {
  //       const res = await fetch(
  //         `/api/projects/dpr/weather?projectId=${encodeURIComponent(projectId)}&reportDate=${encodeURIComponent(reportDate)}`,
  //         { signal: ac.signal },
  //       );
  //       const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  //       if (cancelled) return;
  //       if (!res.ok) {
  //         const msg = typeof json.error === "string" ? json.error : "";
  //         if (res.status !== 401 && res.status !== 403 && msg) {
  //           setWeatherHint(msg);
  //         }
  //         return;
  //       }
  //       const data =
  //         json.ok === true && json.data && typeof json.data === "object"
  //           ? (json.data as Record<string, unknown>)
  //           : json;
  //       const cond = data.weatherCondition;
  //       if (cond === "Clear" || cond === "Cloudy" || cond === "Rain") {
  //         setWeatherCondition(cond);
  //         setWeatherDetail(parseStoredWeatherDetail(data.detail));
  //         const loc =
  //           typeof data.resolvedLocation === "string"
  //             ? data.resolvedLocation.trim()
  //             : "";
  //         setWeatherHint(loc ? `Suggested from weather near ${loc}` : "");
  //       }
  //     } catch (e: unknown) {
  //       const name =
  //         e && typeof e === "object" && "name" in e
  //           ? String((e as { name?: string }).name)
  //           : "";
  //       if (name === "AbortError") return;
  //     } finally {
  //       if (!cancelled) setWeatherLoading(false);
  //     }
  //   })();
  //
  //   return () => {
  //     cancelled = true;
  //     ac.abort();
  //   };
  // }, [projectId, reportDate, isEdit]);

  // Work done
  const [workItems, setWorkItems] = useState<WorkItem[]>(() =>
    (editData?.workItems ?? []).map((w) => ({
      boqItemId: w.boqItemId ?? "",
      scopeType: w.scopeType,
      scopeId: w.scopeId,
      boqNo: w.boqNo ?? "",
      description: w.description ?? "",
      unit: w.unit ?? "",
      totalTarget: Number(w.totalTarget ?? 0),
      prevQty: Number(w.prevQty ?? 0),
      balanceQty:
        Number(w.totalTarget ?? 0) > 0
          ? Number(w.totalTarget ?? 0) - Number(w.prevQty ?? 0) - Number(w.todayQty ?? 0)
          : Number.MAX_SAFE_INTEGER,
      contractorWO: w.workOrderId ?? "",
      todayQty: w.todayQty != null ? String(w.todayQty) : "",
      location: w.location ?? "",
      remarks: w.remarks ?? "",
      images: Array.isArray(w.images) ? w.images : [],
      imageKeys: Array.isArray(w.imageKeys) ? w.imageKeys : [],
    }))
  );
  const [boqModalOpen, setBoqModalOpen] = useState(false);

  // Materials / Manpower / Staff / Machinery
  const [materials, setMaterials] = useState<MaterialRow[]>(() =>
    (editData?.materials ?? []).map((m) => ({
      itemId: m.itemId ?? "",
      itemName: (m as { itemName?: string }).itemName ?? "",
      uomId: (m as { uomId?: string }).uomId ?? "",
      uomCode: (m as { uomCode?: string }).uomCode ?? "",
      consumedQty: String(m.consumedQty ?? "0"),
      remarks: m.remarks ?? "",
    }))
  );
  // Live per-item stock available at the chosen consumption location.
  // On approval, consumed qty is deducted from (projectId, consumptionLocationId,
  // itemId) via postDPRConsumptionOutward, which rejects if it would drive the
  // balance negative. We pre-fetch the same balance here so the form can warn
  // the moment a user enters more than what's actually allotted at that location
  // — instead of only failing at approval time. Keyed by itemId; null = balance
  // couldn't be read (e.g. no stock permission) → no warning shown.
  const [stockByItem, setStockByItem] = useState<Record<string, number>>({});
  const [manpower, setManpower] = useState<ManpowerRow[]>(() =>
    (editData?.manpower ?? []).map((m) => ({
      contractorId: m.contractorId ?? "",
      workingArea: m.workingArea ?? "",
      messan: String(m.messan ?? "0"),
      maleHelper: String(m.maleHelper ?? "0"),
      femaleHelper: String(m.femaleHelper ?? "0"),
      carpenter: String(m.carpenter ?? "0"),
      fitter: String(m.fitter ?? "0"),
      painter: String(m.painter ?? "0"),
      plumber: String(m.plumber ?? "0"),
      electrician: String(m.electrician ?? "0"),
      operator: String(m.operator ?? "0"),
    }))
  );
  const [staff, setStaff] = useState<StaffRow[]>(() =>
    (editData?.staff ?? []).map((s) => ({
      name: s.name ?? "",
      designation: s.designation ?? "",
      present: s.present ?? true,
      reason: s.reason ?? "",
    }))
  );
  const [machinery, setMachinery] = useState<MachineryRow[]>(() =>
    (editData?.machinery ?? []).map((m) => ({
      description: m.description ?? "",
      condition: (m.condition as MachineryRow["condition"]) ?? "Running",
      requiredQty: String(m.requiredQty ?? "1"),
      actualQty: String(m.actualQty ?? "1"),
      remarks: m.remarks ?? "",
    }))
  );

  // Submit state
  const [saving, setSaving] = useState<null | "draft" | "submit">(null);
  const [error, setError] = useState("");

  // Index of the work item whose photos are being viewed in the gallery
  // modal. The Images cell only renders one thumbnail + a "+N" badge so
  // the row stays compact; the full set lives in this modal.
  const [galleryIdx, setGalleryIdx] = useState<number | null>(null);

  const alreadyAddedBoqIds = useMemo(
    () => new Set(workItems.map((w) => w.boqItemId)),
    [workItems]
  );
  const alreadyAddedScopeIds = useMemo(
    () => new Set(workItems.map((w) => w.scopeId).filter(Boolean) as string[]),
    [workItems]
  );

  // Project BOQ tree — used to resolve each work item's parent group so the
  // Work Done table can show a group header row above its line items (the
  // saved DPR only stores the leaf boqItemId, so the parent is looked up
  // here for both new and edit mode). Cached by React Query, so it reuses
  // the same fetch the BOQ picker modal makes.
  const { data: boqTreeResult } = useBOQ(projectId || null);
  const { data: activitiesResult } = useActivities(
    projectId && isFreeScope ? projectId : null,
  );
  const activityItems: ActivityLeafOption[] = useMemo(
    () =>
      (activitiesResult?.data ?? []).map((a) => ({
        id: a.id,
        activityCode: a.activityCode,
        description: a.description,
        uomId: a.uomId,
        uomCode: a.uomCode,
        tenderQty: a.tenderQty,
        scopeQty: a.scopeQty,
        path: a.path,
      })),
    [activitiesResult],
  );
  const boqRows = useMemo(
    () => boqTreeResult?.items ?? boqTreeResult?.data ?? [],
    [boqTreeResult]
  );
  // Group the work items by their BOQ hierarchy so the Work Done table can
  // show group / sub-group header rows above each leaf. Shared with the DPR
  // detail page via `groupWorkItemsByBoq`.
  const groupedWorkItems = useMemo(
    () => groupWorkItemsByBoq(workItems, boqRows),
    [workItems, boqRows],
  );

  // ── Work Items handlers ──
  const addWorkItemFromActivity = (a: ActivityLeafOption) => {
    // Same precedence the DPR read path applies: a revised scope qty
    // supersedes the tender baseline, so create and edit agree on the
    // denominator behind % Completed.
    const revisedQty = Number(a.scopeQty ?? 0);
    const totalTarget = revisedQty > 0 ? revisedQty : Number(a.tenderQty ?? 0);
    const balanceQty = totalTarget > 0 ? totalTarget : Number.MAX_SAFE_INTEGER;
    setWorkItems((prev) => [
      ...prev,
      {
        boqItemId: "",
        scopeType: "ACTIVITY",
        scopeId: a.id,
        boqNo: a.activityCode,
        description: a.description,
        unit: a.uomCode ?? "",
        totalTarget,
        prevQty: 0,
        balanceQty,
        contractorWO: "",
        todayQty: "",
        location: "",
        remarks: "",
        images: [],
        imageKeys: [],
      },
    ]);
  };
  const addWorkItemFromBoq = (row: BoqPickerRow) => {
    const totalTarget = Number(row.scopeQty ?? 0);
    const balance = Number(row.balanceQty ?? totalTarget);
    const prevQty = Math.max(0, totalTarget - balance);
    setWorkItems((prev) => [
      ...prev,
      {
        boqItemId: row.id,
        boqNo: row.boq_no,
        description: row.display_name,
        unit: row.unit ?? "",
        totalTarget,
        prevQty,
        balanceQty: balance,
        contractorWO: "",
        todayQty: "",
        location: "",
        remarks: "",
        images: [],
        imageKeys: [],
      },
    ]);
  };
  const updateWorkItem = (idx: number, field: keyof WorkItem, value: string) =>
    setWorkItems((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, [field]: value } : r))
    );
  const addWorkItemImages = async (idx: number, files: FileList | null) => {
    if (!files || files.length === 0) return;
    const dataUrls: string[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;
      const url = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      dataUrls.push(url);
    }
    if (dataUrls.length === 0) return;
    setWorkItems((prev) =>
      prev.map((r, i) =>
        i === idx
          ? { ...r, images: [...r.images, ...dataUrls], imageKeys: [...r.imageKeys, ...dataUrls.map(() => "")] }
          : r,
      )
    );
  };
  const removeWorkItemImage = (idx: number, imgIdx: number) =>
    setWorkItems((prev) =>
      prev.map((r, i) =>
        i === idx
          ? {
              ...r,
              images: r.images.filter((_, j) => j !== imgIdx),
              imageKeys: r.imageKeys.filter((_, j) => j !== imgIdx),
            }
          : r
      )
    );
  const removeWorkItem = (idx: number) =>
    setWorkItems((prev) => prev.filter((_, i) => i !== idx));

  // ── Material handlers ──
  const addMaterial = () => setMaterials((p) => [...p, newMaterial()]);
  const updateMaterial = (idx: number, field: keyof MaterialRow, value: string) =>
    setMaterials((prev) =>
      prev.map((row, i) => (i !== idx ? row : { ...row, [field]: value }))
    );
  const removeMaterial = (idx: number) =>
    setMaterials((prev) => prev.filter((_, i) => i !== idx));

  // Stable key of the distinct materials picked, so the balance fetch below
  // only re-runs when the set of items (not their qty/remarks) changes.
  const materialItemIdsKey = useMemo(
    () =>
      Array.from(new Set(materials.map((m) => m.itemId).filter(Boolean)))
        .sort()
        .join(","),
    [materials],
  );

  // Fetch the current stock balance for every picked material at the chosen
  // consumption location. Needs both projectId + locationId for an exact
  // per-location figure (the endpoint widens to a project/tenant total
  // otherwise, which wouldn't match what approval deducts). Silently skips
  // when the location isn't chosen yet or the user lacks stock-view access.
  useEffect(() => {
    const ids = materialItemIdsKey ? materialItemIdsKey.split(",") : [];
    if (!projectId || !consumptionLocationId || ids.length === 0) {
      setStockByItem({});
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const results = await Promise.all(
          ids.map(async (itemId) => {
            const params = new URLSearchParams({
              itemId,
              projectId,
              locationId: consumptionLocationId,
            });
            const res = await fetch(`/api/store/stock-balance?${params.toString()}`);
            if (!res.ok) return null;
            const json = await res.json();
            return { itemId, qty: Number(json?.quantity ?? 0) };
          }),
        );
        if (cancelled) return;
        const next: Record<string, number> = {};
        for (const r of results) {
          if (r) next[r.itemId] = r.qty;
        }
        setStockByItem(next);
      } catch {
        if (!cancelled) setStockByItem({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, consumptionLocationId, materialItemIdsKey]);

  // ── Manpower handlers ──
  const addManpower = () => setManpower((p) => [...p, newManpower()]);
  const updateManpower = (
    idx: number,
    field: keyof ManpowerRow,
    value: string
  ) =>
    setManpower((prev) =>
      prev.map((row, i) => (i === idx ? { ...row, [field]: value } : row))
    );
  const removeManpower = (idx: number) =>
    setManpower((prev) => prev.filter((_, i) => i !== idx));


  // ── Staff handlers ──
  const addStaff = () => setStaff((p) => [...p, newStaff()]);
  const updateStaff = (idx: number, field: keyof StaffRow, value: string | boolean) =>
    setStaff((prev) =>
      prev.map((row, i) => (i === idx ? { ...row, [field]: value } : row))
    );
  const removeStaff = (idx: number) =>
    setStaff((prev) => prev.filter((_, i) => i !== idx));

  // ── Machinery handlers ──
  const addMachinery = () => setMachinery((p) => [...p, newMachinery()]);
  const updateMachinery = (idx: number, field: keyof MachineryRow, value: string) =>
    setMachinery((prev) =>
      prev.map((row, i) => (i === idx ? { ...row, [field]: value } : row))
    );
  const removeMachinery = (idx: number) =>
    setMachinery((prev) => prev.filter((_, i) => i !== idx));

  // ── Save / Submit ──
  const handleSave = async (mode: "draft" | "submit") => {
    setError("");
    if (!projectId) return setError("Pick a project");
    if (!reportDate) return setError("Pick a report date");
    if (mode === "submit" && workItems.length === 0) {
      return setError("Add at least one BOQ activity before submitting");
    }
    const invalidWork = workItems.find((w) => !w.todayQty);
    if (mode === "submit" && invalidWork) {
      return setError(`Enter today's qty for ${invalidWork.boqNo}`);
    }

    setSaving(mode);
    try {
      const payload = {
        projectId,
        consumptionLocationId: consumptionLocationId || null,
        reportDate,
        weatherCondition,
        weatherDetail,
        workHalted,
        siteRemarks,
        workItems: workItems.map((w) => {
          const todayNum = parseFloat(w.todayQty) || 0;
          const totalTillDate = w.prevQty + todayNum;
          // Cap at 100% — cumulative qty can technically exceed the target
          // (over-reporting), but a completion percentage above 100% is
          // meaningless and misleads downstream progress rollups. Mirrors
          // the display cell's Math.min(100, …) so stored + shown agree.
          const pct =
            w.totalTarget > 0
              ? Math.min(100, (totalTillDate / w.totalTarget) * 100)
              : 0;
          const wo = projectWorkOrders.find((x) => x.id === w.contractorWO);
          return {
            boqItemId: w.boqItemId,
            scopeType: w.scopeType ?? null,
            scopeId: w.scopeId ?? null,
            boqNo: w.boqNo,
            description: w.description,
            unit: w.unit,
            totalTarget: w.totalTarget,
            prevQty: w.prevQty,
            todayQty: todayNum,
            totalTillDate,
            pctCompleted: pct,
            workOrderId: wo?.id ?? null,
            workOrderNumber: wo?.woNumber ?? null,
            contractorName: wo?.contractorName ?? "Self Work",
            location: w.location,
            remarks: w.remarks,
            images: w.images,
            imageKeys: w.imageKeys,
          };
        }),
        materials: materials
          .filter((m) => m.itemId)
          .map((m) => ({
            itemId: m.itemId,
            consumedQty: parseFloat(m.consumedQty) || 0,
            // uomId is captured onto the line at pick time (onSelect) / edit-load.
            uomId: m.uomId ?? "",
            remarks: m.remarks || null,
          })),
        manpower: manpower
          .filter(
            (m) =>
              m.contractorId ||
              m.workingArea.trim() ||
              MANPOWER_TRADES.some((t) => (parseFloat(m[t.key]) || 0) !== 0)
          )
          .map((m) => ({
            contractorId: m.contractorId || null,
            workingArea: m.workingArea || null,
            messan: parseFloat(m.messan) || 0,
            maleHelper: parseFloat(m.maleHelper) || 0,
            femaleHelper: parseFloat(m.femaleHelper) || 0,
            carpenter: parseFloat(m.carpenter) || 0,
            fitter: parseFloat(m.fitter) || 0,
            painter: parseFloat(m.painter) || 0,
            plumber: parseFloat(m.plumber) || 0,
            electrician: parseFloat(m.electrician) || 0,
            operator: parseFloat(m.operator) || 0,
          })),
        staff: staff
          .filter((s) => s.name)
          .map((s) => ({
            name: s.name,
            designation: s.designation,
            present: s.present,
            reason: s.present ? "" : s.reason,
          })),
        machinery: machinery
          .filter((m) => m.description)
          .map((m) => ({
            description: m.description,
            condition: m.condition,
            requiredQty: parseInt(m.requiredQty) || 0,
            actualQty: parseInt(m.actualQty) || 0,
            remarks: m.remarks,
          })),
        // The form ALWAYS persists as draft — workflow submission is a
        // separate action that creates the approval instance via the
        // /submit endpoint. The detail page auto-opens the submit modal
        // when ?submit=1 is in the URL so the user gets a single-click
        // "Save & Submit" experience.
        status: "draft",
      };

      const url = isEdit
        ? `/api/projects/dpr/${editData.id}`
        : "/api/projects/dpr";
      const res = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: {
          "Content-Type": "application/json",
          ...(isEdit
            ? {}
            : {
                "Idempotency-Key": `dpr-${projectId}-${reportDate}-${Date.now()}`,
              }),
        },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);

      const savedId = json?.id ?? editData?.id;

      // Invalidate the React Query caches so the detail + edit views refetch
      // the saved record instead of serving the stale pre-edit snapshot.
      // router.refresh() only re-runs server components — it does NOT touch
      // the client query cache that useDPR / the edit page read from, so
      // without this an edited value looks like it "didn't update".
      if (savedId) qc.invalidateQueries({ queryKey: ["dpr", savedId] });
      qc.invalidateQueries({ queryKey: ["dprs"] });

      if (embedded) {
        // Drawer host handles refresh + close. Submit-then-page-redirect
        // doesn't apply here — the user can re-enter the row from the
        // list and submit there.
        onSaved?.();
        return;
      }
      if (mode === "submit" && savedId) {
        // Save → land on detail page with submit modal pre-opened.
        router.push(`/projects/dpr/${savedId}?submit=1`);
      } else {
        router.push("/projects/dpr");
      }
      router.refresh();
    } catch (e: unknown) {
      setError(toErrorMessage(e, "Failed to save DPR"));
    } finally {
      setSaving(null);
    }
  };

  return {
    isEdit,
    projects, itemGroups, uoms, contractors, locations, machineryMaster,
    projectOptions, selectedProject, projectWorkOrders,
    alreadyAddedBoqIds, alreadyAddedScopeIds, boqRows, groupedWorkItems, materialItemIdsKey,
    isFreeScope, activityItems,
    projectId, setProjectId,
    consumptionLocationId, setConsumptionLocationId,
    reportDate, setReportDate,
    weatherCondition, setWeatherCondition,
    weatherLoading, setWeatherLoading,
    weatherHint, setWeatherHint,
    weatherDetail, setWeatherDetail,
    workHalted, setWorkHalted,
    siteRemarks, setSiteRemarks,
    workItems, setWorkItems,
    boqModalOpen, setBoqModalOpen,
    materials, setMaterials,
    stockByItem, setStockByItem,
    manpower, setManpower,
    staff, setStaff,
    machinery, setMachinery,
    saving, setSaving,
    error, setError,
    galleryIdx, setGalleryIdx,
    addWorkItemFromBoq, addWorkItemFromActivity, updateWorkItem, addWorkItemImages, removeWorkItemImage, removeWorkItem,
    addMaterial, updateMaterial, removeMaterial,
    addManpower, updateManpower, removeManpower,
    addStaff, updateStaff, removeStaff,
    addMachinery, updateMachinery, removeMachinery,
    handleSave,
  };
}
