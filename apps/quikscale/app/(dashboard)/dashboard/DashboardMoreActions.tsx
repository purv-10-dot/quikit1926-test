"use client";

/**
 * Dashboard-scoped "More" pill.
 *
 * Unlike module pages (one table each), the dashboard shows THREE sections —
 * KPI Overview, Priority, WWW. The user asked for a single global More pill
 * where they can pick which sections to act on (multi-select). This component
 * wires that up.
 *
 * Features:
 *   1) Export Data — multi-section checklist → multi-sheet xlsx (one tab per
 *      selected section)
 *   2) View Trash — per-section checkboxes set trashSections state at
 *      dashboard level; each section then filters its already-loaded data to
 *      `deletedAt != null`. (Honest limitation: dashboard summary excludes
 *      soft-deleted rows server-side, so trash on dashboard will look empty
 *      unless we extend the summary API. Pill is still shipped so users can
 *      see the UX.)
 *   3) Manage Columns — section picker dropdown; opens the existing
 *      ManageColsModal for the chosen section's TablePreference key.
 */
import { useState } from "react";
import {
  MoreMenu,
  type MoreMenuItem,
  ManageColsModal,
  type ManageColumn,
} from "@quikit/ui";
import { Download, Trash2, Columns, X, ChevronDown } from "lucide-react";
import type { KPIRow } from "@/lib/types/kpi";
import type { PriorityRow } from "@/lib/types/priority";
import type { WWWItem } from "@/lib/types/www";
import { useTablePrefs, type TableName } from "@/lib/hooks/useTablePreferences";
// Single source of truth for KPI column labels — keeps the Manage Columns
// modal in lockstep with the actual table headers. Without this import, the
// modal silently drifts every time a label is renamed on the KPI page.
import { COL_LABELS as KPI_COL_LABELS } from "../kpi/hooks/useTableColumns";

export type DashboardSectionKey = "kpi" | "priority" | "www";

const SECTION_META: Array<{ key: DashboardSectionKey; label: string; prefsKey: TableName; columns: ManageColumn[] }> = [
  {
    key: "kpi",
    label: "KPI Overview",
    prefsKey: "kpi",
    // Column keys MUST match the keys used by KPITable's `localHideSet`
    // (see app/(dashboard)/kpi/components/KPITable.tsx). Labels are pulled
    // from `KPI_COL_LABELS` so the modal can't drift from the table header
    // text. Note: the column is `targetValue`, not `target` — using
    // `target` here was a bug that made the toggle silently no-op because
    // KPITable checks `localHideSet.has("targetValue")`.
    columns: [
      { key: "kpiName",         label: KPI_COL_LABELS.kpiName },
      { key: "owner",           label: KPI_COL_LABELS.owner },
      { key: "team",            label: KPI_COL_LABELS.team },
      { key: "measurementUnit", label: KPI_COL_LABELS.measurementUnit },
      { key: "targetValue",     label: KPI_COL_LABELS.targetValue },
      { key: "qtdAchieved",     label: KPI_COL_LABELS.qtdAchieved },
      { key: "progress",        label: KPI_COL_LABELS.progress },
    ],
  },
  {
    key: "priority",
    label: "Priority",
    prefsKey: "priority",
    columns: [
      { key: "team", label: "Team" },
      { key: "priorityName", label: "Priority Name" },
      { key: "owner", label: "Owner" },
      { key: "overallStatus", label: "Overall Status" },
    ],
  },
  {
    key: "www",
    label: "WWW",
    prefsKey: "www",
    columns: [
      { key: "who", label: "Who" },
      { key: "when", label: "When" },
      { key: "what", label: "What" },
      { key: "status", label: "Status" },
      { key: "notes", label: "Notes" },
    ],
  },
];

interface DashboardMoreActionsProps {
  kpis: KPIRow[];
  priorities: PriorityRow[];
  wwws: WWWItem[];
  fiscalLabel: string; // e.g. "FY2026-Q2"
  trashSections: Set<DashboardSectionKey>;
  onChangeTrashSections: (next: Set<DashboardSectionKey>) => void;
}

