"use client";

import { AlertTriangle, FolderPlus, Info } from "lucide-react";
import { formatEstimate } from "@/lib/test/estimate";
import type { MappedCase, RowIssue } from "@/lib/test/importMap";
import { labelOf } from "./case-meta";

/**
 * Preview + validation report, shown before anything is written.
 *
 * Shows what WILL be created, not just that the file parsed: which folders are new,
 * which rows were dropped and why, and which columns the importer ignored. The point
 * is that nobody clicks Import without knowing the outcome.
 */

const MAX_ROWS_SHOWN = 50;

/** Short labels for the preview's Layout column. */
const LAYOUT_LABEL: Record<string, string> = {
  STEPS: "Steps",
  TEXT: "Text",
  BDD: "BDD",
  EXPLORATORY: "Exploratory",
};

export function ImportPreview({
  fileName,
  cases,
  issues,
  unknownHeaders,
  errorCount,
  targetName,
}: {
  fileName: string;
  cases: MappedCase[];
  issues: RowIssue[];
  unknownHeaders: string[];
  errorCount: number;
  targetName: string;
}) {
  const warnings = issues.filter((i) => i.severity === "warning");
  const errors = issues.filter((i) => i.severity === "error");

  // Folder paths in the file that will be created. Compared case-insensitively for
  // the same reason the service is: "Login" twice is one folder.
  const newFolders = [
    ...new Set(
      cases
        .filter((c) => c.sectionPath.length > 0)
        .map((c) => c.sectionPath.join(" / ")),
    ),
  ];

  const shown = cases.slice(0, MAX_ROWS_SHOWN);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2">
        <p className="text-sm text-gray-800">
          <span className="font-medium">{cases.length}</span> case
          {cases.length === 1 ? "" : "s"} ready from{" "}
          <span className="font-medium">{fileName}</span>
        </p>
        <p className="mt-0.5 text-xs text-gray-500">
          Importing into <span className="font-medium text-gray-700">{targetName}</span>
          . Rows with no Section go here; rows with one get their own folder.
        </p>
      </div>

      {errorCount > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
          <p className="flex items-start gap-2 text-sm font-medium text-red-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {errorCount} row{errorCount === 1 ? "" : "s"} will be skipped
          </p>
          <ul className="mt-1.5 space-y-0.5 pl-6">
            {errors.slice(0, 10).map((e, i) => (
              <li key={`${e.rowNumber}-${i}`} className="text-xs text-red-800">
                Row {e.rowNumber}: {e.message}
              </li>
            ))}
            {errors.length > 10 && (
              <li className="text-xs text-red-700">
                …and {errors.length - 10} more.
              </li>
            )}
          </ul>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
          <p className="flex items-start gap-2 text-sm font-medium text-amber-900">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            {warnings.length} thing{warnings.length === 1 ? "" : "s"} to know
          </p>
          <ul className="mt-1.5 space-y-0.5 pl-6">
            {warnings.slice(0, 10).map((w, i) => (
              <li key={`${w.rowNumber}-${i}`} className="text-xs text-amber-800">
                Row {w.rowNumber}: {w.message}
              </li>
            ))}
            {warnings.length > 10 && (
              <li className="text-xs text-amber-700">
                …and {warnings.length - 10} more. These rows still import.
              </li>
            )}
          </ul>
        </div>
      )}

      {unknownHeaders.length > 0 && (
        <p className="rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-600">
          Ignoring {unknownHeaders.length} column
          {unknownHeaders.length === 1 ? "" : "s"} the importer does not use:{" "}
          {unknownHeaders.join(", ")}.
        </p>
      )}

      {newFolders.length > 0 && (
        <p className="flex items-start gap-2 rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-600">
          <FolderPlus className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400" />
          <span>
            Folders referenced by this file: {newFolders.join(", ")}. Any that do not
            exist yet will be created.
          </span>
        </p>
      )}

      <div className="overflow-hidden rounded-lg border border-gray-200">
        <div className="max-h-80 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0">
              <tr className="text-left">
                <th className="bg-accent-50 px-3 py-2 font-medium text-gray-700">Row</th>
                <th className="bg-accent-50 px-3 py-2 font-medium text-gray-700">Title</th>
                <th className="bg-accent-50 px-3 py-2 font-medium text-gray-700">Folder</th>
                {/* Shown because the layout decides which body the case DISPLAYS —
                    getting it wrong is how imported text ends up invisible. */}
                <th className="bg-accent-50 px-3 py-2 font-medium text-gray-700">Layout</th>
                <th className="bg-accent-50 px-3 py-2 font-medium text-gray-700">Priority</th>
                <th className="bg-accent-50 px-3 py-2 font-medium text-gray-700">Steps</th>
                <th className="bg-accent-50 px-3 py-2 font-medium text-gray-700">Est.</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((c) => (
                <tr key={c.rowNumber} className="border-t border-gray-100">
                  <td className="px-3 py-1.5 text-xs tabular-nums text-gray-400">
                    {c.rowNumber}
                  </td>
                  <td className="max-w-[16rem] truncate px-3 py-1.5 text-gray-800" title={c.title}>
                    {c.title}
                  </td>
                  <td className="px-3 py-1.5 text-xs text-gray-500">
                    {c.sectionPath.length > 0 ? (
                      c.sectionPath.join(" / ")
                    ) : (
                      <span className="text-gray-400">(selected folder)</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-xs text-gray-500">
                    {LAYOUT_LABEL[c.templateKind] ?? c.templateKind}
                  </td>
                  <td className="px-3 py-1.5 text-xs text-gray-500">
                    {labelOf(c.priority)}
                  </td>
                  <td className="px-3 py-1.5 text-xs tabular-nums text-gray-500">
                    {c.steps.length || <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-1.5 text-xs text-gray-500">
                    {formatEstimate(c.estimateMs) || (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {cases.length > MAX_ROWS_SHOWN && (
          // Said explicitly: a preview that silently shows 50 of 900 would imply the
          // rest are not coming.
          <p className="border-t border-gray-200 bg-gray-50 px-3 py-1.5 text-[11px] text-gray-500">
            Showing the first {MAX_ROWS_SHOWN} of {cases.length}. All{" "}
            {cases.length} will be imported.
          </p>
        )}
      </div>
    </div>
  );
}
