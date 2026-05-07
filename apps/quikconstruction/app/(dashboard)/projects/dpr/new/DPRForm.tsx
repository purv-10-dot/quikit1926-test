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

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Save,
  Send,
  RefreshCw,
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
} from "lucide-react";
import { PageContainer } from "@/components/PageShell";
import { SelectInput } from "@/components/FormDrawer";
import { useProjects, useItems, useUOMs, useContractors } from "@/hooks/use-masters";
import { useWorkOrders } from "@/hooks/use-projects";
import { BOQActivityPickerModal } from "../../work-orders/new/BOQActivityPickerModal";

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
  const { data: uomsResult } = useUOMs();
  const { data: contractorsResult } = useContractors();

  const projects = projectsResult?.data ?? [];
  const items = (itemsResult?.data ?? []) as any[];
  const uoms = (uomsResult?.data ?? []) as any[];
  const contractors = (contractorsResult?.data ?? []) as any[];

  // Header state
  const [projectId, setProjectId] = useState(() => editData?.projectId ?? "");

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
  const [workHalted, setWorkHalted] = useState(!!editData?.workHalted);
  const [siteRemarks, setSiteRemarks] = useState(editData?.siteRemarks ?? "");

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

      <PageContainer>
        <div className="overflow-hidden">
          {/* Top context strip — what day, what project. Actions live in the
              sticky bottom bar so they're always reachable while scrolling. */}
          <div className="flex items-end gap-4 flex-wrap px-6 py-4 border-b border-slate-200">
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
                <input
                  type="date"
                  value={reportDate}
                  onChange={(e) => setReportDate(e.target.value)}
                  className="text-sm px-3 py-2 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-400 transition-shadow"
                />
              </div>
              <div className="min-w-[200px] flex-1">
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
          <div className="p-6 space-y-8">
            {/* ── GENERAL INFO & WEATHER ── */}
            <Section
              icon={<Cloud className="w-4 h-4" />}
              title="GENERAL INFO & WEATHER"
            >
              {/* Weather + Work Status — single row of compact horizontal pills.
                  All four pills share the same height so the row reads as one
                  unified control bar instead of mismatched cards. */}
              <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    Weather
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
                          onClick={() => setWeatherCondition(opt.key)}
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
              icon={<FileText className="w-4 h-4" />}
              title="WORK DONE"
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
                  className="w-full border-2 border-dashed border-orange-200 rounded-xl p-10 text-center hover:border-orange-400 hover:bg-orange-50/40 transition-colors"
                >
                  <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-orange-100 text-orange-600 mb-2 ring-4 ring-orange-50/60">
                    <Plus className="w-5 h-5" />
                  </div>
                  <div className="text-sm font-semibold text-gray-700">
                    Click to add activities from BOQ
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    Select items from the Bill of Quantities to report progress
                  </p>
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
                                  title="Upload photo"
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
              icon={<Package className="w-4 h-4" />}
              title="MATERIALS"
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
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 border-b border-gray-200 text-[10px] uppercase font-bold text-gray-500">
                      <tr>
                        <th className="px-2 py-2 text-left min-w-[160px]">Material Name</th>
                        <th className="px-2 py-2 text-left w-[60px]">Unit</th>
                        <th className="px-2 py-2 text-right">Total Tender</th>
                        <th className="px-2 py-2 text-right">Prev. Rcvd</th>
                        <th className="px-2 py-2 text-right">Today Rcvd</th>
                        <th className="px-2 py-2 text-right">Total Rcvd</th>
                        <th className="px-2 py-2 text-right">Prev. Used</th>
                        <th className="px-2 py-2 text-right">Today Used</th>
                        <th className="px-2 py-2 text-right">Total Used</th>
                        <th className="px-2 py-2 text-right">Balance Site</th>
                        <th className="px-2 py-2 text-right">Bal. Procure</th>
                        <th className="w-[32px]"></th>
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
                            <td className="px-2 py-1.5">
                              <SelectInput
                                value={m.itemId}
                                onChange={(v) => updateMaterial(idx, "itemId", v)}
                                placeholder="Material"
                                options={items.map((it) => ({ value: it.id, label: it.name }))}
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
              icon={<Users className="w-4 h-4" />}
              title="MANPOWER DEPLOYED"
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
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 border-b border-gray-200 text-[10px] uppercase font-bold text-gray-500">
                      <tr>
                        <th className="px-2 py-2 text-left min-w-[150px]">Contractor</th>
                        <th className="px-2 py-2 text-left min-w-[140px]">Working Area</th>
                        <th className="px-2 py-2 text-right">Messan</th>
                        <th className="px-2 py-2 text-right">Male H.</th>
                        <th className="px-2 py-2 text-right">Female H.</th>
                        <th className="px-2 py-2 text-right">Carp.</th>
                        <th className="px-2 py-2 text-right">Fitter</th>
                        <th className="px-2 py-2 text-right">Painter</th>
                        <th className="px-2 py-2 text-right">Plumber</th>
                        <th className="px-2 py-2 text-right">Elec.</th>
                        <th className="px-2 py-2 text-right">Operator</th>
                        <th className="px-2 py-2 text-right">Total</th>
                        <th className="w-[32px]"></th>
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
              icon={<Users className="w-4 h-4" />}
              title="STAFF DEPLOYED"
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
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
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
              icon={<Truck className="w-4 h-4" />}
              title="MACHINERY DEPLOYED"
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
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
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
          <div className="sticky bottom-0 z-10 flex items-center justify-end gap-2 px-6 py-3 bg-white border-t border-slate-200 shadow-[0_-6px_12px_-8px_rgba(15,23,42,0.12)]">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-orange-700 bg-white hover:bg-orange-50 border border-orange-200 hover:border-orange-300 rounded-lg disabled:opacity-50 transition-all"
              title="Copy yesterday's DPR as a starting point"
              disabled
            >
              <RefreshCw className="w-4 h-4" /> Copy Previous
            </button>
            <button
              type="button"
              onClick={() => handleSave("draft")}
              disabled={saving !== null}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-300 hover:border-orange-300 hover:text-orange-700 rounded-lg disabled:opacity-50 transition-all"
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
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-gradient-to-b from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 rounded-lg disabled:opacity-50 shadow-brand active:translate-y-[1px] transition-all"
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
      </PageContainer>

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
              title="Upload more photos"
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
  icon,
  title,
  action,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  // Clean, chrome-free section. Title sits inline with a brand-accented
  // left bar so the section still reads as a distinct block without
  // wrapping cards or background bands. Content flows directly below.
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2.5 text-[13px] font-bold text-slate-900 tracking-tight">
          <span
            aria-hidden
            className="inline-block w-1 h-5 rounded-full bg-gradient-to-b from-orange-400 to-orange-600"
          />
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-orange-50 text-orange-600 ring-1 ring-orange-100">
            {icon}
          </span>
          <span className="uppercase tracking-wider text-[11px] text-slate-500 font-bold">
            {title}
          </span>
        </h3>
        {action}
      </div>
      <div>{children}</div>
    </section>
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
