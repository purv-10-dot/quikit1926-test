"use client";

/**
 * New Daily Progress Report — full-page form.
 *
 * Layout (matches the reference screenshots):
 *
 *   Header strip:        Date picker · Project selector · Copy Previous Day
 *                        · Save Draft · Submit Report
 *   GENERAL INFO         Weather (Clear/Cloudy/Rain) · Work Halted · Site Remarks
 *   WORK DONE            empty state → [Add Activity from BOQ] → cascading picker
 *   MATERIALS            table with Material, Unit, tender/received/used columns
 *   MANPOWER DEPLOYED    Contractor · Working Area · skill count columns
 *   STAFF DEPLOYED       Name · Designation · Present · Reason if absent
 *   MACHINERY DEPLOYED   Description · Condition · Req/Actual qty · Remarks
 *
 * Save Draft → POST /api/projects/dpr { status: "draft" }
 * Submit Report → POST /api/projects/dpr { status: "submitted" }
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Save,
  Send,
  Cloud,
  CloudRain,
  Sun,
  Plus,
  Trash2,
  FileText,
  Package,
  Users,
  Truck,
  Loader2,
  AlertTriangle,
  ImageIcon,
  X,
  ChevronDown,
  CheckCircle2,
  Calendar,
  MapPin,
  Building2,
} from "lucide-react";
import { SelectInput } from "@/components/FormDrawer";
import { GroupedMaterialSelect } from "@/components/GroupedMaterialSelect";
import { DPRWeatherMetrics } from "@/components/DPRWeatherMetrics";
import { useProjects, useItems, useItemGroups, useUOMs, useContractors } from "@/hooks/use-masters";
import { useWorkOrders } from "@/hooks/use-projects";
import { BOQActivityPickerModal } from "../../work-orders/new/BOQActivityPickerModal";
import {
  parseStoredWeatherDetail,
  type DprWeatherDetail,
} from "@/lib/weather/dpr-weather";

interface WorkItem {
  boqItemId: string;
  boqNo: string;
  description: string;
  unit: string;
  /** Total scope from BOQ (tender qty). */
  totalTarget: number;
  /** Cumulative qty done before today. */
  prevQty: number;
  balanceQty: number;
  /** "" = Self Work, otherwise a Work Order id. */
  contractorWO: string;
  todayQty: string;
  location: string;
  remarks: string;
  /** Site photos for this activity. Stored as base64 data URLs in state
   *  so the form can preview without an upload round-trip. */
  images: string[];
}

interface MaterialRow {
  itemId: string;
  itemName: string;
  uomCode: string;
  totalTender: string;
  prevReceived: string;
  todayReceived: string;
  prevUsed: string;
  todayUsed: string;
}

interface ManpowerRow {
  contractorId: string;
  workingArea: string;
  messan: string;
  maleHelper: string;
  femaleHelper: string;
  carpenter: string;
  fitter: string;
  painter: string;
  plumber: string;
  electrician: string;
  operator: string;
}

interface StaffRow {
  name: string;
  designation: string;
  present: boolean;
  reason: string;
}

interface MachineryRow {
  description: string;
  condition: "Running" | "Idle" | "Breakdown" | "Under Repair";
  requiredQty: string;
  actualQty: string;
  remarks: string;
}

const newWorkItem = (): WorkItem => ({
  boqItemId: "",
  boqNo: "",
  description: "",
  unit: "",
  totalTarget: 0,
  prevQty: 0,
  balanceQty: 0,
  contractorWO: "",
  todayQty: "",
  location: "",
  remarks: "",
  images: [],
});

const newMaterial = (): MaterialRow => ({
  itemId: "",
  itemName: "",
  uomCode: "",
  totalTender: "0",
  prevReceived: "0",
  todayReceived: "0",
  prevUsed: "0",
  todayUsed: "0",
});

const newManpower = (): ManpowerRow => ({
  contractorId: "",
  workingArea: "",
  messan: "0",
  maleHelper: "0",
  femaleHelper: "0",
  carpenter: "0",
  fitter: "0",
  painter: "0",
  plumber: "0",
  electrician: "0",
  operator: "0",
});

const newStaff = (): StaffRow => ({
  name: "",
  designation: "",
  present: true,
  reason: "",
});

const newMachinery = (): MachineryRow => ({
  description: "",
  condition: "Running",
  requiredQty: "1",
  actualQty: "1",
  remarks: "",
});

/**
 * Shared DPR form — used by both the "New DPR" and "Edit DPR" pages.
 * When `editData` is passed, the form hydrates from the existing record
 * and handleSave switches to PUT /api/projects/dpr/:id.
 */
interface DPRFormProps {
  /** When present, switches to edit mode and pre-fills every field. */
  editData?: any;
  /** When true, hides the sticky page header strip (date picker / project /
   *  Save / Submit) so the form can render cleanly inside a side drawer
   *  that supplies its own header / footer chrome. After a successful
   *  save, `onSaved` fires instead of the default `router.push` so the
   *  drawer host can close itself and refresh the list. */
  embedded?: boolean;
  /** Called after a successful create / update when `embedded` is true. */
  onSaved?: () => void;
}

