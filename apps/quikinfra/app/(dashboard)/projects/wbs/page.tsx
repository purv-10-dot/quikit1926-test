"use client";

import { useMemo, useState } from "react";
import {
  GanttChart, ListTree, LayoutGrid, Wand2, Plus, Trash2,
  ChevronDown, ChevronRight, Calendar,
} from "lucide-react";
import { PageHeader, PageContainer, EmptyState } from "@/components/PageShell";
import { Field, TextInput, NumberInput, SelectInput } from "@/components/FormDrawer";
import { useProjects } from "@/hooks/use-masters";
import { useCreateWbsTask, useDeleteWbsTask, useWbsTasks } from "@/hooks/use-wbs";
import { WbsEditTaskModal } from "@/components/WbsEditTaskModal";

type WbsStatus = "not_started" | "in_progress" | "completed" | "on_hold";

interface WbsTask {
  id: string;
  parentId: string | null;
  wbsCode: string;
  name: string;
  startDate: string;
  endDate: string;
  status: WbsStatus;
  progress: number;
  predecessors: string[];
}

const STATUS_OPTIONS: Array<{ value: WbsStatus; label: string }> = [
  { value: "not_started", label: "Not Started" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "on_hold", label: "On Hold" },
];

const STATUS_TONE: Record<WbsStatus, string> = {
  not_started: "bg-slate-50 text-slate-600 border-slate-200",
  in_progress: "bg-sky-50 text-sky-700 border-sky-200",
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  on_hold: "bg-amber-50 text-amber-700 border-amber-200",
};

