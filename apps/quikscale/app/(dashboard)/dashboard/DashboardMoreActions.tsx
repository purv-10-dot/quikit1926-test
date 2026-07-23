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
 *   1) View Trash — per-section checkboxes set trashSections state at
 *      dashboard level; each section then filters its already-loaded data to
 *      `deletedAt != null`. (Honest limitation: dashboard summary excludes
 *      soft-deleted rows server-side, so trash on dashboard will look empty
 *      unless we extend the summary API. Pill is still shipped so users can
 *      see the UX.)
 *   2) Manage Columns — section picker dropdown; opens the existing
 *      ManageColsModal for the chosen section's TablePreference key.
 *
 * NOTE: Export Data was intentionally removed from the dashboard per product
 * request. Per-module export still lives on the individual module pages.
 */
import { useState } from "react";
import {
  MoreMenu,
  type MoreMenuItem,
  ManageColsModal,
  type ManageColumn,
} from "@quikit/ui";
import { Trash2, Columns, X, ChevronDown } from "lucide-react";
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
  trashSections: Set<DashboardSectionKey>;
  onChangeTrashSections: (next: Set<DashboardSectionKey>) => void;
}

export function DashboardMoreActions({
  trashSections,
  onChangeTrashSections,
}: DashboardMoreActionsProps) {
  const [showTrash, setShowTrash] = useState(false);
  const [manageSection, setManageSection] = useState<DashboardSectionKey | null>(null);
  const [showManagePicker, setShowManagePicker] = useState(false);

  const moreItems: MoreMenuItem[] = [
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