export function DashboardMoreActions({
  kpis,
  priorities,
  wwws,
  fiscalLabel,
  trashSections,
  onChangeTrashSections,
}: DashboardMoreActionsProps) {
  const [showExport, setShowExport] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [manageSection, setManageSection] = useState<DashboardSectionKey | null>(null);
  const [showManagePicker, setShowManagePicker] = useState(false);

  const moreItems: MoreMenuItem[] = [
    {
      key: "export",
      label: "Export Data",
      icon: Download,
      onSelect: () => setShowExport(true),
    },
    {
      key: "trash",
      label: "View Trash",
      icon: Trash2,
      onSelect: () => setShowTrash(true),
      accessory: trashSections.size > 0 ? (
        <span className="text-[9px] font-semibold uppercase bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">
          {trashSections.size} on
        </span>
      ) : undefined,
    },
    {
      key: "manage-cols",
      label: "Manage Columns",
      icon: Columns,
      onSelect: () => setShowManagePicker(true),
    },
  ];

  return (
    <>
      <MoreMenu items={moreItems} />

      {showExport && (
        <ExportSectionsModal
          kpis={kpis}
          priorities={priorities}
          wwws={wwws}
          fiscalLabel={fiscalLabel}
          onClose={() => setShowExport(false)}
        />
      )}

      {showTrash && (
        <TrashSectionsModal
          active={trashSections}
          onApply={(next) => { onChangeTrashSections(next); setShowTrash(false); }}
          onClose={() => setShowTrash(false)}
        />
      )}

      {showManagePicker && (
        <SectionPickerModal
          title="Manage Columns — pick a section"
          onPick={(k) => { setManageSection(k); setShowManagePicker(false); }}
          onClose={() => setShowManagePicker(false)}
        />
      )}

      {manageSection && (
        <ManageForSection
          sectionKey={manageSection}
          onClose={() => setManageSection(null)}
        />
      )}
    </>
  );
}

/* ─── Export: multi-section → multi-sheet xlsx ─────────────────────── */

