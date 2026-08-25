"use client";

import { useState } from "react";
import { AlertTriangle, Pencil, X } from "lucide-react";
import { caseRef } from "../../../_components/case-meta";
import type { MemberOption } from "../../../_components/use-project-members";
import { CaseEditorPanel } from "../../../_components/case-editor-panel";
import { CaseDetailFieldsGrid } from "./case-detail-fields-grid";
import { CaseDetailSteps } from "./case-detail-steps";
import { RunnerLabelCell } from "./runner-label-cell";
import { ResultHistory } from "./result-history";
import { testRef, type TestDetail, type TestStatusLite } from "./runner-types";

/**
 * Right pane — the case's live detail. QUIKTR-341 ("enable edit") made every
 * field here editable, matching what the grid already allows:
 *
 *  - Type, Priority, Status: inline dropdowns, same pattern as the grid's own
 *    cells — see `case-detail-fields-grid.tsx`. A change from either surface
 *    (grid row or this panel) is indistinguishable to the server.
 *  - Labels: the same compact picker the grid's Labels cell uses
 *    (`RunnerLabelCell`), so attach/detach behaves identically everywhere.
 *  - Steps / Preconditions / Description: NOT edited inline here. These are the
 *    case's full body, and editing them safely needs the step-array editor,
 *    template-aware layout, and version-bump logic that already exists in
 *    `CaseEditorPanel` (the case repository's own editor) — duplicating that
 *    inside a 320px card would be a second, narrower place for the same class
 *    of bug. An "Edit case" button opens that exact panel as a slide-over
 *    instead. Saving there mints a new case version, same as it does from the
 *    case repository — the pinned run keeps showing what it actually executed
 *    (see `caseHasNewerVersion` below), only the LIVE case moves forward.
 *
 * Renders nothing when there is no detail to show — the panel has a real ×
 * close (see use-runner-data.ts's `panelClosed`), so "nothing selected" means
 * the grid gets the full width back rather than a placeholder taking up a
 * whole column.
 */

interface CaseDetailPaneProps {
  detail: TestDetail | null;
  loading: boolean;
  /** Project members for the assignee picker. */
  members?: MemberOption[];
  /** Omit to hide the picker entirely (e.g. a read-only surface). */
  onReassign?: (userId: string | null) => Promise<void> | void;
  /** True on a closed run — the API refuses reassignment there. */
  assignDisabled?: boolean;
  /** True on a closed run — hides every edit affordance in this panel. */
  readOnly?: boolean;
  /** Omit to hide the × — some callers may still want an always-open pane. */
  onClose?: () => void;
  /** Type/Priority — case-level fields shared with the grid's inline edit. */
  onSetField?: (field: string, value: string) => Promise<boolean>;
  /** Status — per-test, routes through the same result-recording endpoint the
   *  grid's Status column uses. */
  onSetStatus?: (statusId: string) => Promise<boolean>;
  statuses?: TestStatusLite[];
  /** Called after a label attach/detach so the caller can refetch. */
  onLabelsChanged?: () => void;
  projectId?: string;
  /** Called after "Edit case" saves a new version. */
  onEdited?: () => void;
}

export function CaseDetailPane({
  detail,
  loading,
  members,
  onReassign,
  assignDisabled,
  readOnly,
  onClose,
  onSetField,
  onSetStatus,
  statuses,
  onLabelsChanged,
  projectId,
  onEdited,
}: CaseDetailPaneProps) {
  const [editing, setEditing] = useState(false);

  // Sizing, border, and scroll are all owned by the CARD WRAPPER in
  // runner-view.tsx (the reference UI treats this as its own card, not a
  // column with an inner divider) — this component only supplies padding and
  // content.
  if (loading) {
    return <div className="p-6 text-sm text-gray-400">Loading test…</div>;
  }

  if (!detail) return null;

  return (
    <div className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-gray-900">{detail.case.title}</h2>
          <p className="mt-0.5 text-[11px] text-gray-400">
            {testRef(detail.refId)} · {caseRef(detail.case.refId)}
            {detail.config && ` · ${detail.config.name}`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {!readOnly && projectId && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              aria-label="Edit case"
              title="Edit steps, preconditions, and description"
              className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {detail.caseHasNewerVersion && (
        <p className="mt-3 flex items-start gap-2 rounded border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            Pinned to version {detail.caseVersion}; the case is now version{" "}
            {detail.case.currentVersion}. Execute these steps, not the newer ones.
          </span>
        </p>
      )}

      <CaseDetailFieldsGrid
        detail={detail}
        members={members}
        onReassign={onReassign}
        assignDisabled={assignDisabled}
        onSetField={onSetField}
        onSetStatus={onSetStatus}
        statuses={statuses}
        canEditField={Boolean(onSetField) && !readOnly}
        canEditStatus={Boolean(onSetStatus) && !readOnly}
      />

      <div className="mt-4">
        <div className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
          Labels
        </div>
        <div className="mt-1">
          {onLabelsChanged && projectId && !readOnly ? (
            <RunnerLabelCell
              caseId={detail.case.id}
              projectId={projectId}
              labels={detail.case.labels}
              onChanged={onLabelsChanged}
            />
          ) : detail.case.labels.length === 0 ? (
            <span className="text-xs text-gray-300">—</span>
          ) : (
            <div className="flex flex-wrap gap-1">
              {detail.case.labels.map((l) => (
                <span
                  key={l.id}
                  className="rounded px-1.5 py-0.5 text-[11px]"
                  style={
                    l.color
                      ? { backgroundColor: `${l.color}20`, color: l.color }
                      : { backgroundColor: "#f3f4f6", color: "#4b5563" }
                  }
                >
                  {l.name}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {detail.case.preconditions && (
        <div className="mt-4">
          <h3 className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
            Preconditions
          </h3>
          <p className="mt-1 whitespace-pre-line text-sm text-gray-700">
            {detail.case.preconditions}
          </p>
        </div>
      )}

      {detail.case.description && (
        <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-gray-700">
          {detail.case.description}
        </p>
      )}

      <CaseDetailSteps detail={detail} />

      <ResultHistory testId={detail.id} />

      {projectId && (
        <CaseEditorPanel
          open={editing}
          onClose={() => setEditing(false)}
          caseId={detail.case.id}
          // null: sectionId is only consulted on CREATE, and this is always an
          // edit (caseId is non-null) — see use-case-form.ts.
          sectionId={null}
          projectId={projectId}
          onSaved={() => {
            setEditing(false);
            onEdited?.();
          }}
        />
      )}
    </div>
  );
}
