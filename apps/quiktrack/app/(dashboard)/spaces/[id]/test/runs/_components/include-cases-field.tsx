"use client";

import { Field } from "@quikit/ui";
import { useApiData } from "@/lib/hooks/useApiData";
import type { SectionNode, TestCaseRow } from "../../_components/case-meta";
import { CasePicker } from "./case-picker";

/**
 * The "Include test cases" group of the new-run panel (QUIKTR-337).
 *
 * Split out of `new-run-panel.tsx` to keep it under the 300-line ceiling in
 * apps/quiktrack/CLAUDE.md. Owns the case fetch too, so the whole-suite path
 * never pays for it.
 */

/** The list endpoint's max pageSize (see listTestCasesSchema). */
const CASE_PAGE = 200;

export type IncludeMode = "suite" | "pick";

interface IncludeCasesFieldProps {
  open: boolean;
  projectId: string;
  suiteId: string;
  sections: SectionNode[];
  mode: IncludeMode;
  onMode: (mode: IncludeMode) => void;
  selected: Set<string>;
  onSelected: (next: Set<string>) => void;
  disabled?: boolean;
}

export function IncludeCasesField({
  open,
  projectId,
  suiteId,
  sections,
  mode,
  onMode,
  selected,
  onSelected,
  disabled,
}: IncludeCasesFieldProps) {
  const { data: casePage } = useApiData<{ items: TestCaseRow[]; total: number }>(
    ["quiktrack", "test-cases", "picker", suiteId],
    open && mode === "pick" && suiteId
      ? `/api/test/cases?projectId=${projectId}&suiteId=${suiteId}&pageSize=${CASE_PAGE}`
      : null,
  );

  const cases = casePage?.items ?? [];
  // The endpoint caps pageSize at 200. Say so rather than showing a tree that
  // quietly omits cases — "select all" on a truncated tree would build a run
  // that silently misses the rest.
  const truncated = (casePage?.total ?? 0) > cases.length;

  const OPTIONS: Array<[IncludeMode, string]> = [
    ["suite", "All cases in this suite"],
    ["pick", "Select specific cases"],
  ];

  return (
    <Field label="Include test cases">
      <div className="space-y-2">
        <div className="flex gap-2">
          {OPTIONS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => onMode(value)}
              className={`rounded border px-3 py-1.5 text-sm ${
                mode === value
                  ? "border-accent-600 bg-accent-50 font-medium text-accent-700"
                  : "border-gray-300 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === "pick" &&
          (!suiteId ? (
            <p className="text-sm text-gray-500">Choose a suite first.</p>
          ) : (
            <>
              {truncated && (
                <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Showing the first {cases.length} of {casePage?.total} cases. To
                  include the rest, run the whole suite instead.
                </p>
              )}
              <CasePicker
                sections={sections}
                cases={cases}
                selected={selected}
                onChange={onSelected}
                disabled={disabled}
              />
            </>
          ))}
      </div>
    </Field>
  );
}
