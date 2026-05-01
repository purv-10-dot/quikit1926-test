"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import type { KPIRow, WeeklyValue } from "@/lib/types/kpi";
import { ALL_WEEKS, weekDateLabel } from "@/lib/utils/fiscal";
import { progressColor, weekCellColors, fmt, fmtCompact } from "@/lib/utils/kpiHelpers";
import { useTableColumns, ALL_STATIC_COLS, COL_LABELS, SORT_KEYS } from "../hooks/useTableColumns";
import { useStickyOffsets } from "../hooks/useStickyOffsets";
import { HorizontalScroller } from "@/components/ui/HorizontalScroller";
import { ResizeHandle as SharedResizeHandle } from "@/lib/hooks/useColumnResize";
import { useCurrentWeek, useWeekLabels } from "@/lib/hooks/useCurrentWeek";
import { usePastWeekFlags } from "@/lib/hooks/useFeatureFlags";
import { LogModal } from "./LogModal";
import { KPILogsModal } from "./KPILogsModal";
import { WeekTooltip } from "./WeekTooltip";
import { DescTooltip } from "./DescTooltip";
import { NameTooltip } from "./NameTooltip";
import { ColMenu } from "@/components/table/ColMenu";
import { X } from "lucide-react";
import { Pagination } from "@quikit/ui";
export { HiddenColsMenu } from "./HiddenColsMenu";

// ── Lock icon for freeze boundary ────────────────────────────────────────────

function FreezeIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={`h-3 w-3 text-blue-400 flex-shrink-0 ${className}`} fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
    </svg>
  );
}

// ── Resize handle ────────────────────────────────────────────────────────────

// Use the shared ResizeHandle from @/lib/hooks/useColumnResize — same handle
// used by Priority and WWW tables. Imported as SharedResizeHandle and aliased
// below for call-site readability.
const ResizeHandle = SharedResizeHandle;

// ── Main table ───────────────────────────────────────────────────────────────

interface Props {
  kpis: KPIRow[];
  total: number;
  page: number;
  pageSize: number;
  year: number;
  quarter: string;
  onPageChange: (p: number) => void;
  onPageSizeChange?: (size: number) => void;
  onSort: (col: string, dir: "asc" | "desc") => void;
  onRefresh: () => void;
  onSelectionChange?: (ids: Set<string>) => void;
  clearSelectionTrigger?: number;
  onHiddenColsChange?: (cols: Set<string>) => void;
  showColTrigger?: { col: string; seq: number };
  /** Columns to always hide on this instance (e.g. dashboard preview).
   *  Does NOT persist — only affects this render. */
  hideColumns?: string[];
  /** Limit the number of rows displayed (for dashboard previews). */
  maxRows?: number;
  /** When true, all interactive affordances (selection, edit, log, weekly cell input) are suppressed. */
  readOnly?: boolean;
}

