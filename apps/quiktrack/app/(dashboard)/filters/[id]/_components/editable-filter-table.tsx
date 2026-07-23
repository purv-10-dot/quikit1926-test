"use client";

import { useCallback, useMemo, useState } from "react";
import { ColumnMenuButton } from "../../../spaces/[id]/list/_components/column-menu-button";
import {
  COLUMN_DEFS,
  resolveColumns,
  type IssuePatch,
} from "../../../spaces/[id]/list/_components/list-columns";
import type { ListIssue } from "../../../spaces/[id]/list/_components/list-types";
import { useColumnPrefs, useColumnWidths } from "@/lib/hooks/useColumnPrefs";
import { useProjectMeta, type ProjectMember } from "./use-project-meta";
import { FilterTableHeader } from "./filter-table-header";
import {
  asListIssue,
  cellStyle,
  COL_WIDTHS,
  PROJECT_COL,
  ReadOnlyCell,
  withProjectColumn,
  type FilterListIssue,
} from "./filter-table-cells";

export type { FilterListIssue } from "./filter-table-cells";

interface Props {
  filterId: string;
  issues: FilterListIssue[];
  loading: boolean;
  selectedIds: Set<string>;
  onToggleRow: (id: string) => void;
  onToggleAll: () => void;
  allSelected: boolean;
  onOpenIssue: (id: string) => void;
  onPatched: () => void;
}