export function DPRForm({ editData, embedded = false, onSaved }: DPRFormProps = {}) {
  const isEdit = !!editData?.id;
  const router = useRouter();
  const { data: projectsResult } = useProjects();
  const { data: itemsResult } = useItems();
  const { data: itemGroupsResult } = useItemGroups();
  const { data: uomsResult } = useUOMs();
  const { data: contractorsResult } = useContractors();

  const projects = projectsResult?.data ?? [];
  const items = (itemsResult?.data ?? []) as any[];
  const itemGroups = (itemGroupsResult?.data ?? []) as any[];
  const uoms = (uomsResult?.data ?? []) as any[];
  const contractors = (contractorsResult?.data ?? []) as any[];

  // Header state
  const [projectId, setProjectId] = useState(() => editData?.projectId ?? "");
  const selectedProject = useMemo(
    () => (projects as any[]).find((p) => p.id === projectId),
    [projects, projectId],
  );

  // Work Orders for the selected project (drives the Contractor/WO dropdown
  // on each work-done row). Only active WOs are worth picking.
  const { data: workOrdersResult } = useWorkOrders(
    projectId ? { projectId } : undefined
  );
  const projectWorkOrders = useMemo(
    () =>
      (workOrdersResult?.data ?? []).filter(
        (wo: any) => wo.status !== "inactive"
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

  useEffect(() => {
    if (isEdit) return;
    if (!projectId || !reportDate) return;

    const ac = new AbortController();
    let cancelled = false;
    setWeatherLoading(true);
    setWeatherHint("");
    setWeatherDetail(null);

    (async () => {
      try {
        const res = await fetch(
          `/api/projects/dpr/weather?projectId=${encodeURIComponent(projectId)}&reportDate=${encodeURIComponent(reportDate)}`,
          { signal: ac.signal },
        );
        const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        if (cancelled) return;
        if (!res.ok) {
          const msg = typeof json.error === "string" ? json.error : "";
          if (res.status !== 401 && res.status !== 403 && msg) {
            setWeatherHint(msg);
          }
          return;
        }
        const data =
          json.ok === true && json.data && typeof json.data === "object"
            ? (json.data as Record<string, unknown>)
            : json;
        const cond = data.weatherCondition;
        if (cond === "Clear" || cond === "Cloudy" || cond === "Rain") {
          setWeatherCondition(cond);
          setWeatherDetail(parseStoredWeatherDetail(data.detail));
          const loc =
            typeof data.resolvedLocation === "string"
              ? data.resolvedLocation.trim()
              : "";
          setWeatherHint(loc ? `Suggested from weather near ${loc}` : "");
        }
      } catch (e: unknown) {
        const name =
          e && typeof e === "object" && "name" in e
            ? String((e as { name?: string }).name)
            : "";
        if (name === "AbortError") return;
      } finally {
        if (!cancelled) setWeatherLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [projectId, reportDate, isEdit]);

  // Work done
  const [workItems, setWorkItems] = useState<WorkItem[]>(() =>
    (editData?.workItems ?? []).map((w: any) => ({
      boqItemId: w.boqItemId ?? "",
      boqNo: w.boqNo ?? "",
      description: w.description ?? "",
      unit: w.unit ?? "",
      totalTarget: Number(w.totalTarget ?? 0),
      prevQty: Number(w.prevQty ?? 0),
      balanceQty:
        Number(w.totalTarget ?? 0) - Number(w.prevQty ?? 0) - Number(w.todayQty ?? 0),
      contractorWO: w.workOrderId ?? "",
      todayQty: w.todayQty != null ? String(w.todayQty) : "",
      location: w.location ?? "",
      remarks: w.remarks ?? "",
      images: Array.isArray(w.images) ? w.images : [],
    }))
  );
  const [boqModalOpen, setBoqModalOpen] = useState(false);

  // Materials / Manpower / Staff / Machinery
  const [materials, setMaterials] = useState<MaterialRow[]>(() =>
    (editData?.materials ?? []).map((m: any) => ({
      itemId: m.itemId ?? "",
      itemName: m.itemName ?? "",
      uomCode: m.uomCode ?? "",
      totalTender: String(m.totalTender ?? "0"),
      prevReceived: String(m.prevReceived ?? "0"),
      todayReceived: String(m.todayReceived ?? "0"),
      prevUsed: String(m.prevUsed ?? "0"),
      todayUsed: String(m.todayUsed ?? "0"),
    }))
  );
  const [manpower, setManpower] = useState<ManpowerRow[]>(() =>
    (editData?.manpower ?? []).map((m: any) => ({
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
    (editData?.staff ?? []).map((s: any) => ({
      name: s.name ?? "",
      designation: s.designation ?? "",
      present: s.present ?? true,
      reason: s.reason ?? "",
    }))
  );
  const [machinery, setMachinery] = useState<MachineryRow[]>(() =>
    (editData?.machinery ?? []).map((m: any) => ({
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

  // ── Work Items handlers ──
  const addWorkItemFromBoq = (row: any) => {
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
      prev.map((r, i) => (i === idx ? { ...r, images: [...r.images, ...dataUrls] } : r))
    );
  };
  const removeWorkItemImage = (idx: number, imgIdx: number) =>
    setWorkItems((prev) =>
      prev.map((r, i) =>
        i === idx ? { ...r, images: r.images.filter((_, j) => j !== imgIdx) } : r
      )
    );
  const removeWorkItem = (idx: number) =>
    setWorkItems((prev) => prev.filter((_, i) => i !== idx));

  // ── Material handlers ──
  const addMaterial = () => setMaterials((p) => [...p, newMaterial()]);
  const updateMaterial = (idx: number, field: keyof MaterialRow, value: string) =>
    setMaterials((prev) =>
      prev.map((row, i) => {
        if (i !== idx) return row;
        const next = { ...row, [field]: value };
        if (field === "itemId") {
          const item = items.find((it) => it.id === value);
          if (item) {
            next.itemName = item.name ?? "";
            next.uomCode = item.uomCode ?? "";
          } else {
            next.itemName = "";
            next.uomCode = "";
          }
        }
        return next;
      })
    );
  const removeMaterial = (idx: number) =>
    setMaterials((prev) => prev.filter((_, i) => i !== idx));

  // ── Manpower handlers ──
  const addManpower = () => setManpower((p) => [...p, newManpower()]);
  const updateManpower = (idx: number, field: keyof ManpowerRow, value: string) =>
    setManpower((prev) =>
      prev.map((row, i) => (i === idx ? { ...row, [field]: value } : row))
    );
  const removeManpower = (idx: number) =>
    setManpower((prev) => prev.filter((_, i) => i !== idx));

  const manpowerTotal = (row: ManpowerRow) => {
    const n = (v: string) => parseInt(v) || 0;
    return (
      n(row.messan) +
      n(row.maleHelper) +
      n(row.femaleHelper) +
      n(row.carpenter) +
      n(row.fitter) +
      n(row.painter) +
      n(row.plumber) +
      n(row.electrician) +
      n(row.operator)
    );
  };

  // ── Staff handlers ──
  const addStaff = () => setStaff((p) => [...p, newStaff()]);
  const updateStaff = (idx: number, field: keyof StaffRow, value: any) =>
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
        reportDate,
        weatherCondition,
        weatherDetail,
        workHalted,
        siteRemarks,
        workItems: workItems.map((w) => {
          const todayNum = parseFloat(w.todayQty) || 0;
          const totalTillDate = w.prevQty + todayNum;
          const pct =
            w.totalTarget > 0 ? (totalTillDate / w.totalTarget) * 100 : 0;
          const wo = projectWorkOrders.find((x: any) => x.id === w.contractorWO);
          return {
            boqItemId: w.boqItemId,
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
          };
        }),
        materials: materials
          .filter((m) => m.itemId)
          .map((m) => {
            const prevR = parseFloat(m.prevReceived) || 0;
            const todayR = parseFloat(m.todayReceived) || 0;
            const prevU = parseFloat(m.prevUsed) || 0;
            const todayU = parseFloat(m.todayUsed) || 0;
            return {
              itemId: m.itemId,
              itemName: m.itemName,
              uomCode: m.uomCode,
              totalTender: parseFloat(m.totalTender) || 0,
              prevReceived: prevR,
              todayReceived: todayR,
              totalReceived: prevR + todayR,
              prevUsed: prevU,
              todayUsed: todayU,
              totalUsed: prevU + todayU,
              balanceSite: prevR + todayR - (prevU + todayU),
            };
          }),
        manpower: manpower
          .filter((m) => m.contractorId)
          .map((m) => ({
            contractorId: m.contractorId,
            contractorName:
              contractors.find((c) => c.id === m.contractorId)?.name ?? "",
            workingArea: m.workingArea,
            messan: parseInt(m.messan) || 0,
            maleHelper: parseInt(m.maleHelper) || 0,
            femaleHelper: parseInt(m.femaleHelper) || 0,
            carpenter: parseInt(m.carpenter) || 0,
            fitter: parseInt(m.fitter) || 0,
            painter: parseInt(m.painter) || 0,
            plumber: parseInt(m.plumber) || 0,
            electrician: parseInt(m.electrician) || 0,
            operator: parseInt(m.operator) || 0,
            total: manpowerTotal(m),
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
    } catch (e: any) {
      setError(e?.message ?? "Failed to save DPR");
    } finally {
      setSaving(null);
    }
  };

  return (
    <>
      {/* Page header — hidden in embedded (drawer) mode because the
          drawer chrome supplies its own title + close. */}
      {!embedded && (
      <div className="px-6 py-5">
        <h1 className="text-lg font-bold text-gray-900">Daily Progress Report</h1>
        <p className="text-xs text-gray-500">
          Track daily site activities, material consumption, and labor.
        </p>
      </div>
      )}

      {/* In embedded (drawer) mode skip PageContainer's outer p-6 +
          max-width — the form needs to fill the drawer body so the sticky
          footer sits flush to the drawer edges. In page mode PageContainer
          still applies for desktop layout. NB: no `overflow-hidden`
          wrapper anywhere in this tree — that would create a new scroll
          context and the sticky footer below would stop sticking to the
          actual scrolling ancestor. */}
      <div className={embedded ? "" : "p-6 max-w-[1600px] mx-auto"}>
        <div>
          {/* Sticky header block — wraps the context strip (date / project
              / project meta card) AND the section nav so they pin to the
              top together as one cohesive header while the user scrolls
              through sections. Single z-30 layer so they don't fight each
              other for stacking; the X close button (z-30 in DPRDrawer)
              is shielded from these by the wrapper's pr-14 reservation
              on the strip below. */}
          <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-md shadow-[0_2px_8px_-4px_rgba(15,23,42,0.06)]">
          <div className="px-6 py-4 pr-14 border-b border-slate-200 bg-gradient-to-b from-white to-slate-50/40">
            <div className="flex items-end gap-4 flex-wrap">
              {!embedded && (
                <div className="flex items-center gap-3 mr-auto">
                  <Link
                    href="/projects/dpr"
                    className="mt-5 p-2 rounded-lg hover:bg-slate-100 hover:text-orange-700 text-slate-500 border border-transparent hover:border-orange-200 transition-all"
                    title="Back to DPR list"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </Link>
                  <div className="mt-2">
                    <div className="text-base font-bold text-slate-900 tracking-tight">
                      {isEdit ? `Edit ${editData.dprNumber ?? "DPR"}` : "New Daily Report"}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {isEdit
                        ? "Update details for this daily progress report"
                        : "Fill in the details for the day's activities"}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-end gap-3 flex-wrap flex-1 min-w-0">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Report Date
                  </label>
                  <div className="relative">
                    <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    <input
                      type="date"
                      value={reportDate}
                      onChange={(e) => setReportDate(e.target.value)}
                      className="text-sm pl-8 pr-3 py-2 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-400 transition-shadow"
                    />
                  </div>
                </div>
                <div className="min-w-[220px] flex-1">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                    Project <span className="text-rose-500">*</span>
                  </label>
                  <SelectInput
                    value={projectId}
                    onChange={setProjectId}
                    placeholder="Select Project…"
                    options={projects.map((p: any) => ({ value: p.id, label: p.name }))}
                  />
                </div>
              </div>
            </div>

            {/* Project context card — appears once a project is selected so
                the user has a persistent visual anchor for *which* project
                this DPR belongs to as they scroll the form. */}
            {selectedProject && (
              <div className="mt-3 flex items-center gap-3 px-3 py-2 rounded-lg bg-white border border-orange-100 ring-1 ring-orange-50">
                <div className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-orange-50 text-orange-600 ring-1 ring-orange-100 shrink-0">
                  <Building2 className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Reporting for
                  </div>
                  <div className="text-sm font-semibold text-slate-900 truncate">
                    {selectedProject.name}
                  </div>
                </div>
                {(selectedProject.code || selectedProject.projectCode) && (
                  <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[11px] font-bold tabular-nums">
                    {selectedProject.code ?? selectedProject.projectCode}
                  </span>
                )}
                {(selectedProject.location ||
                  selectedProject.city ||
                  selectedProject.state) && (
                  <span className="hidden md:inline-flex items-center gap-1 text-[11px] text-slate-500 max-w-[200px] truncate">
                    <MapPin className="w-3.5 h-3.5 shrink-0" />
                    {[
                      selectedProject.location,
                      selectedProject.city,
                      selectedProject.state,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Section navigation — quick-jump pills with item counts. Lets
              users see at a glance which sections have content and skip
              directly to whatever they need to fill in next. */}
          <SectionNav
            items={[
              { id: "dpr-general", label: "General", icon: <Cloud className="w-3.5 h-3.5" />, count: 0 },
              { id: "dpr-work", label: "Work Done", icon: <FileText className="w-3.5 h-3.5" />, count: workItems.length },
              { id: "dpr-materials", label: "Materials", icon: <Package className="w-3.5 h-3.5" />, count: materials.length },
              { id: "dpr-manpower", label: "Manpower", icon: <Users className="w-3.5 h-3.5" />, count: manpower.length },
              { id: "dpr-staff", label: "Staff", icon: <Users className="w-3.5 h-3.5" />, count: staff.length },
              { id: "dpr-machinery", label: "Machinery", icon: <Truck className="w-3.5 h-3.5" />, count: machinery.length },
            ]}
          />
          </div>

          {/* Error banner */}
          {error && (
            <div className="mx-6 mt-4 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-sm text-red-700 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="flex-1">{error}</span>
              <button onClick={() => setError("")} className="text-red-400 hover:text-red-600">
                ×
              </button>
            </div>
          )}

          {/* Form body */}
          <div className="p-6 space-y-4">
            {/* ── GENERAL INFO & WEATHER ── */}
            <Section
              id="dpr-general"
              icon={<Cloud className="w-4 h-4" />}
              title="GENERAL INFO & WEATHER"
              defaultOpen={isEdit}
            >
              {/* Weather + Work Status — single row of compact horizontal pills.
                  All four pills share the same height so the row reads as one
                  unified control bar instead of mismatched cards. */}
              <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
                <div>
                  <label className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    Weather
                    {weatherLoading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" aria-hidden />
                    ) : null}
                  </label>
                  <div className="inline-flex rounded-lg border border-slate-200 bg-white overflow-hidden">
                    {(
                      [
                        { key: "Clear",  label: "Clear",  icon: Sun,       activeBg: "bg-amber-50",  activeText: "text-amber-700",  activeIcon: "text-amber-500" },
                        { key: "Cloudy", label: "Cloudy", icon: Cloud,     activeBg: "bg-slate-100", activeText: "text-slate-800",  activeIcon: "text-slate-600" },
                        { key: "Rain",   label: "Rain",   icon: CloudRain, activeBg: "bg-sky-50",    activeText: "text-sky-700",    activeIcon: "text-sky-600"  },
                      ] as const
                    ).map((opt, i) => {
                      const active = weatherCondition === opt.key;
                      const Icon = opt.icon;
                      return (
                        <button
                          key={opt.key}
                          type="button"
                          onClick={() => {
                            setWeatherCondition(opt.key);
                            setWeatherDetail(null);
                          }}
                          className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold transition-all ${
                            i > 0 ? "border-l border-slate-200" : ""
                          } ${
                            active
                              ? `${opt.activeBg} ${opt.activeText}`
                              : "text-slate-600 hover:bg-slate-50"
                          }`}
                          aria-pressed={active}
                        >
                          <Icon className={`w-4 h-4 ${active ? opt.activeIcon : "text-slate-400"}`} />
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                  {weatherHint ? (
                    <p className="mt-1.5 text-[11px] text-slate-500 max-w-md">{weatherHint}</p>
                  ) : null}
                  <DPRWeatherMetrics
                    detail={weatherDetail}
                    className="mt-3 pt-3 border-t border-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    Work Status
                  </label>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={workHalted}
                    onClick={() => setWorkHalted(!workHalted)}
                    className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-semibold whitespace-nowrap transition-all ${
                      workHalted
                        ? "bg-rose-50 border-rose-300 text-rose-700"
                        : "bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    <AlertTriangle
                      className={`w-4 h-4 ${workHalted ? "text-rose-600" : "text-slate-400"}`}
                    />
                    <span>Work Halted</span>
                    <span
                      className={`relative inline-flex w-8 h-4 rounded-full transition-colors ml-1 ${
                        workHalted ? "bg-rose-500" : "bg-slate-300"
                      }`}
                      aria-hidden
                    >
                      <span
                        className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow-sm transition-transform ${
                          workHalted ? "translate-x-[17px]" : "translate-x-0.5"
                        }`}
                      />
                    </span>
                  </button>
                </div>
              </div>
              <div className="mt-5">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Site Remarks
                </label>
                <textarea
                  value={siteRemarks}
                  onChange={(e) => setSiteRemarks(e.target.value)}
                  placeholder="General observations, visitor log, instructions received…"
                  rows={3}
                  className="w-full text-sm px-3.5 py-2.5 border border-slate-300 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-400 resize-none placeholder:text-slate-400 transition-shadow"
                />
              </div>
            </Section>

            {/* ── WORK DONE ── */}
            <Section
              id="dpr-work"
              icon={<FileText className="w-4 h-4" />}
              title="WORK DONE"
              count={workItems.length}
              action={
                <button
                  type="button"
                  onClick={() => {
                    if (!projectId) {
                      setError("Pick a project first before adding BOQ activities");
                      return;
                    }
                    setBoqModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-orange-700 bg-orange-50 hover:bg-orange-100 border border-orange-200 hover:border-orange-300 rounded-lg transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Activity from BOQ
                </button>
              }
            >
              {workItems.length === 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    if (!projectId) {
                      setError("Pick a project first before adding BOQ activities");
                      return;
                    }
                    setBoqModalOpen(true);
                  }}
                  className="w-full border-2 border-dashed border-orange-200 rounded-xl px-5 py-6 text-left hover:border-orange-400 hover:bg-orange-50/40 transition-colors flex items-center gap-4 group"
                >
                  <div className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-orange-100 text-orange-600 ring-4 ring-orange-50/60 shrink-0 group-hover:scale-105 transition-transform">
                    <Plus className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-slate-800">
                      Click to add activities from BOQ
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Select items from the Bill of Quantities to report progress
                    </p>
                  </div>
                  <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-orange-50 text-orange-700 text-[11px] font-bold border border-orange-200">
                    <Plus className="w-3 h-3" /> Add Activity
                  </span>
                </button>
              ) : (
                <div className="border border-gray-200 rounded-xl overflow-x-auto">
                  <table className="w-full text-sm min-w-[1340px]">
                    <thead className="bg-gray-50 border-b border-gray-200 text-[10px] uppercase font-bold text-gray-500">
                      <tr>
                        <th className="px-3 py-2 text-left w-[80px]">BOQ Ref</th>
                        <th className="px-3 py-2 text-left min-w-[220px]">Description</th>
                        <th className="px-3 py-2 text-left w-[60px]">Unit</th>
                        <th className="px-3 py-2 text-right w-[110px]">Total Target</th>
                        <th className="px-3 py-2 text-left w-[140px]">Contractor / WO</th>
                        <th className="px-3 py-2 text-right w-[100px]">Prev. Qty</th>
                        <th className="px-3 py-2 text-right w-[110px]">Today&apos;s Qty</th>
                        <th className="px-3 py-2 text-right w-[110px]">Total Till Date</th>
                        <th className="px-3 py-2 text-left w-[140px]">% Completed</th>
                        <th className="px-3 py-2 text-left w-[140px]">Location / Chainage</th>
                        <th className="px-3 py-2 text-left w-[140px]">Remarks</th>
                        <th className="px-3 py-2 text-center w-[140px]">Images</th>
                        <th className="px-3 py-2 w-[40px]"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {workItems.map((w, idx) => {
                        const todayNum = parseFloat(w.todayQty) || 0;
                        const totalTillDate = w.prevQty + todayNum;
                        const pct =
                          w.totalTarget > 0
                            ? Math.min(100, (totalTillDate / w.totalTarget) * 100)
                            : 0;
                        return (
                          <tr key={`${w.boqItemId}-${idx}`}>
                            <td className="px-3 py-2 font-mono text-xs text-orange-700 font-bold">
                              {w.boqNo}
                            </td>
                            <td className="px-3 py-2 text-xs text-gray-900">
                              <div className="truncate max-w-[260px]" title={w.description}>
                                {w.description}
                              </div>
                            </td>
                            <td className="px-3 py-2 text-xs text-gray-600 uppercase">
                              {w.unit}
                            </td>
                            <td className="px-3 py-2 text-right text-xs text-gray-700 tabular-nums">
                              {w.totalTarget.toLocaleString("en-IN", {
                                maximumFractionDigits: 2,
                              })}
                            </td>
                            <td className="px-3 py-2">
                              <SelectInput
                                value={w.contractorWO}
                                onChange={(v) => updateWorkItem(idx, "contractorWO", v)}
                                placeholder="Self Work"
                                options={projectWorkOrders.map((wo: any) => ({
                                  value: wo.id,
                                  label: `${wo.woNumber}${wo.contractorName ? ` — ${wo.contractorName}` : ""}`,
                                }))}
                              />
                            </td>
                            <td className="px-3 py-2 text-right text-xs text-gray-600 tabular-nums">
                              {w.prevQty.toLocaleString("en-IN", {
                                maximumFractionDigits: 2,
                              })}
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                max={w.balanceQty}
                                value={w.todayQty}
                                onChange={(e) =>
                                  updateWorkItem(idx, "todayQty", e.target.value)
                                }
                                className="w-full text-xs px-2 py-1.5 border border-gray-300 rounded text-right focus:outline-none focus:ring-1 focus:ring-orange-300 focus:border-orange-400"
                                placeholder="0.00"
                              />
                            </td>
                            <td className="px-3 py-2 text-right text-xs font-semibold text-orange-700 tabular-nums">
                              {totalTillDate.toLocaleString("en-IN", {
                                maximumFractionDigits: 2,
                              })}
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                                  <div
                                    className="h-full bg-green-500 rounded-full"
                                    style={{ width: `${pct}%` }}
                                  />
                                </div>
                                <span className="text-[10px] font-semibold text-gray-600 tabular-nums w-9 text-right">
                                  {pct.toFixed(1)}%
                                </span>
                              </div>
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="text"
                                value={w.location}
                                onChange={(e) =>
                                  updateWorkItem(idx, "location", e.target.value)
                                }
                                className="w-full text-xs px-2 py-1.5 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-orange-300 focus:border-orange-400"
                                placeholder="e.g. CH 100-200"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="text"
                                value={w.remarks}
                                onChange={(e) =>
                                  updateWorkItem(idx, "remarks", e.target.value)
                                }
                                className="w-full text-xs px-2 py-1.5 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-orange-300 focus:border-orange-400"
                                placeholder="Optional notes"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                {w.images.length > 0 ? (
                                  // Show only the first photo as a thumbnail; if there
                                  // are more, overlay a "+N" badge that opens the full
                                  // gallery in a modal.
                                  <button
                                    type="button"
                                    onClick={() => setGalleryIdx(idx)}
                                    className="relative w-12 h-12 rounded-md overflow-hidden border border-gray-200 bg-gray-50 hover:ring-2 hover:ring-orange-300 transition-shadow"
                                    title={`View ${w.images.length} photo${w.images.length === 1 ? "" : "s"}`}
                                  >
                                    <img
                                      src={w.images[0]}
                                      alt="Photo 1"
                                      className="w-full h-full object-cover"
                                    />
                                    {w.images.length > 1 && (
                                      <span className="absolute inset-0 bg-black/55 text-white text-[11px] font-bold flex items-center justify-center">
                                        +{w.images.length - 1}
                                      </span>
                                    )}
                                  </button>
                                ) : null}
                                <label
                                  className="inline-flex flex-col items-center justify-center w-12 h-12 rounded-md border border-dashed border-gray-300 text-gray-500 hover:border-orange-400 hover:text-orange-600 hover:bg-orange-50/40 cursor-pointer transition-colors shrink-0"
                                  title="Upload photo (click or drag image here)"
                                  onDragOver={(e) => {
                                    e.preventDefault();
                                    e.currentTarget.classList.add(
                                      "border-orange-400",
                                      "text-orange-600",
                                      "bg-orange-50/60",
                                    );
                                  }}
                                  onDragLeave={(e) => {
                                    e.currentTarget.classList.remove(
                                      "border-orange-400",
                                      "text-orange-600",
                                      "bg-orange-50/60",
                                    );
                                  }}
                                  onDrop={(e) => {
                                    e.preventDefault();
                                    e.currentTarget.classList.remove(
                                      "border-orange-400",
                                      "text-orange-600",
                                      "bg-orange-50/60",
                                    );
                                    if (e.dataTransfer.files?.length) {
                                      addWorkItemImages(idx, e.dataTransfer.files);
                                    }
                                  }}
                                >
                                  <ImageIcon className="w-4 h-4" />
                                  <span className="text-[8px] font-semibold uppercase tracking-wider mt-0.5">Add</span>
                                  <input
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    className="hidden"
                                    onChange={(e) => {
                                      addWorkItemImages(idx, e.target.files);
                                      e.target.value = "";
                                    }}
                                  />
                                </label>
                              </div>
                            </td>
                            <td className="px-3 py-2 text-right">
                              <button
                                type="button"
                                onClick={() => removeWorkItem(idx)}
                                className="text-gray-400 hover:text-red-600"
                                title="Remove"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>

            {/* ── MATERIALS ── */}
            <Section
              id="dpr-materials"
              icon={<Package className="w-4 h-4" />}
              title="MATERIALS"
              count={materials.length}
              action={
                <button
                  type="button"
                  onClick={addMaterial}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-orange-700 bg-orange-50 hover:bg-orange-100 border border-orange-200 hover:border-orange-300 rounded-lg transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Add
                </button>
              }
            >
              {materials.length === 0 ? (
                <EmptyHint
                  text="No materials recorded yet."
                  icon={<Package className="w-4 h-4" />}
                  onAdd={addMaterial}
                  addLabel="Add a material"
                />
              ) : (
                <div className="border border-gray-200 rounded-xl overflow-x-auto">
                  <table className="w-full text-xs min-w-[1280px]">
                    <thead className="bg-gray-50 border-b border-gray-200 text-[10px] uppercase font-bold text-gray-500">
                      <tr>
                        <th className="px-2 py-2 text-left min-w-[200px]">Material Name</th>
                        <th className="px-2 py-2 text-left w-[70px]">Unit</th>
                        <th className="px-2 py-2 text-right w-[100px]">Total Tender</th>
                        <th className="px-2 py-2 text-right w-[100px]">Prev. Rcvd</th>
                        <th className="px-2 py-2 text-right w-[100px]">Today Rcvd</th>
                        <th className="px-2 py-2 text-right w-[100px]">Total Rcvd</th>
                        <th className="px-2 py-2 text-right w-[100px]">Prev. Used</th>
                        <th className="px-2 py-2 text-right w-[100px]">Today Used</th>
                        <th className="px-2 py-2 text-right w-[100px]">Total Used</th>
                        <th className="px-2 py-2 text-right w-[110px]">Balance Site</th>
                        <th className="px-2 py-2 text-right w-[110px]">Bal. Procure</th>
                        <th className="w-[40px]"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {materials.map((m, idx) => {
                        const tender = parseFloat(m.totalTender) || 0;
                        const prevR = parseFloat(m.prevReceived) || 0;
                        const todayR = parseFloat(m.todayReceived) || 0;
                        const totalR = prevR + todayR;
                        const prevU = parseFloat(m.prevUsed) || 0;
                        const todayU = parseFloat(m.todayUsed) || 0;
                        const totalU = prevU + todayU;
                        const balSite = totalR - totalU;
                        const balProcure = Math.max(tender - totalR, 0);
                        return (
                          <tr key={idx}>
                            <td className="px-2 py-1.5 min-w-[180px]">
                              <GroupedMaterialSelect
                                value={m.itemId}
                                onChange={(v) => updateMaterial(idx, "itemId", v)}
                                items={items}
                                groups={itemGroups.map((g) => ({
                                  id: g.id,
                                  name: g.name,
                                  status: g.status,
                                }))}
                                placeholder="Material"
                                size="sm"
                              />
                            </td>
                            <td className="px-2 py-1.5 text-gray-600 uppercase">
                              {m.uomCode || "—"}
                            </td>
                            <NumCell
                              value={m.totalTender}
                              onChange={(v) => updateMaterial(idx, "totalTender", v)}
                            />
                            <NumCell
                              value={m.prevReceived}
                              onChange={(v) => updateMaterial(idx, "prevReceived", v)}
                            />
                            <NumCell
                              value={m.todayReceived}
                              onChange={(v) => updateMaterial(idx, "todayReceived", v)}
                            />
                            <td className="px-2 py-1.5 text-right text-gray-900 font-semibold tabular-nums">
                              {totalR.toLocaleString("en-IN")}
                            </td>
                            <NumCell
                              value={m.prevUsed}
                              onChange={(v) => updateMaterial(idx, "prevUsed", v)}
                            />
                            <NumCell
                              value={m.todayUsed}
                              onChange={(v) => updateMaterial(idx, "todayUsed", v)}
                            />
                            <td className="px-2 py-1.5 text-right text-gray-900 font-semibold tabular-nums">
                              {totalU.toLocaleString("en-IN")}
                            </td>
                            <td className="px-2 py-1.5 text-right text-gray-900 font-semibold tabular-nums">
                              {balSite.toLocaleString("en-IN")}
                            </td>
                            <td className="px-2 py-1.5 text-right text-gray-900 font-semibold tabular-nums">
                              {balProcure.toLocaleString("en-IN")}
                            </td>
                            <td className="px-2 py-1.5 text-right">
                              <button
                                onClick={() => removeMaterial(idx)}
                                className="text-gray-400 hover:text-red-600"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>

            {/* ── MANPOWER DEPLOYED ── */}
            <Section
              id="dpr-manpower"
              icon={<Users className="w-4 h-4" />}
              title="MANPOWER DEPLOYED"
              count={manpower.length}
              action={
                <button
                  type="button"
                  onClick={addManpower}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-orange-700 bg-orange-50 hover:bg-orange-100 border border-orange-200 hover:border-orange-300 rounded-lg transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Add
                </button>
              }
            >
              {manpower.length === 0 ? (
                <EmptyHint
                  text="No manpower recorded yet."
                  icon={<Users className="w-4 h-4" />}
                  onAdd={addManpower}
                  addLabel="Add a contractor"
                />
              ) : (
                <div className="border border-gray-200 rounded-xl overflow-x-auto">
                  <table className="w-full text-xs min-w-[1320px]">
                    <thead className="bg-gray-50 border-b border-gray-200 text-[10px] uppercase font-bold text-gray-500">
                      <tr>
                        <th className="px-2 py-2 text-left w-[180px]">Contractor</th>
                        <th className="px-2 py-2 text-left w-[150px]">Working Area</th>
                        <th className="px-2 py-2 text-right w-[80px]">Messan</th>
                        <th className="px-2 py-2 text-right w-[80px]">Male H.</th>
                        <th className="px-2 py-2 text-right w-[80px]">Female H.</th>
                        <th className="px-2 py-2 text-right w-[80px]">Carp.</th>
                        <th className="px-2 py-2 text-right w-[80px]">Fitter</th>
                        <th className="px-2 py-2 text-right w-[80px]">Painter</th>
                        <th className="px-2 py-2 text-right w-[80px]">Plumber</th>
                        <th className="px-2 py-2 text-right w-[80px]">Elec.</th>
                        <th className="px-2 py-2 text-right w-[90px]">Operator</th>
                        <th className="px-2 py-2 text-right w-[80px]">Total</th>
                        <th className="w-[40px]"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {manpower.map((m, idx) => (
                        <tr key={idx}>
                          <td className="px-2 py-1.5">
                            <SelectInput
                              value={m.contractorId}
                              onChange={(v) => updateManpower(idx, "contractorId", v)}
                              placeholder="Select Contractor…"
                              options={contractors.map((c) => ({ value: c.id, label: c.name }))}
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              value={m.workingArea}
                              onChange={(e) =>
                                updateManpower(idx, "workingArea", e.target.value)
                              }
                              placeholder="Area"
                              className="w-full text-xs px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-orange-300 focus:border-orange-400"
                            />
                          </td>
                          <NumCell value={m.messan} onChange={(v) => updateManpower(idx, "messan", v)} />
                          <NumCell value={m.maleHelper} onChange={(v) => updateManpower(idx, "maleHelper", v)} />
                          <NumCell value={m.femaleHelper} onChange={(v) => updateManpower(idx, "femaleHelper", v)} />
                          <NumCell value={m.carpenter} onChange={(v) => updateManpower(idx, "carpenter", v)} />
                          <NumCell value={m.fitter} onChange={(v) => updateManpower(idx, "fitter", v)} />
                          <NumCell value={m.painter} onChange={(v) => updateManpower(idx, "painter", v)} />
                          <NumCell value={m.plumber} onChange={(v) => updateManpower(idx, "plumber", v)} />
                          <NumCell value={m.electrician} onChange={(v) => updateManpower(idx, "electrician", v)} />
                          <NumCell value={m.operator} onChange={(v) => updateManpower(idx, "operator", v)} />
                          <td className="px-2 py-1.5 text-right text-orange-700 font-bold tabular-nums">
                            {manpowerTotal(m) || 0}
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            <button onClick={() => removeManpower(idx)} className="text-gray-400 hover:text-red-600">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>

            {/* ── STAFF DEPLOYED ── */}
            <Section
              id="dpr-staff"
              icon={<Users className="w-4 h-4" />}
              title="STAFF DEPLOYED"
              count={staff.length}
              action={
                <button
                  type="button"
                  onClick={addStaff}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-orange-700 bg-orange-50 hover:bg-orange-100 border border-orange-200 hover:border-orange-300 rounded-lg transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Add
                </button>
              }
            >
              {staff.length === 0 ? (
                <EmptyHint
                  text="No staff recorded yet."
                  icon={<Users className="w-4 h-4" />}
                  onAdd={addStaff}
                  addLabel="Add a staff member"
                />
              ) : (
                <div className="border border-gray-200 rounded-xl overflow-x-auto">
                  <table className="w-full text-sm min-w-[860px]">
                    <thead className="bg-gray-50 border-b border-gray-200 text-[10px] uppercase font-bold text-gray-500">
                      <tr>
                        <th className="px-3 py-2 text-left">Name</th>
                        <th className="px-3 py-2 text-left">Designation</th>
                        <th className="px-3 py-2 text-center w-[90px]">Present</th>
                        <th className="px-3 py-2 text-left">Reason (if absent)</th>
                        <th className="px-3 py-2 w-[40px]"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {staff.map((s, idx) => (
                        <tr key={idx}>
                          <td className="px-3 py-2">
                            <input
                              value={s.name}
                              onChange={(e) => updateStaff(idx, "name", e.target.value)}
                              placeholder="Name"
                              className="w-full text-xs px-2 py-1.5 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-orange-300 focus:border-orange-400"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              value={s.designation}
                              onChange={(e) => updateStaff(idx, "designation", e.target.value)}
                              placeholder="Designation"
                              className="w-full text-xs px-2 py-1.5 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-orange-300 focus:border-orange-400"
                            />
                          </td>
                          <td className="px-3 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={s.present}
                              onChange={(e) => updateStaff(idx, "present", e.target.checked)}
                              className="w-4 h-4 rounded border-slate-300 accent-orange-600 text-orange-600 focus:ring-orange-300 focus:border-orange-400"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              value={s.reason}
                              disabled={s.present}
                              onChange={(e) => updateStaff(idx, "reason", e.target.value)}
                              placeholder={s.present ? "—" : "Reason"}
                              className="w-full text-xs px-2 py-1.5 border border-gray-300 rounded disabled:bg-gray-50 disabled:text-gray-400 focus:outline-none focus:ring-1 focus:ring-orange-300 focus:border-orange-400"
                            />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button onClick={() => removeStaff(idx)} className="text-gray-400 hover:text-red-600">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>

            {/* ── MACHINERY DEPLOYED ── */}
            <Section
              id="dpr-machinery"
              icon={<Truck className="w-4 h-4" />}
              title="MACHINERY DEPLOYED"
              count={machinery.length}
              action={
                <button
                  type="button"
                  onClick={addMachinery}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-orange-700 bg-orange-50 hover:bg-orange-100 border border-orange-200 hover:border-orange-300 rounded-lg transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Add
                </button>
              }
            >
              {machinery.length === 0 ? (
                <EmptyHint
                  text="No machinery recorded yet."
                  icon={<Truck className="w-4 h-4" />}
                  onAdd={addMachinery}
                  addLabel="Add machinery"
                />
              ) : (
                <div className="border border-gray-200 rounded-xl overflow-x-auto">
                  <table className="w-full text-sm min-w-[960px]">
                    <thead className="bg-gray-50 border-b border-gray-200 text-[10px] uppercase font-bold text-gray-500">
                      <tr>
                        <th className="px-3 py-2 text-left">Description</th>
                        <th className="px-3 py-2 text-left w-[130px]">Condition</th>
                        <th className="px-3 py-2 text-right w-[110px]">Required Qty</th>
                        <th className="px-3 py-2 text-right w-[110px]">Actual Qty</th>
                        <th className="px-3 py-2 text-left">Remarks</th>
                        <th className="px-3 py-2 w-[40px]"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {machinery.map((m, idx) => (
                        <tr key={idx}>
                          <td className="px-3 py-2">
                            <input
                              value={m.description}
                              onChange={(e) => updateMachinery(idx, "description", e.target.value)}
                              placeholder="e.g. JCB"
                              className="w-full text-xs px-2 py-1.5 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-orange-300 focus:border-orange-400"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <SelectInput
                              value={m.condition}
                              onChange={(v) => updateMachinery(idx, "condition", v)}
                              options={[
                                { value: "Running", label: "Running" },
                                { value: "Idle", label: "Idle" },
                                { value: "Breakdown", label: "Breakdown" },
                                { value: "Under Repair", label: "Under Repair" },
                              ]}
                            />
                          </td>
                          <NumCell value={m.requiredQty} onChange={(v) => updateMachinery(idx, "requiredQty", v)} />
                          <NumCell value={m.actualQty} onChange={(v) => updateMachinery(idx, "actualQty", v)} />
                          <td className="px-3 py-2">
                            <input
                              value={m.remarks}
                              onChange={(e) => updateMachinery(idx, "remarks", e.target.value)}
                              placeholder="Remarks"
                              className="w-full text-xs px-2 py-1.5 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-orange-300 focus:border-orange-400"
                            />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button onClick={() => removeMachinery(idx)} className="text-gray-400 hover:text-red-600">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>
          </div>

          {/* Sticky action footer — anchored to the bottom of the scroll
              container (the drawer body in embedded mode, the page in full-
              page mode) so the user always has access to Save / Submit
              regardless of how far they've scrolled. The top shadow makes
              clear that content scrolls beneath it. */}
          <div className="sticky bottom-0 z-10 flex items-center gap-3 px-6 py-3 bg-white border-t border-slate-200 shadow-[0_-8px_16px_-10px_rgba(15,23,42,0.18)]">
            {/* Left side — live summary so the user can see at a glance how
                much they've captured. Replaces the previously dead
                "Copy Previous" button (kept available via the title-bar
                Copy Previous control when wired up). */}
            <div className="flex-1 min-w-0 flex items-center gap-2 text-[11px] text-slate-500 truncate">
              {(() => {
                const counts: Array<[string, number]> = [
                  ["activities", workItems.length],
                  ["materials", materials.length],
                  ["manpower", manpower.length],
                  ["staff", staff.length],
                  ["machinery", machinery.length],
                ];
                const filled = counts.filter(([, n]) => n > 0);
                if (filled.length === 0) {
                  return (
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-block w-1.5 h-1.5 rounded-full bg-slate-300" />
                      Nothing captured yet — add at least one activity to submit.
                    </span>
                  );
                }
                return (
                  <span className="inline-flex items-center gap-2 flex-wrap">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    {filled.map(([label, n], i) => (
                      <span key={label} className="inline-flex items-center gap-1">
                        <span className="font-bold text-slate-700 tabular-nums">{n}</span>
                        <span>{label}</span>
                        {i < filled.length - 1 && (
                          <span className="text-slate-300 mx-0.5">·</span>
                        )}
                      </span>
                    ))}
                  </span>
                );
              })()}
            </div>

            <button
              type="button"
              onClick={() => handleSave("draft")}
              disabled={saving !== null}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-300 hover:border-orange-300 hover:text-orange-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {saving === "draft" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              Save Draft
            </button>
            <button
              type="button"
              onClick={() => handleSave("submit")}
              disabled={saving !== null}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-gradient-to-b from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed shadow-brand active:translate-y-[1px] transition-all"
            >
              {saving === "submit" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
              {isEdit ? "Save & Submit" : "Submit Report"}
            </button>
          </div>
        </div>
      </div>

      {/* BOQ picker modal — reused from the Work Order flow */}
      <BOQActivityPickerModal
        open={boqModalOpen}
        onClose={() => setBoqModalOpen(false)}
        projectId={projectId}
        alreadyAddedIds={alreadyAddedBoqIds}
        onAdd={addWorkItemFromBoq}
        confirmLabel="Add to DPR"
        duplicateMessage="This BOQ item is already in today's DPR — pick a different BOQ row."
      />

      {/* Photo gallery modal — opened from the Images cell when a row has
          one or more photos. Lets the user preview, click through to full
          size, remove individual images, and add more. */}
      {galleryIdx !== null && workItems[galleryIdx] && (
        <PhotoGalleryModal
          item={workItems[galleryIdx]}
          onClose={() => setGalleryIdx(null)}
          onRemove={(j) => {
            removeWorkItemImage(galleryIdx, j);
            // If the user removed the last photo, close the modal.
            if (workItems[galleryIdx].images.length <= 1) setGalleryIdx(null);
          }}
          onAdd={(files) => addWorkItemImages(galleryIdx, files)}
        />
      )}
    </>
  );
}

function PhotoGalleryModal({
  item,
  onClose,
  onRemove,
  onAdd,
}: {
  item: WorkItem;
  onClose: () => void;
  onRemove: (j: number) => void;
  onAdd: (files: FileList | null) => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-orange-600">
              Site Photos
            </div>
            <div className="text-sm font-semibold text-gray-900 truncate">
              {item.boqNo} — {item.description}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">
              {item.images.length} photo{item.images.length === 1 ? "" : "s"}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-gray-100 text-gray-500 hover:text-gray-700 flex items-center justify-center transition-colors shrink-0"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {item.images.map((src, j) => (
              <div
                key={j}
                className="relative aspect-square rounded-lg overflow-hidden border border-gray-200 bg-gray-50 group"
              >
                <a
                  href={src}
                  target="_blank"
                  rel="noreferrer"
                  className="block w-full h-full"
                  title="Open full size"
                >
                  <img
                    src={src}
                    alt={`Photo ${j + 1}`}
                    className="w-full h-full object-cover"
                  />
                </a>
                <button
                  type="button"
                  onClick={() => onRemove(j)}
                  className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-rose-600 text-white opacity-0 group-hover:opacity-100 flex items-center justify-center shadow ring-2 ring-white transition-opacity"
                  title="Remove photo"
                >
                  <X className="w-3 h-3" strokeWidth={3} />
                </button>
                <div className="absolute bottom-1 left-1 text-[10px] font-semibold text-white bg-black/55 px-1.5 py-0.5 rounded">
                  {j + 1}
                </div>
              </div>
            ))}

            <label
              className="aspect-square rounded-lg border-2 border-dashed border-gray-300 text-gray-500 hover:border-orange-400 hover:text-orange-600 hover:bg-orange-50/40 cursor-pointer transition-colors flex flex-col items-center justify-center gap-1"
              title="Upload more photos (click or drag images here)"
              onDragOver={(e) => {
                e.preventDefault();
                e.currentTarget.classList.add(
                  "border-orange-400",
                  "text-orange-600",
                  "bg-orange-50/60",
                );
              }}
              onDragLeave={(e) => {
                e.currentTarget.classList.remove(
                  "border-orange-400",
                  "text-orange-600",
                  "bg-orange-50/60",
                );
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.currentTarget.classList.remove(
                  "border-orange-400",
                  "text-orange-600",
                  "bg-orange-50/60",
                );
                if (e.dataTransfer.files?.length) {
                  onAdd(e.dataTransfer.files);
                }
              }}
            >
              <Plus className="w-5 h-5" />
              <span className="text-[10px] font-semibold uppercase tracking-wider">
                Add Photo
              </span>
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  onAdd(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="text-sm font-medium text-gray-700 hover:text-gray-900 px-4 py-1.5 rounded-lg hover:bg-white border border-gray-200 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({
  id,
  icon,
  title,
  count,
  action,
  children,
  defaultOpen,
}: {
  id?: string;
  icon: React.ReactNode;
  title: string;
  /** When provided, shows a count chip in the header. > 0 also flips the
   *  icon to a green check so users can see at a glance which sections
   *  have content. */
  count?: number;
  action?: React.ReactNode;
  children: React.ReactNode;
  /**
   * Initial open state. When omitted, sections start collapsed unless
   * they already have data (count > 0) — that way a fresh DPR opens
   * with every section closed (user clicks the one they want), but in
   * edit mode the populated sections auto-expand so the existing data
   * is visible without extra clicks.
   */
  defaultOpen?: boolean;
}) {
  const hasData = (count ?? 0) > 0;
  const [open, setOpen] = useState(defaultOpen ?? hasData);
  const showCount = typeof count === "number";

  // Auto-open the section whenever the SectionNav fires a request for
  // it. Clicking a SectionNav pill both scrolls AND emits this custom
  // event so the target section expands immediately — without this the
  // user lands on a collapsed header and has to click a second time.
  // (hashchange-based listening was tried first but doesn't fire when
  // the user re-clicks the same pill, so a custom event is more robust.)
  useEffect(() => {
    if (!id) return;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string }>).detail;
      if (detail?.id === id) setOpen(true);
    };
    window.addEventListener("dpr:section-open", handler as EventListener);
    return () =>
      window.removeEventListener("dpr:section-open", handler as EventListener);
  }, [id]);

  return (
    <section
      id={id}
      className={`scroll-mt-24 rounded-xl border bg-white overflow-hidden transition-colors ${
        hasData
          ? "border-emerald-200/70 shadow-[0_1px_0_0_rgba(16,185,129,0.08)]"
          : "border-slate-200"
      }`}
    >
      <header
        className={`flex items-center gap-3 px-4 py-3 border-b ${
          hasData ? "bg-emerald-50/30 border-emerald-100" : "bg-slate-50/60 border-slate-100"
        }`}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex items-center gap-2.5 flex-1 min-w-0 text-left rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-300"
        >
          <span
            className={`inline-flex items-center justify-center w-8 h-8 rounded-lg ring-1 transition-colors shrink-0 ${
              hasData
                ? "bg-emerald-100 text-emerald-700 ring-emerald-200"
                : "bg-orange-50 text-orange-600 ring-orange-100"
            }`}
          >
            {hasData ? <CheckCircle2 className="w-4 h-4" /> : icon}
          </span>
          <span className="flex items-center gap-2 min-w-0">
            <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
              {title}
            </span>
            {showCount && count! > 0 && (
              <span
                className={`inline-flex items-center px-1.5 h-[18px] rounded-full text-[10px] font-bold tabular-nums ${
                  hasData
                    ? "bg-emerald-600 text-white"
                    : "bg-slate-100 text-slate-600"
                }`}
              >
                {count}
              </span>
            )}
          </span>
          <ChevronDown
            className={`ml-auto w-4 h-4 text-slate-400 transition-transform shrink-0 ${
              open ? "rotate-180" : ""
            }`}
          />
        </button>
        {action && (
          <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
            {action}
          </div>
        )}
      </header>
      <div
        className={`overflow-hidden transition-[grid-template-rows] grid ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        {/* `min-h-0 min-w-0` is load-bearing — grid items default to
            `min-width: auto`, which lets wide children (e.g. the
            min-w-[1340px] Work Done table) push the grid wider than the
            section itself, breaking any inner `overflow-x-auto`. Pinning
            min-width to 0 lets the descendant scroll container do its job. */}
        <div className="min-h-0 min-w-0">
          <div className="p-4">{children}</div>
        </div>
      </div>
    </section>
  );
}

/**
 * SectionNav — sticky pill row showing all DPR sections with their item
 * counts. Acts as a quick-jump table of contents so users can see at a
 * glance which sections have content and skip directly to the one they
 * want to fill in next.
 */
function SectionNav({
  items,
}: {
  items: Array<{
    id: string;
    label: string;
    icon: React.ReactNode;
    count: number;
  }>;
}) {
  return (
    <div className="pl-6 pr-14 py-3 bg-slate-50/60 border-b border-slate-200">
      <div className="flex items-center gap-2 overflow-x-auto">
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider shrink-0 mr-1">
          Sections
        </span>
        {items.map((s) => {
          const filled = s.count > 0;
          return (
            <a
              key={s.id}
              href={`#${s.id}`}
              onClick={(e) => {
                // Take over from the browser so we can guarantee both
                // (a) the target section expands — emit the custom event
                //     the Section component listens for; and
                // (b) it scrolls into view smoothly. The native anchor
                //     would scroll but wouldn't expand a collapsed
                //     section, leaving the user staring at just a
                //     header.
                e.preventDefault();
                window.dispatchEvent(
                  new CustomEvent("dpr:section-open", { detail: { id: s.id } }),
                );
                document
                  .getElementById(s.id)
                  ?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              className={`group inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold whitespace-nowrap transition-colors ${
                filled
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:border-emerald-300"
                  : "border-slate-200 bg-white text-slate-600 hover:border-orange-300 hover:text-orange-700"
              }`}
            >
              <span
                className={`inline-flex items-center justify-center w-4 h-4 rounded-full ${
                  filled ? "text-emerald-600" : "text-slate-400 group-hover:text-orange-600"
                }`}
              >
                {filled ? <CheckCircle2 className="w-3.5 h-3.5" /> : s.icon}
              </span>
              <span>{s.label}</span>
              {filled && (
                <span className="inline-flex items-center justify-center min-w-[16px] h-[16px] px-1 rounded-full bg-emerald-600 text-white text-[9px] font-bold tabular-nums">
                  {s.count}
                </span>
              )}
            </a>
          );
        })}
      </div>
    </div>
  );
}

function EmptyHint({
  text,
  icon,
  onAdd,
  addLabel = "Add the first row",
}: {
  text: string;
  icon?: React.ReactNode;
  onAdd?: () => void;
  addLabel?: string;
}) {
  // Slim, single-line empty state. The whole row is the CTA: clicking
  // anywhere inside calls onAdd, so the empty state stops being passive
  // decoration and becomes the primary action when a section is empty.
  // Used by Materials / Manpower / Staff / Machinery — secondary sections
  // that should stay visually quieter than the larger Work-Done empty state.
  const Tag: any = onAdd ? "button" : "div";
  return (
    <Tag
      type={onAdd ? "button" : undefined}
      onClick={onAdd}
      className={`group w-full flex items-center gap-3 px-4 py-3 rounded-lg border border-dashed border-slate-200 bg-slate-50/40 text-left transition-colors ${
        onAdd ? "hover:bg-orange-50/40 hover:border-orange-300 cursor-pointer" : ""
      }`}
    >
      {icon && (
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-white text-slate-400 ring-1 ring-slate-200 group-hover:text-orange-600 group-hover:ring-orange-200 transition-colors shrink-0">
          {icon}
        </span>
      )}
      <span className="text-xs font-semibold text-slate-600 group-hover:text-slate-800 transition-colors">
        {text}
      </span>
      {onAdd && (
        <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-orange-700 opacity-70 group-hover:opacity-100 transition-opacity">
          <Plus className="w-3 h-3" /> {addLabel}
        </span>
      )}
    </Tag>
  );
}

function NumCell({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <td className="px-2 py-1.5">
      <input
        type="number"
        step="0.01"
        min="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full text-xs px-2 py-1 border border-gray-300 rounded text-right focus:outline-none focus:ring-1 focus:ring-orange-300 focus:border-orange-400"
        placeholder="0"
      />
    </td>
  );
}
