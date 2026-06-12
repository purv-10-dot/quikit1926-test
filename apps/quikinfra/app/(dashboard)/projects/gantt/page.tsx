"use client";

import { useMemo, useState } from "react";
import { GanttChart, ZoomIn, ZoomOut } from "lucide-react";
import { PageHeader, PageContainer, EmptyState } from "@/components/PageShell";
import { SelectInput } from "@/components/FormDrawer";
import { useProjects } from "@/hooks/use-masters";
import { useWorkOrders } from "@/hooks/use-projects";

// ─── Date helpers ─────────────────────────────────────────────────────
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const ROW_H = 52;
type Scale = "day" | "week" | "month";

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

// ─── Page ─────────────────────────────────────────────────────────────
export default function GanttPage() {
  const [selectedProject, setSelectedProject] = useState("");
  const [scale, setScale] = useState<Scale>("week");

  const { data: projects } = useProjects();
  const { data: result, isLoading } = useWorkOrders({
    projectId: selectedProject || undefined,
    status: "all",
  });
  const workOrders: any[] = result?.data ?? [];

  // Keep only WOs that actually have a valid date pair — otherwise the
  // time-axis math can't place them. Sort by start date so the rows read
  // chronologically. The API serialises dates as `plannedStart` /
  // `plannedEnd` (see app/api/projects/work-orders/route.ts) so we read
  // those keys; we also accept legacy `startDate` / `endDate` as a fallback
  // in case any caller still ships the raw column names.
  const visibleWOs = useMemo(() => {
    return workOrders
      .map((wo) => {
        const rawStart = wo.plannedStart ?? wo.startDate ?? null;
        const rawEnd = wo.plannedEnd ?? wo.endDate ?? null;
        if (!rawStart || !rawEnd) return null;
        const s = new Date(rawStart);
        const e = new Date(rawEnd);
        return Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())
          ? null
          : { ...wo, _start: s, _end: e };
      })
      .filter(Boolean)
      .sort((a: any, b: any) => a._start.getTime() - b._start.getTime());
  }, [workOrders]);

  return (
    <>
      <PageHeader
        title="Gantt View"
        subtitle="Planned vs actual timeline for work orders and milestones"
        breadcrumbs={[{ label: "Projects", href: "/projects" }, { label: "Gantt" }]}
      />

      {/* Toolbar — project picker on the left, zoom controls on the right.
          Always sticky-feeling on top of the chart for at-a-glance scope. */}
      <div className="px-6 py-3 border-b border-gray-200 bg-white flex items-center gap-3 flex-wrap">
        <div className="min-w-[260px] flex-1 max-w-md">
          <SelectInput
            value={selectedProject}
            onChange={setSelectedProject}
            placeholder="Select Project..."
            options={(projects?.data ?? []).map((p: any) => ({ value: p.id, label: p.name }))}
          />
        </div>
        {selectedProject && visibleWOs.length > 0 && (
          <div className="flex items-center gap-1 ml-auto">
            <ScaleButton
              active={scale === "day"}
              onClick={() => setScale("day")}
              label="Day"
            />
            <ScaleButton
              active={scale === "week"}
              onClick={() => setScale("week")}
              label="Week"
            />
            <ScaleButton
              active={scale === "month"}
              onClick={() => setScale("month")}
              label="Month"
            />
          </div>
        )}
      </div>

      <PageContainer>
        {!selectedProject ? (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm py-16">
            <EmptyState
              title="Select a project"
              description="Choose a project to view the Gantt timeline."
              icon={<GanttChart className="w-8 h-8" />}
            />
          </div>
        ) : isLoading ? (
          <div className="p-8 animate-pulse space-y-3">
            {[1, 2, 3, 4].map((i) => <div key={i} className="h-10 bg-gray-100 rounded" />)}
          </div>
        ) : visibleWOs.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm py-16">
            <EmptyState
              title="No timeline data"
              description="Create work orders with start and end dates to see the Gantt chart."
              icon={<GanttChart className="w-8 h-8" />}
            />
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <GanttBoard workOrders={visibleWOs} scale={scale} />
          </div>
        )}
      </PageContainer>
    </>
  );
}

function ScaleButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-semibold border transition-colors ${
        active
          ? "bg-orange-50 border-orange-300 text-orange-700"
          : "bg-white border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50"
      }`}
    >
      {label === "Day" ? (
        <ZoomIn className="w-3 h-3" />
      ) : label === "Month" ? (
        <ZoomOut className="w-3 h-3" />
      ) : null}
      {label}
    </button>
  );
}

// ─── Gantt chart ──────────────────────────────────────────────────────
function GanttBoard({
  workOrders,
  scale,
}: {
  workOrders: any[];
  scale: Scale;
}) {
  // Domain = earliest start to latest end, padded both sides for breathing
  // room. Enforce a minimum visible window so a single-day WO doesn't
  // render against a near-empty timeline — extend the right edge until
  // the chart has at least MIN_VISIBLE_DAYS columns.
  const MIN_VISIBLE_DAYS = 28;
  const { startDay, days } = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;
    for (const wo of workOrders) {
      const s = wo._start.getTime();
      const e = wo._end.getTime();
      if (s < min) min = s;
      if (e > max) max = e;
    }
    const start = startOfDay(new Date(min));
    const end = startOfDay(new Date(max));
    start.setDate(start.getDate() - 3);
    end.setDate(end.getDate() + 7);
    // Stretch right edge if the window is too narrow — keeps the
    // timeline from feeling cramped when there's only one short WO.
    const span = Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1;
    if (span < MIN_VISIBLE_DAYS) {
      end.setDate(end.getDate() + (MIN_VISIBLE_DAYS - span));
    }
    const out: Date[] = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      out.push(new Date(d));
    }
    return { startDay: start, days: out };
  }, [workOrders]);

  const dayWidth = scale === "day" ? 48 : scale === "week" ? 16 : 6;
  const leftPaneWidth = 280;
  const datePaneWidth = 120;
  const fixedWidth = leftPaneWidth + datePaneWidth + datePaneWidth;
  const timelineWidth = days.length * dayWidth;

  const showLabel = (d: Date, i: number) => {
    if (scale === "day") return true;
    if (scale === "week") return d.getDay() === 1 || i === 0;
    return d.getDate() === 1 || i === 0;
  };

  const todayIdx = useMemo(() => {
    const today = startOfDay(new Date());
    return days.findIndex((d) => d.getTime() === today.getTime());
  }, [days]);

  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth: fixedWidth + timelineWidth }}>
        {/* Header */}
        <div className="flex sticky top-0 bg-white border-b border-gray-200 z-10">
          <div
            className="shrink-0 px-4 py-2.5 text-xs font-semibold text-gray-700 border-r border-gray-200"
            style={{ width: leftPaneWidth }}
          >
            Work Order
          </div>
          <div
            className="shrink-0 px-4 py-2.5 text-xs font-semibold text-gray-700 border-r border-gray-200"
            style={{ width: datePaneWidth }}
          >
            Start
          </div>
          <div
            className="shrink-0 px-4 py-2.5 text-xs font-semibold text-gray-700 border-r border-gray-200"
            style={{ width: datePaneWidth }}
          >
            End
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
                  className={`shrink-0 text-center text-[11px] border-r border-gray-200 py-2.5 ${
                    isToday
                      ? "bg-orange-50 text-orange-700 font-semibold"
                      : isSat
                        ? "text-rose-500"
                        : isSun
                          ? "text-sky-500"
                          : "text-gray-500"
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
          {/* Today vertical line — full-height, dashed orange so it
              reads as a marker even when no bar crosses it. */}
          {todayIdx >= 0 && (
            <div
              className="absolute top-0 bottom-0 z-[5] pointer-events-none"
              style={{
                left:
                  leftPaneWidth +
                  datePaneWidth +
                  datePaneWidth +
                  todayIdx * dayWidth +
                  dayWidth / 2 -
                  1,
                height: workOrders.length * ROW_H,
                width: 2,
                backgroundImage:
                  "repeating-linear-gradient(180deg, rgb(251 146 60) 0 4px, transparent 4px 8px)",
              }}
            />
          )}

          {workOrders.map((wo, idx) => {
            const ts = startOfDay(wo._start);
            const te = startOfDay(wo._end);
            const offsetDays = Math.max(
              0,
              Math.round((ts.getTime() - startDay.getTime()) / DAY_MS),
            );
            const dur = Math.max(
              1,
              Math.round((te.getTime() - ts.getTime()) / DAY_MS) + 1,
            );
            const left = offsetDays * dayWidth;
            const width = Math.max(dayWidth * 0.6, dur * dayWidth - 2);
            const progress = Math.max(
              0,
              Math.min(100, Number(wo.progressPct ?? wo.progress ?? 0)),
            );

            const status = String(wo.status ?? "").toLowerCase();
            const statusTheme = {
              completed: {
                bar: "bg-emerald-500",
                fill: "bg-emerald-600",
                ring: "ring-emerald-200",
                text: "text-white",
              },
              in_progress: {
                bar: "bg-orange-400",
                fill: "bg-orange-600",
                ring: "ring-orange-200",
                text: "text-white",
              },
              on_hold: {
                bar: "bg-amber-400",
                fill: "bg-amber-600",
                ring: "ring-amber-200",
                text: "text-white",
              },
              cancelled: {
                bar: "bg-rose-300",
                fill: "bg-rose-500",
                ring: "ring-rose-200",
                text: "text-white",
              },
            }[status as "completed" | "in_progress" | "on_hold" | "cancelled"] ?? {
              // "Not started" / draft — bar is light grey; use a dark
              // text colour so the progress label stays readable
              // instead of white-on-light-grey.
              bar: "bg-gray-200",
              fill: "bg-gray-400",
              ring: "ring-gray-200",
              text: "text-gray-700",
            };

            return (
              <div
                key={wo.id ?? idx}
                className="flex items-center hover:bg-gray-50/60 border-b border-gray-100"
                style={{ height: ROW_H }}
              >
                {/* Left pane — WO label + contractor */}
                <div
                  className="shrink-0 px-4 border-r border-gray-200 flex flex-col justify-center"
                  style={{ width: leftPaneWidth }}
                >
                  <span className="text-sm font-semibold text-gray-900 truncate">
                    {wo.woNumber ?? wo.title ?? "Untitled"}
                  </span>
                  <span className="text-[11px] text-gray-500 truncate">
                    {wo.contractorName ?? wo.title ?? ""}
                  </span>
                </div>
                <div
                  className="shrink-0 px-4 border-r border-gray-200 text-xs text-gray-600 tabular-nums"
                  style={{ width: datePaneWidth }}
                >
                  {fmt(wo._start)}
                </div>
                <div
                  className="shrink-0 px-4 border-r border-gray-200 text-xs text-gray-600 tabular-nums"
                  style={{ width: datePaneWidth }}
                >
                  {fmt(wo._end)}
                </div>

                {/* Timeline pane */}
                <div className="relative" style={{ width: timelineWidth, height: ROW_H }}>
                  {/* Weekend tinted columns */}
                  <div className="absolute inset-0 flex pointer-events-none">
                    {days.map((d, i) => {
                      const dow = d.getDay();
                      const isWeekend = dow === 0 || dow === 6;
                      return (
                        <div
                          key={i}
                          className={`shrink-0 ${isWeekend ? "bg-gray-50/70" : ""}`}
                          style={{ width: dayWidth }}
                        />
                      );
                    })}
                  </div>

                  {/* Bar */}
                  <div
                    className={`absolute top-1/2 -translate-y-1/2 h-7 rounded-lg ${statusTheme.bar} ring-2 ${statusTheme.ring} shadow-sm overflow-hidden`}
                    style={{ left, width }}
                    title={`${wo.woNumber ?? wo.title} · ${progress}% · ${status || "draft"}`}
                  >
                    {/* Progress fill */}
                    <div
                      className={`absolute top-0 left-0 h-full ${statusTheme.fill}`}
                      style={{ width: `${progress}%` }}
                    />
                    {/* Label — hidden when the bar is too narrow to
                        fit the text, so "0%" doesn't get clipped on
                        single-day tasks at the smallest day-width. */}
                    {width >= 32 && (
                      <span
                        className={`absolute inset-0 flex items-center justify-center text-[10px] font-bold ${statusTheme.text} tracking-wide pointer-events-none`}
                      >
                        {progress}%
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="px-4 py-3 border-t border-gray-100 bg-gray-50/50 flex items-center gap-3 flex-wrap text-[11px]">
          <span className="text-gray-500 font-semibold uppercase tracking-wider">
            Legend
          </span>
          <LegendChip color="bg-gray-200" label="Not started" />
          <LegendChip color="bg-orange-400" label="In progress" />
          <LegendChip color="bg-amber-400" label="On hold" />
          <LegendChip color="bg-emerald-500" label="Completed" />
          <LegendChip color="bg-rose-300" label="Cancelled" />
          <span className="ml-auto inline-flex items-center gap-1.5 text-gray-600 font-medium">
            <span
              className="inline-block w-1 h-4 rounded-sm"
              style={{
                backgroundImage:
                  "repeating-linear-gradient(180deg, rgb(251 146 60) 0 3px, transparent 3px 6px)",
              }}
            />
            Today
          </span>
        </div>
      </div>
    </div>
  );
}

function LegendChip({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-gray-600">
      <span className={`w-3 h-3 rounded-sm ${color}`} />
      {label}
    </span>
  );
}

function fmt(d: Date): string {
  if (Number.isNaN(d.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())} ${MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}
