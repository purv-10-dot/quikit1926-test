"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { FilterToolbar, defaultToolbarStateFor } from "./filter-toolbar";
import { TqlEditor } from "./tql-editor";
import { Pager } from "./filter-view-parts";
import { SaveFilterModal } from "./save-filter-modal";
import { BulkActionsBar, type BulkRow } from "./bulk-actions-bar";
import { EditableFilterTable, type FilterListIssue } from "./editable-filter-table";
import { useFilterResults } from "./use-filter-results";
import { useMyPermissions } from "@/lib/hooks/useMyPermissions";
import type { IssueType, Priority } from "../../../spaces/[id]/list/_components/list-types";

export function FilterView({ filterId }: { filterId: string }) {
  const [saveOpen, setSaveOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const router = useRouter();
  const perms = useMyPermissions();

  const {
    items,
    total,
    title,
    fallback,
    error,
    tqlError,
    loading,
    search,
    setSearch,
    page,
    setPage,
    pageSize,
    setPageSize,
    toolbar,
    setToolbar,
    mode,
    setMode,
    tql,
    setTql,
    refresh,
  } = useFilterResults(filterId);

  // Discovery ideas (type IDEA) live in a separate model with different bulk
  // endpoints, so they aren't bulk-selectable here — only real issues.
  const selectableItems = useMemo(() => items.filter((i) => i.type !== "IDEA" && i.project), [items]);
  const toggleRow = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allOnPageSelected =
    selectableItems.length > 0 && selectableItems.every((i) => selectedIds.has(i.id));
  const toggleAllOnPage = () =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) selectableItems.forEach((i) => next.delete(i.id));
      else selectableItems.forEach((i) => next.add(i.id));
      return next;
    });

  // Map the API rows to the table's row shape. The list-types ListIssue carries
  // a few fields the read-only view never used (sprint, subtaskCount); the API
  // now returns the editable ones, so fill what we have and default the rest.
  const tableItems: FilterListIssue[] = useMemo(
    () =>
      items.map((it) => ({
        id: it.id,
        key: it.key,
        title: it.title,
        type: it.type as IssueType,
        statusId: it.statusId ?? it.status?.id ?? "",
        status: it.status,
        priority: (it.priority || null) as Priority | null,
        parentId: it.parentId,
        epicId: it.epicId,
        sprintId: it.sprintId,
        sprint: null,
        assigneeId: it.assigneeId ?? it.assignee?.id ?? null,
        assignee: it.assignee,
        reporterId: it.reporterId ?? it.reporter?.id ?? null,
        reporter: it.reporter,
        startDate: it.startDate,
        dueDate: it.dueDate,
        storyPoints: it.storyPoints,
        eta: it.eta,
        createdAt: it.createdAt,
        updatedAt: it.updatedAt,
        subtaskCount: 0,
        project: it.project,
      })),
    [items],
  );

  const bulkRows: BulkRow[] = useMemo(
    () =>
      items
        .filter((i) => selectedIds.has(i.id) && i.project)
        .map((i) => ({
          id: i.id,
          key: i.key,
          title: i.title,
          type: i.type,
          projectId: i.project!.id,
          projectName: i.project!.name,
          statusId: i.status?.id ?? null,
        })),
    [items, selectedIds],
  );

  const saveCriteria = mode === "tql" ? { tql } : { ...toolbar, search };

  return (
    <div className="px-6 py-4">
      <div className="flex items-center gap-2 mb-3">
        <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
        <Star className="h-5 w-5 text-gray-300 hover:text-yellow-400 cursor-pointer" />
      </div>

      {saveOpen && (
        <SaveFilterModal
          criteria={saveCriteria}
          onClose={() => setSaveOpen(false)}
          onSaved={(saved) => {
            setSaveOpen(false);
            router.push(`/filters/${saved.id}`);
          }}
        />
      )}

      {fallback && (
        <div className="mb-3 flex items-start gap-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>{fallback}</span>
        </div>
      )}

      {perms.isAdmin && (
        <div className="mb-3 inline-flex rounded border border-gray-200 bg-gray-50 p-0.5 text-sm">
          <button
            type="button"
            onClick={() => setMode("basic")}
            className={`px-3 h-7 rounded ${mode === "basic" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"}`}
          >
            Basic
          </button>
          <button
            type="button"
            onClick={() => setMode("tql")}
            className={`px-3 h-7 rounded ${mode === "tql" ? "bg-white shadow-sm text-gray-900" : "text-gray-500 hover:text-gray-700"}`}
          >
            TQL
          </button>
        </div>
      )}

      {mode === "tql" && !perms.loading && !perms.isAdmin ? (
        <div className="mb-4 rounded border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800">
          This saved filter uses TQL, which requires organisation admin access.
        </div>
      ) : mode === "tql" ? (
        <TqlEditor value={tql} onChange={setTql} error={tqlError} />
      ) : (
        <FilterToolbar
          search={search}
          onSearchChange={setSearch}
          onClear={() => {
            setSearch("");
            setToolbar(defaultToolbarStateFor(filterId));
          }}
          state={toolbar}
          onChange={setToolbar}
          onSaveFilter={() => setSaveOpen(true)}
        />
      )}

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-8 text-center text-sm text-red-600">
          {error}
        </div>
      ) : (
        <EditableFilterTable
          filterId={filterId}
          issues={tableItems}
          loading={loading}
          selectedIds={selectedIds}
          onToggleRow={toggleRow}
          onToggleAll={toggleAllOnPage}
          allSelected={allOnPageSelected}
          onOpenIssue={(id) => {
            const row = items.find((i) => i.id === id);
            if (row?.project) router.push(`/spaces/${row.project.id}/work/${id}`);
          }}
          onPatched={refresh}
        />
      )}

      <BulkActionsBar
        rows={bulkRows}
        onSelectAll={toggleAllOnPage}
        onClear={() => setSelectedIds(new Set())}
        onDone={() => {
          setSelectedIds(new Set());
          refresh();
        }}
      />

      <Pager
        page={page}
        pageSize={pageSize}
        total={total}
        loading={loading}
        rowCount={items.length}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />
    </div>
  );
}