const DAY_MS = 1000 * 60 * 60 * 24;
const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function fmtShort(iso: string) {
  // 02/05/2026
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function fmtLong(iso: string) {
  // Sat, 2 May 2026
  const d = new Date(iso);
  return `${WEEKDAY_SHORT[d.getDay()]}, ${d.getDate()} ${MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

function durationDays(start: string, end: string): number {
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  return Math.max(1, Math.round((e - s) / DAY_MS) + 1);
}

function nextWbsCode(tasks: WbsTask[], parentId: string | null): string {
  const siblings = tasks.filter((t) => t.parentId === parentId);
  // Use max(trailing-segment) + 1 rather than siblings.length + 1 so that
  // deleting a middle sibling (e.g. removing "2" from [1, 2, 3]) doesn't
  // produce a duplicate code on the next add. The trailing segment is the
  // part after the last dot for nested tasks, or the whole code for roots.
  const trailingNumbers = siblings
    .map((t) => {
      const seg = t.wbsCode.includes(".")
        ? t.wbsCode.slice(t.wbsCode.lastIndexOf(".") + 1)
        : t.wbsCode;
      const n = parseInt(seg, 10);
      return Number.isFinite(n) ? n : 0;
    })
    .filter((n) => n > 0);
  const next = trailingNumbers.length === 0 ? 1 : Math.max(...trailingNumbers) + 1;
  if (parentId === null) return `${next}`;
  const parent = tasks.find((t) => t.id === parentId);
  const prefix = parent ? parent.wbsCode : "";
  return `${prefix}.${next}`;
}

export default function WbsPlanningPage() {
  const { data: projects } = useProjects();
  const projectOptions = (projects?.data ?? []).map((p) => ({ value: p.id, label: p.name }));

  const [selectedProject, setSelectedProject] = useState("");
  const [view, setView] = useState<"grid" | "gantt">("gantt");
  const [scale, setScale] = useState<"day" | "week" | "month">("day");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);

  const { data: wbsRes, isLoading: isWbsLoading } = useWbsTasks(selectedProject);
  const tasks = wbsRes?.data ?? [];
  const createTask = useCreateWbsTask(selectedProject);
  const deleteTask = useDeleteWbsTask(selectedProject);

  // Form state
  const [parentId, setParentId] = useState<string>("");
  const [wbsCode, setWbsCode] = useState("");
  const [autoAssign, setAutoAssign] = useState(true);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState(todayISO());
  const [endDate, setEndDate] = useState(todayISO());
  const [status, setStatus] = useState<WbsStatus>("not_started");
  const [progress, setProgress] = useState("0");
  const [predecessors, setPredecessors] = useState<string[]>([]);

  const parentOptions = useMemo(
    () => [
      { value: "", label: "-- Root Level --" },
      ...tasks.map((t) => ({ value: t.id, label: `${t.wbsCode} - ${t.name}` })),
    ],
    [tasks],
  );

  const predecessorOptions = useMemo(
    () => tasks.map((t) => ({ value: t.id, label: `${t.wbsCode} - ${t.name}` })),
    [tasks],
  );

  const resetForm = () => {
    setParentId("");
    setWbsCode("");
    setName("");
    setStartDate(todayISO());
    setEndDate(todayISO());
    setStatus("not_started");
    setProgress("0");
    setPredecessors([]);
  };

  const canAdd = !!selectedProject && name.trim().length > 0 && (autoAssign || wbsCode.trim().length > 0);

  const handleAdd = async () => {
    if (!canAdd) return;
    const pid = parentId || null;
    const code = autoAssign ? nextWbsCode(tasks, pid) : wbsCode.trim();
    const task: WbsTask = {
      id: "",
      parentId: pid,
      wbsCode: code,
      name: name.trim(),
      startDate,
      endDate,
      status,
      progress: Math.max(0, Math.min(100, Number(progress) || 0)),
      predecessors,
    };
    await createTask.mutateAsync(task);
    resetForm();
  };

  const handleDelete = async (id: string) => {
    await deleteTask.mutateAsync(id);
  };

  const toggleCollapsed = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Sort tasks in WBS-code order so children sit beneath their parents
  const orderedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      const ap = a.wbsCode.split(".").map((n) => parseInt(n, 10) || 0);
      const bp = b.wbsCode.split(".").map((n) => parseInt(n, 10) || 0);
      const len = Math.max(ap.length, bp.length);
      for (let i = 0; i < len; i++) {
        const ai = ap[i] ?? 0;
        const bi = bp[i] ?? 0;
        if (ai !== bi) return ai - bi;
      }
      return 0;
    });
  }, [tasks]);

  // Filter out tasks whose ancestor chain is collapsed
  const visibleTasks = useMemo(() => {
    const taskById = new Map(orderedTasks.map((t) => [t.id, t]));
    return orderedTasks.filter((t) => {
      let p = t.parentId;
      while (p) {
        if (collapsed.has(p)) return false;
        const parent = taskById.get(p);
        if (!parent) break;
        p = parent.parentId;
      }
      return true;
    });
  }, [orderedTasks, collapsed]);

  const childCount = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of orderedTasks) {
      if (t.parentId) map.set(t.parentId, (map.get(t.parentId) ?? 0) + 1);
    }
    return map;
  }, [orderedTasks]);

  return (
    <>
      <PageHeader
        title="WBS & Project Planning"
        subtitle="Manage Work Breakdown Structure and Scheduling."
        breadcrumbs={[{ label: "Projects", href: "/projects" }, { label: "WBS & Planning" }]}
      />

      <div className="px-6 py-3 border-b border-slate-200 bg-white flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
            {(["day", "week", "month"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setScale(s)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  scale === s
                    ? "bg-accent-50 text-accent-700"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>

          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
            <button
              onClick={() => setView("grid")}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                view === "grid" ? "bg-accent-50 text-accent-700" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" /> Grid View
            </button>
            <button
              onClick={() => setView("gantt")}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                view === "gantt" ? "bg-accent-50 text-accent-700" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <GanttChart className="w-3.5 h-3.5" /> Gantt View
            </button>
          </div>
        </div>

        <div className="min-w-[260px]">
          <SelectInput
            value={selectedProject}
            onChange={setSelectedProject}
            placeholder="Select Project..."
            options={projectOptions}
          />
        </div>
      </div>

      <PageContainer>
        <div className="grid grid-cols-1 lg:grid-cols-[360px_minmax(0,1fr)] gap-5">
          {/* ─── Add New Task ────────────────────────────────────────── */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 self-start">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <ListTree className="w-4 h-4 text-accent-600" />
                Add New Task
              </h3>
              <button
                onClick={() => setAutoAssign((v) => !v)}
                title="Auto-generate the WBS code from the selected parent level"
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold border transition-colors ${
                  autoAssign
                    ? "bg-accent-50 border-accent-200 text-accent-700"
                    : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                }`}
              >
                <Wand2 className="w-3 h-3" />
                Auto-Assign WBS
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Parent Level">
                <SelectInput
                  value={parentId}
                  onChange={(v) => {
                    setParentId(v);
                    if (autoAssign) setWbsCode(nextWbsCode(tasks, v || null));
                  }}
                  options={parentOptions}
                />
              </Field>
              <Field label="WBS Code">
                <TextInput
                  value={autoAssign ? nextWbsCode(tasks, parentId || null) : wbsCode}
                  onChange={setWbsCode}
                  placeholder="e.g. 1.1.2"
                  disabled={autoAssign}
                />
              </Field>

              <div className="col-span-2">
                <Field label="Task Name" required>
                  <TextInput value={name} onChange={setName} placeholder="Task description" />
                </Field>
              </div>

              <Field label="Start Date">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full h-9 px-2.5 text-sm border border-slate-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-accent-200 focus:border-accent-400"
                />
              </Field>
              <Field label="End Date">
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full h-9 px-2.5 text-sm border border-slate-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-accent-200 focus:border-accent-400"
                />
              </Field>

              <Field label="Status">
                <SelectInput
                  value={status}
                  onChange={(v) => setStatus(v as WbsStatus)}
                  options={STATUS_OPTIONS}
                />
              </Field>
              <Field label="Progress (%)">
                <NumberInput value={progress} onChange={setProgress} min={0} max={100} placeholder="0" />
              </Field>

              <div className="col-span-2">
                <Field label="Predecessors (Dependencies)" hint="Hold Ctrl/Cmd to select multiple.">
                  <select
                    multiple
                    value={predecessors}
                    onChange={(e) =>
                      setPredecessors(Array.from(e.target.selectedOptions).map((o) => o.value))
                    }
                    className="w-full min-h-[80px] px-2.5 py-1.5 text-sm border border-slate-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-accent-200 focus:border-accent-400"
                  >
                    {predecessorOptions.length === 0 && <option disabled>No tasks yet</option>}
                    {predecessorOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </div>

            <button
              onClick={handleAdd}
              disabled={!canAdd}
              className="mt-4 w-full inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-lg text-sm font-semibold text-white bg-gradient-to-b from-accent-500 to-accent-600 hover:from-accent-600 hover:to-accent-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Add Task
            </button>
            {!selectedProject && (
              <p className="text-[11px] text-slate-400 mt-2 text-center">
                Select a project to start adding tasks.
              </p>
            )}
          </div>

          {/* ─── Right side: Tasks display ───────────────────────────── */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden min-h-[420px]">
            {!selectedProject ? (
              <EmptyState
                title="Select a project"
                description="Choose a project to start building its work breakdown structure."
                icon={<GanttChart className="w-8 h-8" />}
              />
            ) : isWbsLoading ? (
              <EmptyState
                title="Loading tasks…"
                description="Fetching WBS tasks from the database."
                icon={<GanttChart className="w-8 h-8" />}
              />
            ) : visibleTasks.length === 0 ? (
              <EmptyState
                title="No tasks to display"
                description="Add tasks using the form to build out your project schedule."
                icon={<ListTree className="w-8 h-8" />}
              />
            ) : view === "grid" ? (
              <GridView
                tasks={visibleTasks}
                allTasks={orderedTasks}
                childCount={childCount}
                collapsed={collapsed}
                onToggleCollapsed={toggleCollapsed}
                onDelete={handleDelete}
                onEdit={setEditingTaskId}
              />
            ) : (
              <GanttView
                tasks={visibleTasks}
                allTasks={orderedTasks}
                childCount={childCount}
                collapsed={collapsed}
                onToggleCollapsed={toggleCollapsed}
                scale={scale}
                onEdit={setEditingTaskId}
              />
            )}
          </div>
        </div>
      </PageContainer>

      <WbsEditTaskModal
        open={!!editingTaskId}
        projectId={selectedProject}
        task={orderedTasks.find((t) => t.id === editingTaskId) ?? null}
        allTasks={orderedTasks}
        onClose={() => setEditingTaskId(null)}
      />
    </>
  );
}

// ─── Grid view ────────────────────────────────────────────────────────

function GridView({
  tasks,
  allTasks,
  childCount,
  collapsed,
  onToggleCollapsed,
  onDelete,
  onEdit,
}: {
  tasks: WbsTask[];
  allTasks: WbsTask[];
  childCount: Map<string, number>;
  collapsed: Set<string>;
  onToggleCollapsed: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (id: string) => void;
}) {
  const wbsById = useMemo(() => new Map(allTasks.map((t) => [t.id, t.wbsCode])), [allTasks]);

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50/60">
            <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider w-[110px]">WBS</th>
            <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Task Name</th>
            <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider w-[90px]">Duration</th>
            <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider w-[160px]">Predecessors</th>
            <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider w-[160px]">Progress</th>
            <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider w-[120px]">Status</th>
            <th className="px-4 py-3 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wider w-[80px]">Action</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {tasks.map((t) => {
            const depth = (t.wbsCode.match(/\./g) ?? []).length;
            const hasKids = (childCount.get(t.id) ?? 0) > 0;
            const isCollapsed = collapsed.has(t.id);
            return (
              <tr
                key={t.id}
                className="hover:bg-accent-50 cursor-pointer"
                onClick={() => onEdit(t.id)}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1" style={{ paddingLeft: depth * 14 }}>
                    {hasKids ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleCollapsed(t.id);
                        }}
                        className="p-0.5 rounded hover:bg-slate-100 text-accent-600"
                      >
                        {isCollapsed ? (
                          <ChevronRight className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5" />
                        )}
                      </button>
                    ) : (
                      <span className="w-[18px]" aria-hidden />
                    )}
                    <span className="text-[12px] font-semibold text-slate-600">
                      {t.wbsCode}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <p className="text-sm font-semibold text-slate-900 hover:text-accent-700 hover:underline">
                    {t.name}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5 inline-flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-slate-400" />
                    {fmtShort(t.startDate)} - {fmtShort(t.endDate)}
                  </p>
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm text-slate-700">{durationDays(t.startDate, t.endDate)}d</span>
                </td>
                <td className="px-4 py-3">
                  {t.predecessors.length === 0 ? (
                    <span className="text-slate-400 text-sm">-</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {t.predecessors.map((pid) => (
                        <span
                          key={pid}
                          className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700 border border-slate-200"
                        >
                          {wbsById.get(pid) ?? "?"}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-slate-100 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-orange-500 to-orange-600 h-1.5 rounded-full transition-all"
                        style={{ width: `${t.progress}%` }}
                      />
                    </div>
                    <span className="text-[11px] font-semibold text-slate-600 w-8 text-right">
                      {t.progress}%
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${STATUS_TONE[t.status]}`}
                  >
                    {STATUS_OPTIONS.find((s) => s.value === t.status)?.label}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(t.id);
                    }}
                    className="p-1.5 rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                    title="Delete task"
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
  );
}

// ─── Gantt view ───────────────────────────────────────────────────────

const GANTT_ROW_H = 40;
const GANTT_BAR_H = 18;

function GanttView({
  tasks,
  allTasks,
  childCount,
  collapsed,
  onToggleCollapsed,
  scale,
  onEdit,
}: {
  tasks: WbsTask[];
  allTasks: WbsTask[];
  childCount: Map<string, number>;
  collapsed: Set<string>;
  onToggleCollapsed: (id: string) => void;
  scale: "day" | "week" | "month";
  onEdit: (id: string) => void;
}) {
  // Compute timeline domain across the *full* task set so collapsing
  // doesn't shift the calendar, then pad it to a clean range.
  const { startDay, days } = useMemo(() => {
    if (allTasks.length === 0) return { startDay: new Date(), days: [] as Date[] };
    let min = Infinity;
    let max = -Infinity;
    for (const t of allTasks) {
      const s = new Date(t.startDate).getTime();
      const e = new Date(t.endDate).getTime();
      if (s < min) min = s;
      if (e > max) max = e;
    }
    const start = new Date(min);
    start.setHours(0, 0, 0, 0);
    const end = new Date(max);
    end.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - 2);
    end.setDate(end.getDate() + 14);
    const out: Date[] = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      out.push(new Date(d));
    }
    return { startDay: start, days: out };
  }, [allTasks]);

  // Cell width in px per day, varies by scale for zoom in/out feel
  const dayWidth = scale === "day" ? 56 : scale === "week" ? 18 : 6;

  const taskCol1 = 240;
  const taskCol2 = 140;
  const taskCol3 = 140;
  const fixedWidth = taskCol1 + taskCol2 + taskCol3;
  const timelineWidth = days.length * dayWidth;

  const showLabel = (d: Date, i: number) => {
    if (scale === "day") return true;
    if (scale === "week") return d.getDay() === 1 || i === 0;
    return d.getDate() === 1 || i === 0;
  };

  // Pre-compute bar geometry for every visible task — needed by the
  // dependency-arrow SVG overlay so it can connect predecessor end
  // points to dependent start points across rows.
  const layout = useMemo(() => {
    const map = new Map<string, { rowIndex: number; left: number; right: number; top: number }>();
    tasks.forEach((t, idx) => {
      const ts = new Date(t.startDate);
      ts.setHours(0, 0, 0, 0);
      const offsetDays = Math.max(0, Math.round((ts.getTime() - startDay.getTime()) / DAY_MS));
      const dur = durationDays(t.startDate, t.endDate);
      const left = offsetDays * dayWidth;
      const width = Math.max(dayWidth * 0.6, dur * dayWidth - 2);
      map.set(t.id, {
        rowIndex: idx,
        left,
        right: left + width,
        top: idx * GANTT_ROW_H + GANTT_ROW_H / 2,
      });
    });
    return map;
  }, [tasks, startDay, dayWidth]);

  // Index of the "today" column for the vertical highlight band. -1 when
  // today falls outside the visible range.
  const todayIdx = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return days.findIndex((d) => d.getTime() === today.getTime());
  }, [days]);

  return (
    <div className="overflow-x-auto">
      <div
        className="border-t border-slate-200"
        style={{ minWidth: fixedWidth + timelineWidth }}
      >
        {/* Header */}
        <div className="flex sticky top-0 bg-white border-b border-slate-200 z-10">
          <div
            className="shrink-0 px-4 py-2.5 text-xs font-semibold text-slate-700 border-r border-slate-200 border-b border-slate-200"
            style={{ width: taskCol1 }}
          >
            Name
          </div>
          <div
            className="shrink-0 px-4 py-2.5 text-xs font-semibold text-slate-700 border-r border-slate-200 border-b border-slate-200"
            style={{ width: taskCol2 }}
          >
            From
          </div>
          <div
            className="shrink-0 px-4 py-2.5 text-xs font-semibold text-slate-700 border-r border-slate-200 border-b border-slate-200"
            style={{ width: taskCol3 }}
          >
            To
          </div>
          <div className="flex">
            {days.map((d, i) => {
              const dow = d.getDay();
              const isSat = dow === 6;
              const isSun = dow === 0;
              const isToday = i === todayIdx;
              const visible = showLabel(d, i);
              return (
                <div
                  key={i}
                  className={`shrink-0 text-center text-[11px] border-r border-slate-200 py-2.5 ${
                    isToday
                      ? "bg-orange-50 text-orange-700 font-semibold"
                      : isSat
                        ? "text-rose-500"
                        : isSun
                          ? "text-sky-500"
                          : "text-slate-500"
                  }`}
                  style={{ width: dayWidth }}
                >
                  {visible ? (
                    scale === "day" ? (
                      <span className="whitespace-nowrap">
                        {WEEKDAY_SHORT[d.getDay()]}, {d.getDate()}
                      </span>
                    ) : scale === "week" ? (
                      <span className="whitespace-nowrap">
                        {d.getDate()} {MONTH_SHORT[d.getMonth()]}
                      </span>
                    ) : (
                      <span className="whitespace-nowrap">
                        {MONTH_SHORT[d.getMonth()]} {String(d.getFullYear()).slice(-2)}
                      </span>
                    )
                  ) : (
                    <span aria-hidden>&nbsp;</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Body */}
        <div className="relative">
          {tasks.map((t) => {
            const depth = (t.wbsCode.match(/\./g) ?? []).length;
            const hasKids = (childCount.get(t.id) ?? 0) > 0;
            const isCollapsed = collapsed.has(t.id);
            const geom = layout.get(t.id)!;
            const isParent = depth === 0;

            return (
              <div
                key={t.id}
                className="flex hover:bg-slate-50/50"
                style={{ height: GANTT_ROW_H }}
              >
                {/* Name column */}
                <div
                  className="shrink-0 px-4 border-r border-slate-200 flex items-center gap-1"
                  style={{ width: taskCol1 }}
                >
                  <div
                    style={{ paddingLeft: depth * 16 }}
                    className="flex items-center gap-1 min-w-0"
                  >
                    {hasKids ? (
                      <button
                        onClick={() => onToggleCollapsed(t.id)}
                        className="p-0.5 rounded hover:bg-slate-100 text-accent-600 shrink-0"
                      >
                        {isCollapsed ? (
                          <ChevronRight className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5" />
                        )}
                      </button>
                    ) : (
                      <span className="w-[18px] shrink-0" aria-hidden />
                    )}
                    <span className="text-[11px] font-semibold text-accent-600 shrink-0">
                      {t.wbsCode}
                    </span>
                    <span className="text-sm text-slate-500 shrink-0">-</span>
                    <button
                      type="button"
                      onClick={() => onEdit(t.id)}
                      className={`text-sm truncate text-left hover:text-accent-700 hover:underline ${
                        isParent ? "font-bold text-slate-900" : "font-medium text-slate-700"
                      }`}
                      title="Edit task"
                    >
                      {t.name}
                    </button>
                  </div>
                </div>
                <div
                  className="shrink-0 px-4 border-r border-slate-200 text-xs text-slate-600 flex items-center"
                  style={{ width: taskCol2 }}
                >
                  {fmtLong(t.startDate)}
                </div>
                <div
                  className="shrink-0 px-4 border-r border-slate-200 text-xs text-slate-600 flex items-center"
                  style={{ width: taskCol3 }}
                >
                  {fmtLong(t.endDate)}
                </div>

                {/* Timeline column */}
                <div className="relative" style={{ width: timelineWidth }}>
                  {/* Day grid lines + today tint. Borders match the
                      header (slate-200) so the calendar reads as one
                      continuous grid running floor-to-ceiling. */}
                  {days.map((d, i) => {
                    const isToday = i === todayIdx;
                    return (
                      <div
                        key={i}
                        className={`absolute top-0 bottom-0 border-r border-slate-200 ${
                          isToday ? "bg-orange-50/80" : ""
                        }`}
                        style={{ left: i * dayWidth, width: dayWidth }}
                      />
                    );
                  })}

                  {/* Bar */}
                  <button
                    type="button"
                    onClick={() => onEdit(t.id)}
                    className={`absolute rounded-lg shadow-sm cursor-pointer hover:ring-2 hover:ring-orange-400 transition-shadow ${
                      isParent
                        ? "bg-gradient-to-b from-orange-400 to-orange-500 ring-1 ring-orange-300/60"
                        : "bg-gradient-to-b from-slate-200 to-slate-300 ring-1 ring-slate-300/60"
                    }`}
                    style={{
                      left: geom.left,
                      width: geom.right - geom.left,
                      top: (GANTT_ROW_H - GANTT_BAR_H) / 2,
                      height: GANTT_BAR_H,
                    }}
                    title={`${t.name} — ${t.progress}% (click to edit)`}
                  >
                    {isParent && (
                      <span className="absolute inset-0 flex items-center px-2 text-[10px] font-bold text-white truncate">
                        {t.wbsCode} - {t.name}
                      </span>
                    )}
                  </button>

                  {/* Child label rendered to the right of its bar, in orange */}
                  {!isParent && (
                    <button
                      type="button"
                      onClick={() => onEdit(t.id)}
                      className="absolute text-[11px] whitespace-nowrap hover:underline text-left"
                      style={{
                        left: geom.right + 8,
                        top: (GANTT_ROW_H - GANTT_BAR_H) / 2 + 1,
                        lineHeight: `${GANTT_BAR_H}px`,
                      }}
                      title="Edit task"
                    >
                      <span className="font-semibold text-accent-600">{t.wbsCode}</span>
                      <span className="text-slate-400 mx-1">-</span>
                      <span className="font-medium text-slate-700">{t.name}</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {/* Dependency arrows — overlay only the timeline portion.
              Two kinds of links are drawn:
                1. Explicit predecessors (task.predecessors[]) — solid slate
                2. WBS parent → child — light slate, only when the child
                   doesn't already declare its parent as a predecessor. */}
          {tasks.length > 0 && (
            <svg
              className="absolute pointer-events-none"
              style={{
                left: fixedWidth,
                top: 0,
                width: timelineWidth,
                height: tasks.length * GANTT_ROW_H,
              }}
            >
              <defs>
                <marker
                  id="wbs-arrow"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
                </marker>
                <marker
                  id="wbs-arrow-soft"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#cbd5e1" />
                </marker>
              </defs>

              {/* Build the union of explicit + implicit links, then render */}
              {(() => {
                type Link = { from: string; to: string; soft: boolean };
                const seen = new Set<string>();
                const links: Link[] = [];
                for (const t of tasks) {
                  for (const pid of t.predecessors) {
                    const k = `${pid}->${t.id}`;
                    if (seen.has(k)) continue;
                    seen.add(k);
                    links.push({ from: pid, to: t.id, soft: false });
                  }
                  if (t.parentId) {
                    const k = `${t.parentId}->${t.id}`;
                    if (!seen.has(k)) {
                      seen.add(k);
                      links.push({ from: t.parentId, to: t.id, soft: true });
                    }
                  }
                }
                return links.map(({ from, to, soft }) => {
                  const a = layout.get(from);
                  const b = layout.get(to);
                  if (!a || !b) return null;
                  const fromX = a.right;
                  const fromY = a.top;
                  const toX = b.left;
                  const toY = b.top;
                  // Route like the reference image: always "exit right",
                  // drop to the dependent row, then approach the dependent
                  // from the left and point into its start.
                  const OUT = 18; // how far we exit to the right
                  const IN = 10; // how far we stop before the dependent bar
                  const outX = fromX + OUT;
                  const spineX = Math.max(outX, toX + OUT); // ensures the vertical "spine" stays to the right of both bars
                  const entryX = Math.max(0, toX - IN);
                  // Keep the long horizontal segment ABOVE the dependent bar,
                  // then drop down right before the arrow head.
                  const ABOVE_PAD = 8;
                  const toAboveY = Math.max(0, toY - (GANTT_BAR_H / 2 + ABOVE_PAD));
                  const d = `M ${fromX} ${fromY}
                    L ${outX} ${fromY}
                    L ${spineX} ${fromY}
                    L ${spineX} ${toAboveY}
                    L ${entryX} ${toAboveY}
                    L ${entryX} ${toY}
                    L ${Math.max(0, toX - 2)} ${toY}`;
                  return (
                    <path
                      key={`${from}->${to}`}
                      d={d}
                      fill="none"
                      stroke={soft ? "#cbd5e1" : "#94a3b8"}
                      strokeWidth={1.25}
                      markerEnd={soft ? "url(#wbs-arrow-soft)" : "url(#wbs-arrow)"}
                    />
                  );
                });
              })()}
            </svg>
          )}
        </div>
      </div>
    </div>
  );
}