function ExportSectionsModal({
  kpis,
  priorities,
  wwws,
  fiscalLabel,
  onClose,
}: {
  kpis: KPIRow[];
  priorities: PriorityRow[];
  wwws: WWWItem[];
  fiscalLabel: string;
  onClose: () => void;
}) {
  const [sel, setSel] = useState<Set<DashboardSectionKey>>(new Set(["kpi", "priority", "www"]));
  const [busy, setBusy] = useState(false);

  const rowCount = (k: DashboardSectionKey) =>
    k === "kpi" ? kpis.length : k === "priority" ? priorities.length : wwws.length;

  const toggle = (k: DashboardSectionKey) =>
    setSel((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const doExport = async () => {
    if (sel.size === 0) return;
    setBusy(true);
    try {
      // Lazy-load SheetJS only when the user actually exports — keeps the
      // ~430 KB xlsx library out of the dashboard's initial bundle. The
      // namespace import has the identical shape to the prior static import.
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();
      if (sel.has("kpi") && kpis.length) {
        // Header labels match the table headers + the Manage Columns modal
        // (both sourced from KPI_COL_LABELS) so the exported xlsx uses the
        // same wording the user sees on screen.
        const header = ["KPI Name", "Owner", "Team", KPI_COL_LABELS.measurementUnit, KPI_COL_LABELS.targetValue, KPI_COL_LABELS.qtdAchieved, "Progress %"];
        const body = kpis.map((k: any) => [
          k.name ?? "",
          k.owner_user ? `${k.owner_user.firstName} ${k.owner_user.lastName}` : "",
          k.team?.name ?? "",
          k.measurementUnit ?? "",
          k.target ?? "",
          k.qtdAchieved ?? 0,
          typeof k.progressPercent === "number" ? Number(k.progressPercent.toFixed(1)) : 0,
        ]);
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...body]), "KPI");
      }
      if (sel.has("priority") && priorities.length) {
        const header = ["Team", "Priority Name", "Owner", "Overall Status", "Start Week", "End Week"];
        const body = priorities.map((p: any) => [
          p.team?.name ?? "",
          p.name ?? "",
          p.owner_user ? `${p.owner_user.firstName} ${p.owner_user.lastName}` : "",
          p.overallStatus ?? "",
          p.startWeek ?? "",
          p.endWeek ?? "",
        ]);
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...body]), "Priority");
      }
      if (sel.has("www") && wwws.length) {
        const header = ["Who", "When", "What", "Status", "Notes"];
        const body = wwws.map((w: any) => [
          w.who_user ? `${w.who_user.firstName} ${w.who_user.lastName}` : w.who ?? "",
          w.when ? new Date(w.when).toISOString().slice(0, 10) : "",
          w.what ?? "",
          w.status ?? "",
          w.notes ?? "",
        ]);
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...body]), "WWW");
      }
      const today = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `Dashboard-${fiscalLabel}-${today}.xlsx`);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Export Dashboard</h3>
            <p className="text-xs text-gray-500">Pick sections. Each becomes its own sheet.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>
        </div>
        <div className="px-5 py-3 space-y-2">
          {SECTION_META.map((s) => {
            const on = sel.has(s.key);
            const n = rowCount(s.key);
            return (
              <label
                key={s.key}
                className={`flex items-center justify-between gap-2 px-3 py-2 rounded cursor-pointer border text-sm ${on ? "border-accent-300 bg-accent-50 text-accent-800" : "border-gray-200 bg-white text-gray-500"}`}
              >
                <span className="flex items-center gap-2">
                  <input type="checkbox" checked={on} onChange={() => toggle(s.key)} />
                  {s.label}
                </span>
                <span className="text-xs text-gray-500">{n} rows</span>
              </label>
            );
          })}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-200 bg-gray-50">
          <button onClick={onClose} disabled={busy} className="px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-50">Cancel</button>
          <button
            onClick={doExport}
            disabled={busy || sel.size === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-accent-600 hover:bg-accent-700 rounded-lg disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5" />
            {busy ? "Exporting…" : "Export .xlsx"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── View Trash: multi-section toggle modal ───────────────────────── */

function TrashSectionsModal({
  active,
  onApply,
  onClose,
}: {
  active: Set<DashboardSectionKey>;
  onApply: (next: Set<DashboardSectionKey>) => void;
  onClose: () => void;
}) {
  const [sel, setSel] = useState<Set<DashboardSectionKey>>(new Set(active));
  const toggle = (k: DashboardSectionKey) =>
    setSel((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <div>
            <h3 className="text-sm font-semibold text-gray-900">View Trash</h3>
            <p className="text-xs text-gray-500">Pick sections to show deleted records only.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>
        </div>
        <div className="px-5 py-3 space-y-2">
          {SECTION_META.map((s) => {
            const on = sel.has(s.key);
            return (
              <label
                key={s.key}
                className={`flex items-center gap-2 px-3 py-2 rounded cursor-pointer border text-sm ${on ? "border-amber-300 bg-amber-50 text-amber-800" : "border-gray-200 bg-white text-gray-500"}`}
              >
                <input type="checkbox" checked={on} onChange={() => toggle(s.key)} />
                {s.label}
                {on && <span className="ml-auto text-[10px] font-semibold uppercase bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">Trash</span>}
              </label>
            );
          })}
        </div>
        <div className="px-5 py-2 text-[11px] text-gray-500 border-t border-gray-100 bg-gray-50/50">
          Note: for full restore + per-row actions, use the module page (KPI / Priority / WWW).
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-200 bg-gray-50">
          <button onClick={onClose} className="px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 rounded-lg">Cancel</button>
          <button
            onClick={() => onApply(sel)}
            className="px-3 py-1.5 text-xs font-semibold text-white bg-accent-600 hover:bg-accent-700 rounded-lg"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Section picker (for Manage Columns) ─────────────────────────── */

function SectionPickerModal({
  title,
  onPick,
  onClose,
}: {
  title: string;
  onPick: (k: DashboardSectionKey) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-xs overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-4 w-4" /></button>
        </div>
        <div className="py-1">
          {SECTION_META.map((s) => (
            <button
              key={s.key}
              onClick={() => onPick(s.key)}
              className="w-full flex items-center justify-between gap-2 px-5 py-2.5 text-sm text-gray-700 hover:bg-accent-50 hover:text-accent-700 text-left"
            >
              {s.label}
              <ChevronDown className="h-3.5 w-3.5 -rotate-90" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Manage Columns per section ───────────────────────────────────── */

function ManageForSection({
  sectionKey,
  onClose,
}: {
  sectionKey: DashboardSectionKey;
  onClose: () => void;
}) {
  const meta = SECTION_META.find((s) => s.key === sectionKey)!;
  const prefs = useTablePrefs(meta.prefsKey);

  return (
    <ManageColsModal
      open
      onClose={onClose}
      columns={meta.columns}
      hiddenCols={prefs.hiddenCols}
      onChange={(next) => prefs.setHiddenCols(next)}
    />
  );
}
