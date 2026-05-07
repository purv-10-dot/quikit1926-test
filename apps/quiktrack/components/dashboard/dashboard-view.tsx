"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Star,
  Link2,
  RefreshCw,
  Edit3,
  MoreHorizontal,
  Plus,
  Check,
} from "lucide-react";
import { WidgetFrame } from "./widget-frame";
import { WidgetPicker } from "./widget-picker";
import {
  DEFAULT_DASHBOARD,
  WIDGET_META,
  type DashboardConfig,
  type WidgetConfig,
  type WidgetType,
} from "./types";
import { IntroductionWidget } from "./widgets/introduction-widget";
import { ProjectsWidget } from "./widgets/projects-widget";
import { AssignedToMeWidget } from "./widgets/assigned-to-me-widget";
import { ActivityStreamWidget } from "./widgets/activity-stream-widget";
import { StatusChartWidget } from "./widgets/status-chart-widget";

const STORAGE_PREFIX = "qt-dashboard-";

function loadConfig(id: string): DashboardConfig {
  if (typeof window === "undefined") return DEFAULT_DASHBOARD;
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${id}`);
    if (!raw) return DEFAULT_DASHBOARD;
    const parsed = JSON.parse(raw) as DashboardConfig;
    if (!parsed?.widgets) return DEFAULT_DASHBOARD;
    return parsed;
  } catch {
    return DEFAULT_DASHBOARD;
  }
}

function saveConfig(id: string, cfg: DashboardConfig) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(`${STORAGE_PREFIX}${id}`, JSON.stringify(cfg));
}

function newWidgetId(): string {
  return `w-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Configurable dashboard with two-column widget layout, edit mode, and
 * per-dashboard config persisted to localStorage. Each widget type renders
 * inside the shared `WidgetFrame` and can be added/removed in edit mode.
 */
export function DashboardView({
  dashboardId,
  title,
}: {
  dashboardId: string;
  title: string;
}) {
  const [config, setConfig] = useState<DashboardConfig>(DEFAULT_DASHBOARD);
  const [editing, setEditing] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerColumn, setPickerColumn] = useState<"left" | "right">("left");
  const [refreshKey, setRefreshKey] = useState(0);
  const [starred, setStarred] = useState(false);

  // Hydrate from storage once on mount.
  useEffect(() => {
    setConfig(loadConfig(dashboardId));
    setStarred(window.localStorage.getItem(`${STORAGE_PREFIX}${dashboardId}-star`) === "1");
  }, [dashboardId]);

  function commit(next: DashboardConfig) {
    setConfig(next);
    saveConfig(dashboardId, next);
  }

  function addWidget(type: WidgetType) {
    commit({
      ...config,
      widgets: [...config.widgets, { id: newWidgetId(), type, column: pickerColumn }],
    });
    setPickerOpen(false);
  }

  function removeWidget(id: string) {
    commit({ ...config, widgets: config.widgets.filter((w) => w.id !== id) });
  }

  const left = useMemo(() => config.widgets.filter((w) => w.column === "left"), [config]);
  const right = useMemo(() => config.widgets.filter((w) => w.column === "right"), [config]);

  return (
    <div className="px-6 py-5 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
        <div className="flex items-center gap-1.5 text-gray-500">
          <button
            type="button"
            onClick={() => {
              const next = !starred;
              setStarred(next);
              window.localStorage.setItem(
                `${STORAGE_PREFIX}${dashboardId}-star`,
                next ? "1" : "0",
              );
            }}
            className="p-1.5 rounded hover:bg-gray-100"
            aria-label="Star"
          >
            <Star
              className={`h-4 w-4 ${starred ? "fill-yellow-400 text-yellow-500" : ""}`}
            />
          </button>
          <button
            type="button"
            onClick={() => {
              if (typeof window === "undefined") return;
              void navigator.clipboard?.writeText(window.location.href);
            }}
            className="p-1.5 rounded hover:bg-gray-100"
            aria-label="Copy link"
          >
            <Link2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setRefreshKey((k) => k + 1)}
            className="inline-flex items-center gap-1.5 h-8 px-3 text-xs text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className={`inline-flex items-center gap-1.5 h-8 px-3 text-xs rounded ${
              editing
                ? "bg-blue-600 text-white hover:bg-blue-700"
                : "text-gray-700 border border-gray-300 hover:bg-gray-50"
            }`}
          >
            {editing ? <Check className="h-3.5 w-3.5" /> : <Edit3 className="h-3.5 w-3.5" />}
            {editing ? "Done" : "Edit"}
          </button>
          <button
            className="p-1.5 rounded hover:bg-gray-100 border border-gray-300 h-8 w-8 inline-flex items-center justify-center"
            aria-label="More"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Two-column widget grid */}
      <div className="grid grid-cols-2 gap-5">
        <div className="space-y-4">
          {left.map((w) => (
            <WidgetFrame
              key={w.id}
              title={WIDGET_META[w.type].label}
              editing={editing}
              onRemove={() => removeWidget(w.id)}
              onRefresh={() => setRefreshKey((k) => k + 1)}
            >
              <RenderWidget type={w.type} refreshKey={refreshKey} />
            </WidgetFrame>
          ))}
          {editing && (
            <button
              type="button"
              onClick={() => {
                setPickerColumn("left");
                setPickerOpen(true);
              }}
              className="w-full inline-flex items-center justify-center gap-1.5 h-10 border border-dashed border-gray-300 rounded text-sm text-gray-600 hover:bg-blue-50/40 hover:border-blue-300"
            >
              <Plus className="h-4 w-4" />
              Add widget
            </button>
          )}
        </div>
        <div className="space-y-4">
          {right.map((w) => (
            <WidgetFrame
              key={w.id}
              title={WIDGET_META[w.type].label}
              editing={editing}
              onRemove={() => removeWidget(w.id)}
              onRefresh={() => setRefreshKey((k) => k + 1)}
            >
              <RenderWidget type={w.type} refreshKey={refreshKey} />
            </WidgetFrame>
          ))}
          {editing && (
            <button
              type="button"
              onClick={() => {
                setPickerColumn("right");
                setPickerOpen(true);
              }}
              className="w-full inline-flex items-center justify-center gap-1.5 h-10 border border-dashed border-gray-300 rounded text-sm text-gray-600 hover:bg-blue-50/40 hover:border-blue-300"
            >
              <Plus className="h-4 w-4" />
              Add widget
            </button>
          )}
        </div>
      </div>

      {pickerOpen && (
        <WidgetPicker onClose={() => setPickerOpen(false)} onPick={addWidget} />
      )}
    </div>
  );
}

function RenderWidget({ type, refreshKey }: { type: WidgetConfig["type"]; refreshKey: number }) {
  if (type === "introduction") return <IntroductionWidget />;
  if (type === "projects") return <ProjectsWidget refreshKey={refreshKey} />;
  if (type === "assigned-to-me") return <AssignedToMeWidget refreshKey={refreshKey} />;
  if (type === "activity-stream") return <ActivityStreamWidget refreshKey={refreshKey} />;
  if (type === "status-chart") return <StatusChartWidget refreshKey={refreshKey} />;
  return null;
}