export function KPITable({ kpis: kpisAll, total, page, pageSize, year, quarter, onPageChange, onPageSizeChange, onSort, onRefresh, onSelectionChange, clearSelectionTrigger, onHiddenColsChange, showColTrigger, hideColumns, maxRows, readOnly }: Props) {
  const kpis = maxRows != null ? kpisAll.slice(0, maxRows) : kpisAll;
  const allCols = [...ALL_STATIC_COLS, ...ALL_WEEKS.map(w => `week${w}`)];
  const headerRowRef = useRef<HTMLTableRowElement>(null);
  const [logKPI, setLogKPI] = useState<KPIRow | null>(null);
  const [logInitialTab, setLogInitialTab] = useState<"updates" | "edit" | "stats">("updates");
  const [auditKPI, setAuditKPI] = useState<KPIRow | null>(null);

  // Blocked-week detection: past weeks with no value show a red ✕
  const currentWeek = useCurrentWeek(year, quarter);
  // DB-driven week labels (compact "22–28 Apr") indexed [week-1].
  // Falls back to legacy hardcoded labels while loading.
  const weekLabels = useWeekLabels(year, quarter);
  const { canAddPastWeek } = usePastWeekFlags();

  function openLog(kpi: KPIRow) { if (readOnly) return; setAuditKPI(kpi); }
  function openEdit(kpi: KPIRow) { if (readOnly) return; setLogKPI(kpi); setLogInitialTab("edit"); }

  const {
    colWidths, frozenUpTo, hiddenCols, selectedIds,
    getColWidth, isFrozen, startResize,
    handleFreezeCol, handleHideCol, handleShowCol,
    toggleSelect, toggleAll, clearSelection,
  } = useTableColumns(allCols, kpis.map(k => k.id));

  const { getStickyLeft } = useStickyOffsets(headerRowRef, frozenUpTo, hiddenCols, colWidths);

  // Notify parent when selection changes
  useEffect(() => { onSelectionChange?.(selectedIds); }, [selectedIds, onSelectionChange]);

  // Clear selection when parent requests it
  useEffect(() => { if (clearSelectionTrigger) clearSelection(); }, [clearSelectionTrigger, clearSelection]);

  // Notify parent when hidden cols change
  useEffect(() => { onHiddenColsChange?.(hiddenCols); }, [hiddenCols, onHiddenColsChange]);

  // Show col when parent requests it
  useEffect(() => { if (showColTrigger) handleShowCol(showColTrigger.col); }, [showColTrigger, handleShowCol]);

  // Local hide set = persisted hidden cols + this instance's hideColumns prop (not persisted)
  const localHideSet = useMemo(() => {
    const s = new Set<string>(hiddenCols);
    (hideColumns ?? []).forEach((c) => s.add(c));
    return s;
  }, [hiddenCols, hideColumns]);

  const hideCheckbox = localHideSet.has("_checkbox");
  const hideLog = localHideSet.has("_log");
  const hideId = localHideSet.has("_id");

  const totalPages = Math.ceil(total / pageSize);
  const visibleStaticCols = ALL_STATIC_COLS.filter(c => !localHideSet.has(c));
  const visibleWeekCols = ALL_WEEKS.filter(w => !localHideSet.has(`week${w}`));

  function thClass(col: string) {
    const sticky = isFrozen(col);
    const boundary = col === frozenUpTo;
    return [
      // `relative` is required so the absolutely-positioned ResizeHandle
      // anchors to the <th> itself (otherwise handle's h-full collapses
      // inside an auto-height table cell and has zero hit area).
      "group relative text-left text-xs font-semibold text-gray-500 bg-accent-50",
      "border-b border-r border-gray-200 select-none",
      sticky ? `sticky z-[35]${boundary ? " shadow-[2px_0_4px_rgba(0,0,0,0.06)]" : ""}` : "",
    ].join(" ");
  }

  function tdClass(col: string, extra = "") {
    const sticky = isFrozen(col);
    const boundary = col === frozenUpTo;
    return [
      // `overflow-hidden` needed so wide content doesn't blow past the column
      // width set by `table-layout: fixed`. Individual cells that need wrap
      // (e.g. kpiName) handle their own `line-clamp-N` on the inner span.
      "px-3 py-2 text-xs text-gray-700 border-b border-r border-gray-100 overflow-hidden align-top",
      extra,
      sticky ? `sticky z-[15] bg-white${boundary ? " shadow-[2px_0_4px_rgba(0,0,0,0.04)]" : ""}` : "",
    ].join(" ");
  }

  function stickyStyle(col: string, w: number) {
    return isFrozen(col) ? { left: getStickyLeft(col), width: w } : { width: w };
  }

  return (
    <div className="flex flex-col h-full">

      <HorizontalScroller className="flex-1">
        <table className="border-separate border-spacing-0 text-xs" style={{ minWidth: "max-content", tableLayout: "fixed" }}>
          <thead className="sticky top-0 z-30">
            <tr ref={headerRowRef}>
              {/* Fixed columns: Checkbox, Log, ID (hidable via hideColumns prop) */}
              {!hideCheckbox && (
                <th data-col-key="_checkbox" className="sticky z-[35] px-2 py-2 bg-accent-50 border-b border-r border-gray-200"
                  style={{ left: 0, width: 40, minWidth: 40, maxWidth: 40 }}>
                  <input type="checkbox" checked={selectedIds.size === kpis.length && kpis.length > 0}
                    onChange={toggleAll} className="rounded border-gray-300 text-blue-600" />
                </th>
              )}
              {!hideLog && (
                <th data-col-key="_log" className="sticky z-[35] px-1 py-2 bg-accent-50 border-b border-r border-gray-200 text-xs font-semibold text-gray-500 text-center overflow-hidden"
                  style={{ left: hideCheckbox ? 0 : 40, width: 40, minWidth: 40, maxWidth: 40 }}>Log</th>
              )}
              {!hideId && (
                <th data-col-key="_id" className="sticky z-[35] px-1 py-2 bg-accent-50 border-b border-r border-gray-200 text-xs font-semibold text-gray-500 text-center overflow-hidden"
                  style={{ left: (hideCheckbox ? 0 : 40) + (hideLog ? 0 : 40), width: 40, minWidth: 40, maxWidth: 40 }}>ID</th>
              )}

              {/* Dynamic static columns */}
              {visibleStaticCols.map(col => {
                const w = getColWidth(col);
                const sortable = !!SORT_KEYS[col];
                return (
                  <th key={col} data-col-key={col} className={thClass(col)} style={stickyStyle(col, w)}>
                    <div className="flex items-center gap-1 px-3 py-2 pr-2">
                      {frozenUpTo === col && <FreezeIcon />}
                      <span className="flex-1 truncate min-w-0">{COL_LABELS[col]}</span>
                      <ColMenu colKey={col}
                        onSort={sortable ? (d => onSort(SORT_KEYS[col], d)) : undefined}
                        onFreeze={() => handleFreezeCol(col)} onHide={() => handleHideCol(col)}
                        frozen={frozenUpTo === col}
                        showSort={sortable} />
                    </div>
                    <ResizeHandle onStart={(e) => startResize(col, e.clientX)} />
                  </th>
                );
              })}

              {/* Week columns */}
              {visibleWeekCols.map(w => {
                const col = `week${w}`;
                const colW = getColWidth(col);
                return (
                  <th key={w} data-col-key={col} className={thClass(col)} style={stickyStyle(col, colW)}>
                    <div className="flex items-start gap-1 px-3 py-2 pr-2">
                      {frozenUpTo === col && <FreezeIcon className="mt-0.5" />}
                      <div className="min-w-0 flex-1">
                        <div className="whitespace-nowrap">Week {w}</div>
                        <div className="text-[9px] font-normal text-gray-400 leading-none mt-0.5 whitespace-nowrap">
                          {weekLabels[w - 1] ?? weekDateLabel(year, quarter, w)}
                        </div>
                      </div>
                      <ColMenu colKey={col} onSort={() => {}} onFreeze={() => handleFreezeCol(col)} onHide={() => handleHideCol(col)}
                        frozen={frozenUpTo === col} showSort={false} />
                    </div>
                    <ResizeHandle onStart={(e) => startResize(col, e.clientX)} />
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {kpis.length === 0 ? (
              <tr>
                <td colSpan={3 + visibleStaticCols.length + visibleWeekCols.length}
                  className="px-6 py-12 text-center text-gray-400">
                  No KPIs found. Click <strong>Add KPI</strong> to create one.
                </td>
              </tr>
            ) : kpis.map((kpi, idx) => {
              const colors = progressColor(kpi.progressPercent ?? 0);
              const ownerName = kpi.owner_user ? `${kpi.owner_user.firstName} ${kpi.owner_user.lastName}` : kpi.owner;
              const weekMap: Record<number, WeeklyValue> = {};
              (kpi.weeklyValues ?? []).forEach(wv => { weekMap[wv.weekNumber] = wv; });

              return (
                <tr key={kpi.id} className="hover:bg-blue-50/30 transition-colors">
                  {/* Fixed: Checkbox (hidable) */}
                  {!hideCheckbox && (
                    <td className="sticky z-[15] bg-white px-2 py-2 border-b border-r border-gray-100"
                      style={{ left: 0, width: 40, minWidth: 40, maxWidth: 40 }}>
                      <input type="checkbox" checked={selectedIds.has(kpi.id)} disabled={readOnly}
                        onChange={() => { if (!readOnly) toggleSelect(kpi.id); }}
                        className={`rounded border-gray-300 text-blue-600 ${readOnly ? "opacity-40 cursor-not-allowed" : ""}`} />
                    </td>
                  )}
                  {/* Fixed: Log (hidable) */}
                  {!hideLog && (
                    <td className="sticky z-[15] bg-white px-1 py-2 border-b border-r border-gray-100 text-center"
                      style={{ left: hideCheckbox ? 0 : 40, width: 40, minWidth: 40, maxWidth: 40 }}>
                      <button onClick={() => openLog(kpi)} disabled={readOnly}
                        className={`p-1 rounded transition-colors ${readOnly ? "text-gray-300 cursor-not-allowed" : "text-gray-400 hover:text-blue-500 hover:bg-gray-100"}`}
                        title={readOnly ? "Read-only" : "Open log"}>
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </button>
                    </td>
                  )}
                  {/* Fixed: ID (hidable) */}
                  {!hideId && (
                    <td className="sticky z-[15] bg-white px-1 py-2 border-b border-r border-gray-100 text-center"
                      style={{ left: (hideCheckbox ? 0 : 40) + (hideLog ? 0 : 40), width: 40, minWidth: 40, maxWidth: 40 }}>
                      <button onClick={() => openEdit(kpi)} disabled={readOnly}
                        className={`font-medium ${readOnly ? "text-gray-400 cursor-not-allowed" : "text-gray-900 hover:underline"}`}>
                        {idx + 1 + (page - 1) * pageSize}
                      </button>
                    </td>
                  )}

                  {/* Progress */}
                  {!localHideSet.has("progress") && (
                    <td className={tdClass("progress")} style={stickyStyle("progress", getColWidth("progress"))}>
                      <div className="flex items-center gap-2">
                        <span className={`font-medium w-10 flex-shrink-0 ${colors.text}`}>{(kpi.progressPercent ?? 0).toFixed(0)}%</span>
                        <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden min-w-[40px]">
                          <div className={`h-2 rounded-full transition-all ${colors.bar}`} style={{ width: `${Math.min(kpi.progressPercent ?? 0, 100)}%` }} />
                        </div>
                      </div>
                    </td>
                  )}
                  {/* Owner */}
                  {!localHideSet.has("owner") && (
                    <td className={tdClass("owner", "whitespace-nowrap")} style={stickyStyle("owner", getColWidth("owner"))}>{ownerName}</td>
                  )}
                  {/* KPI Name */}
                  {!localHideSet.has("kpiName") && (
                    <td className={tdClass("kpiName")} style={stickyStyle("kpiName", getColWidth("kpiName"))}>
                      <NameTooltip name={kpi.name}>
                        <span className="line-clamp-2 leading-snug cursor-default">{kpi.name}</span>
                      </NameTooltip>
                    </td>
                  )}
                  {/* Team Name */}
                  {!localHideSet.has("team") && (
                    <td className={tdClass("team", "whitespace-nowrap")} style={stickyStyle("team", getColWidth("team"))}>
                      {kpi.team?.name ? (
                        <span className="text-gray-700 truncate block">{kpi.team.name}</span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  )}
                  {/* Team Head (team KPI only) */}
                  {!localHideSet.has("teamHead") && (
                    <td className={tdClass("teamHead", "whitespace-nowrap")} style={stickyStyle("teamHead", getColWidth("teamHead"))}>
                      {kpi.team?.head ? (
                        <span className="text-gray-700 truncate block">
                          {kpi.team.head.firstName} {kpi.team.head.lastName}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  )}
                  {/* KPI Owners (multi) */}
                  {!localHideSet.has("kpiOwner") && (
                    <td className={tdClass("kpiOwner")} style={stickyStyle("kpiOwner", getColWidth("kpiOwner"))}>
                      {kpi.owners && kpi.owners.length > 0 ? (
                        <div className="flex flex-col gap-0.5">
                          {kpi.owners.slice(0, 3).map(u => {
                            const pct = (kpi.ownerContributions as Record<string, number> | undefined)?.[u.id];
                            return (
                              <div key={u.id} className="text-[11px] text-gray-700 truncate leading-tight">
                                {u.firstName} {u.lastName}
                                {typeof pct === "number" && (
                                  <span className="text-gray-400 ml-1">({pct.toFixed(0)}%)</span>
                                )}
                              </div>
                            );
                          })}
                          {kpi.owners.length > 3 && (
                            <div className="text-[10px] text-gray-400">+{kpi.owners.length - 3} more</div>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  )}
                  {/* Measurement Unit */}
                  {!localHideSet.has("measurementUnit") && (
                    <td className={tdClass("measurementUnit", "whitespace-nowrap")} style={stickyStyle("measurementUnit", getColWidth("measurementUnit"))}>{kpi.measurementUnit}</td>
                  )}
                  {/* Target Value */}
                  {!localHideSet.has("targetValue") && (
                    <td className={tdClass("targetValue")} style={stickyStyle("targetValue", getColWidth("targetValue"))}>{fmtCompact(kpi.target ?? null)}</td>
                  )}
                  {/* Quarterly Goal */}
                  {!localHideSet.has("quarterlyGoal") && (
                    <td className={tdClass("quarterlyGoal")} style={stickyStyle("quarterlyGoal", getColWidth("quarterlyGoal"))}>{fmtCompact(kpi.quarterlyGoal ?? null)}</td>
                  )}
                  {/* QTD Goal */}
                  {!localHideSet.has("qtdGoal") && (
                    <td className={tdClass("qtdGoal")} style={stickyStyle("qtdGoal", getColWidth("qtdGoal"))}>{fmtCompact(kpi.qtdGoal ?? null)}</td>
                  )}
                  {/* QTD Achieved */}
                  {!localHideSet.has("qtdAchieved") && (
                    <td className={tdClass("qtdAchieved")} style={stickyStyle("qtdAchieved", getColWidth("qtdAchieved"))}>{fmtCompact(kpi.qtdAchieved ?? null)}</td>
                  )}
                  {/* Weekly Goal (computed: (qtdGoal ?? target) / 13) */}
                  {!localHideSet.has("weeklyGoal") && (
                    <td className={tdClass("weeklyGoal")} style={stickyStyle("weeklyGoal", getColWidth("weeklyGoal"))}>
                      {(() => {
                        const base = kpi.qtdGoal ?? kpi.target ?? 0;
                        return base > 0 ? fmtCompact(base / 13) : "—";
                      })()}
                    </td>
                  )}
                  {/* Description */}
                  {!localHideSet.has("description") && (
                    <td className={tdClass("description")} style={stickyStyle("description", getColWidth("description"))}>
                      <DescTooltip description={kpi.description} lastNotes={kpi.lastNotes} lastNotesAt={kpi.lastNotesAt}>
                        <span className="line-clamp-2 text-gray-500 leading-snug cursor-default">
                          {kpi.description ? kpi.description.slice(0, 60) + (kpi.description.length > 60 ? "…" : "") : "—"}
                        </span>
                      </DescTooltip>
                    </td>
                  )}
                  {/* Last Notes */}
                  {!localHideSet.has("lastNotes") && (
                    <td className={tdClass("lastNotes")} style={stickyStyle("lastNotes", getColWidth("lastNotes"))}>
                      {kpi.lastNotes ? (
                        <span className="line-clamp-2 text-gray-500 leading-snug cursor-default" title={kpi.lastNotes}>
                          {kpi.lastNotes}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                  )}

                  {/* Week columns */}
                  {visibleWeekCols.map(w => {
                    const col = `week${w}`;
                    const wv = weekMap[w];
                    const val = wv?.value;
                    const note = wv?.notes;
                    const { bg, text, label: cellLabel } = weekCellColors(val, kpi.qtdGoal, kpi.target, kpi.reverseColor ?? false);
                    const colW = getColWidth(col);
                    const boundary = col === frozenUpTo;

                    // Team KPI: compute per-owner breakdown for the tooltip.
                    // Targets: prefer saved weeklyOwnerTargets; fall back to contribution % × aggregate weeklyTargets.
                    // Actuals (Phase 2): pull from kpi.weeklyOwnerValues (per-owner raw weekly values from the API).
                    let ownerBreakdown: { id: string; name: string; pct: number; target: number | null; actual: number | null }[] | undefined;
                    if (kpi.kpiLevel === "team" && kpi.owners && kpi.owners.length > 0) {
                      const ownerTargetsMap = (kpi.weeklyOwnerTargets as Record<string, Record<string, number>> | null | undefined) ?? null;
                      const aggregateTargets = (kpi.weeklyTargets as Record<string, number> | null | undefined) ?? null;
                      const contribs = (kpi.ownerContributions as Record<string, number> | null | undefined) ?? null;
                      const ownerValuesMap = kpi.weeklyOwnerValues ?? undefined;
                      ownerBreakdown = kpi.owners.map(o => {
                        const pct = contribs?.[o.id] ?? 0;
                        const savedOwnerTarget = ownerTargetsMap?.[o.id]?.[String(w)];
                        const derivedTarget = aggregateTargets?.[String(w)] != null
                          ? (aggregateTargets[String(w)] * pct) / 100
                          : null;
                        const target = savedOwnerTarget != null ? savedOwnerTarget : derivedTarget;
                        const ownerRow = ownerValuesMap?.[o.id];
                        const ownerActual = ownerRow?.find(v => v.weekNumber === w)?.value ?? null;
                        return {
                          id: o.id,
                          name: `${o.firstName} ${o.lastName}`,
                          pct,
                          target: target != null ? (kpi.measurementUnit === "Number" ? Math.round(target) : parseFloat(target.toFixed(2))) : null,
                          actual: ownerActual != null ? (kpi.measurementUnit === "Number" ? Math.round(ownerActual) : parseFloat(ownerActual.toFixed(2))) : null,
                        };
                      });
                    }

                    const hasContent = (val !== undefined && val !== null) || !!note || (ownerBreakdown && ownerBreakdown.length > 0);
                    const hasValue = val !== undefined && val !== null;
                    const isBlocked = currentWeek !== null && w < currentWeek && !canAddPastWeek && !hasValue;

                    return (
                      <td key={w}
                        className={[
                          "text-xs border-b border-r border-gray-100 text-center font-medium p-0",
                          isBlocked ? "bg-gray-50" : bg,
                          isBlocked ? "" : text,
                          isFrozen(col) ? `sticky z-[15]${boundary ? " shadow-[2px_0_4px_rgba(0,0,0,0.04)]" : ""}` : "",
                        ].join(" ")}
                        style={stickyStyle(col, colW)}
                        aria-label={`Week ${w}: ${isBlocked ? "blocked — no value logged" : hasValue ? val : "no data"} — ${cellLabel}`}>
                        {isBlocked ? (
                          <div className="flex items-center justify-center px-2 py-2">
                            <X className="h-3.5 w-3.5 text-red-400" />
                          </div>
                        ) : hasContent ? (
                          <WeekTooltip weekNumber={w} value={val} note={note} owners={ownerBreakdown}>
                            <div className="flex items-center justify-center w-full h-full px-2 py-2 cursor-default">
                              {hasValue
                                ? fmtCompact(val)
                                : <span className="text-gray-300 font-normal">—</span>}
                            </div>
                          </WeekTooltip>
                        ) : (
                          <div className="flex items-center justify-center px-2 py-2 text-gray-300 font-normal">—</div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </HorizontalScroller>

      <Pagination
        page={page}
        totalPages={totalPages}
        total={total}
        limit={pageSize}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
      />

      {logKPI && <LogModal kpi={logKPI} onClose={() => setLogKPI(null)} onRefresh={onRefresh} initialTab={logInitialTab} />}
      {auditKPI && <KPILogsModal kpi={auditKPI} onClose={() => setAuditKPI(null)} />}
    </div>
  );
}