export function EditableFilterTable({
  filterId,
  issues,
  loading,
  selectedIds,
  onToggleRow,
  onToggleAll,
  allSelected,
  onOpenIssue,
  onPatched,
}: Props) {
  const viewKey = `global-filter-${filterId}`;
  // Cross-project view → no single projectId, so scope prefs per-filter only.
  const colPrefs = useColumnPrefs(viewKey, null);
  const { getColWidth, startResize } = useColumnWidths(viewKey, COL_WIDTHS);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  // Optimistic overrides layered on top of the server rows. Keyed by issue id;
  // each entry is a partial ListIssue we merge in on render. Reverted on error.
  const [overrides, setOverrides] = useState<Record<string, Partial<ListIssue>>>({});

  const projectIds = useMemo(
    () => issues.map((i) => i.project?.id).filter((v): v is string => !!v),
    [issues],
  );
  const { statusesByProject, membersByProject } = useProjectMeta(projectIds);

  const columns = useMemo(
    () => withProjectColumn(resolveColumns(colPrefs.order, colPrefs.hidden)),
    [colPrefs.order, colPrefs.hidden],
  );

  const rows: FilterListIssue[] = useMemo(
    () => issues.map((i) => (overrides[i.id] ? { ...i, ...overrides[i.id] } : i)),
    [issues, overrides],
  );

  const isEditable = useCallback(
    (issue: FilterListIssue) => issue.type !== "IDEA" && !!issue.project,
    [],
  );

  const handlePatchIssue = useCallback(
    (issueId: string, patch: IssuePatch) => {
      const row = issues.find((i) => i.id === issueId);
      if (!row) return;
      const projectId = row.project?.id ?? null;
      const statuses = projectId ? statusesByProject[projectId] ?? [] : [];
      const members = projectId ? membersByProject[projectId] ?? [] : [];

      // Build the optimistic delta, mirroring embedded objects so pills/avatars
      // update instantly (same approach as list-view's handlePatchIssue).
      const delta: Partial<ListIssue> = {};
      if ("title" in patch) delta.title = patch.title as string;
      if ("priority" in patch) delta.priority = patch.priority ?? null;
      if ("storyPoints" in patch) delta.storyPoints = patch.storyPoints ?? null;
      if ("eta" in patch) delta.eta = patch.eta ?? null;
      if ("dueDate" in patch) delta.dueDate = patch.dueDate ?? null;
      if ("startDate" in patch) delta.startDate = patch.startDate ?? null;
      if ("statusId" in patch) {
        delta.statusId = patch.statusId as string;
        delta.status = statuses.find((s) => s.id === patch.statusId) ?? row.status;
      }
      if ("assigneeId" in patch) {
        const assigneeId = (patch.assigneeId as string | null) ?? null;
        delta.assigneeId = assigneeId;
        delta.assignee = assigneeId
          ? members.find((m) => m.user?.id === assigneeId)?.user ?? null
          : null;
      }

      const prevOverride = overrides[issueId];
      setOverrides((prev) => ({ ...prev, [issueId]: { ...prev[issueId], ...delta } }));

      fetch(`/api/issues/${issueId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      })
        .then((r) => r.json() as Promise<{ success: boolean; error?: string }>)
        .then((res) => {
          if (!res.success) throw new Error(res.error ?? "Save failed");
          onPatched();
        })
        .catch((error: unknown) => {
          // Revert to the pre-patch override state for this row.
          setOverrides((prev) => {
            const next = { ...prev };
            if (prevOverride) next[issueId] = prevOverride;
            else delete next[issueId];
            return next;
          });
          void error;
        });
    },
    [issues, statusesByProject, membersByProject, overrides, onPatched],
  );

  const handleDrop = useCallback(
    (targetKey: string) => {
      if (!dragKey || dragKey === targetKey) {
        setDragKey(null);
        setDragOverKey(null);
        return;
      }
      // Reorder only real (non-synthetic) columns via the shared pref store.
      const keys = COLUMN_DEFS.map((c) => c.key);
      const orderNow = columns.map((c) => c.key).filter((k) => keys.includes(k));
      const fromIdx = orderNow.indexOf(dragKey);
      const toIdx = orderNow.indexOf(targetKey);
      if (fromIdx !== -1 && toIdx !== -1) {
        const next = [...orderNow];
        next.splice(fromIdx, 1);
        next.splice(toIdx, 0, dragKey);
        colPrefs.setColumnOrder(next);
      }
      setDragKey(null);
      setDragOverKey(null);
    },
    [dragKey, columns, colPrefs],
  );

  const toggleColumnVisibility = useCallback(
    (col: string) => {
      if (colPrefs.hidden.has(col)) colPrefs.show(col);
      else colPrefs.hide(col);
    },
    [colPrefs],
  );

  return (
    <div>
      <div className="mb-2 flex items-center justify-end">
        <ColumnMenuButton
          hidden={colPrefs.hidden}
          onToggle={toggleColumnVisibility}
          onShowAll={colPrefs.showAll}
        />
      </div>

      <div className="qt-list-scroll overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table
          className="border-separate border-spacing-0 text-sm"
          style={{ tableLayout: "fixed", width: "max-content", minWidth: "100%" }}
        >
          <FilterTableHeader
            columns={columns}
            allSelected={allSelected}
            onToggleAll={onToggleAll}
            getColWidth={getColWidth}
            onResizeStart={startResize}
            onHideColumn={colPrefs.hide}
            dragKey={dragKey}
            dragOverKey={dragOverKey}
            onDragKeyChange={setDragKey}
            onDragOverKeyChange={setDragOverKey}
            onDrop={handleDrop}
          />
          <tbody>
            {loading && rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + 1}
                  className="px-3 py-8 text-center text-sm text-gray-400"
                >
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + 1}
                  className="px-3 py-8 text-center text-sm text-gray-400"
                >
                  No work items match this filter.
                </td>
              </tr>
            ) : (
              rows.map((issue) => {
                const editable = isEditable(issue);
                const projectId = issue.project?.id ?? "";
                const isSelected = selectedIds.has(issue.id);
                const statuses = statusesByProject[projectId] ?? [];
                const members: ProjectMember[] = membersByProject[projectId] ?? [];
                return (
                  <tr
                    key={issue.id}
                    className={`border-b border-gray-100 hover:bg-blue-50/40 ${isSelected ? "bg-blue-50/60" : ""}`}
                  >
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onToggleRow(issue.id)}
                        disabled={!editable}
                        className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-400 disabled:opacity-30"
                        aria-label={`Select ${issue.key}`}
                      />
                    </td>
                    {columns.map((col) => {
                      if (col.key === PROJECT_COL.key) {
                        return (
                          <td
                            key={col.key}
                            className="px-3 py-2 align-middle"
                            style={cellStyle(getColWidth(col.key))}
                          >
                            <span className="truncate text-xs text-gray-600">
                              {issue.project?.name ?? "—"}
                            </span>
                          </td>
                        );
                      }
                      return (
                        <td
                          key={col.key}
                          className="px-3 py-2 align-middle"
                          style={cellStyle(getColWidth(col.key))}
                        >
                          {editable ? (
                            col.render(asListIssue(issue), {
                              projectId,
                              onOpenIssue,
                              statuses,
                              members,
                              onPatchIssue: handlePatchIssue,
                            })
                          ) : (
                            <ReadOnlyCell issue={issue} colKey={col.key} onOpenIssue={onOpenIssue} />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
