"use client";

import { InlineText } from "./inline-cell";
import type { InlinePatch } from "./inline-cell-types";

/**
 * The Title cell of the case grid.
 *
 * Split from `case-table.tsx`, which passed the 300-line ceiling in
 * apps/quiktrack/CLAUDE.md once inline editing landed.
 *
 * The version badge sits beside the title rather than inside the editable span, so
 * clicking "v3" does not start an edit — and so the badge stays put while the input is
 * open.
 */
export function CaseTitleCell({
  caseId,
  title,
  currentVersion,
  onInlineEdit,
}: {
  caseId: string;
  title: string;
  currentVersion: number;
  /** Omit for a read-only grid. */
  onInlineEdit?: (caseId: string, patch: InlinePatch) => Promise<boolean>;
}) {
  const badge =
    currentVersion > 1 ? (
      <span
        className="shrink-0 text-[11px] text-gray-400"
        title={`Version ${currentVersion}. Inline edits do not create a new version.`}
      >
        v{currentVersion}
      </span>
    ) : null;

  if (!onInlineEdit) {
    return (
      <>
        <span className="text-gray-900 hover:underline">{title}</span>
        {badge && <span className="ml-2">{badge}</span>}
      </>
    );
  }

  return (
    <span className="flex items-center gap-2">
      <InlineText
        value={title}
        className="text-gray-900"
        onSave={(next) => onInlineEdit(caseId, { title: next })}
      />
      {badge}
    </span>
  );
}
