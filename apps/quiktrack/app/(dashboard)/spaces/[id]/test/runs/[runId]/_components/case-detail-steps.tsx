"use client";

import { layoutFor } from "@/lib/test/caseLayout";
import type { TestDetail } from "./runner-types";

/**
 * The Steps list (as pinned to the test's caseVersion) plus the "no snapshot"
 * fallback notice. Split from `case-detail-pane.tsx`, which passed the 300-line
 * ceiling in apps/quiktrack/CLAUDE.md once every field became editable
 * (QUIKTR-341). Read-only here by design — see case-detail-pane.tsx's file
 * comment for why steps are edited via the full CaseEditorPanel, not inline.
 */
export function CaseDetailSteps({ detail }: { detail: TestDetail }) {
  // A TEXT / BDD case has no step grid — its procedure lives in the case-level
  // Expected Result field (authored under the "Steps"-labelled section for the
  // Text template). The runner previously showed only structured steps, so a
  // Text case read as "no recorded steps" even when a body was written. Surface
  // that body under the Steps heading for those templates.
  const { showSteps } = layoutFor(detail.case.templateKind);
  const textBody = detail.case.expectedResult?.trim() ?? "";
  if (!showSteps) {
    return (
      <div className="mt-4">
        <h3 className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
          Steps
        </h3>
        {textBody ? (
          <p className="mt-2 whitespace-pre-line text-sm text-gray-800">
            {textBody}
          </p>
        ) : (
          <p className="mt-2 text-sm text-gray-500">
            This case has no recorded steps — record an overall result below.
          </p>
        )}
      </div>
    );
  }

  return (
    <>
      {detail.stepsSource === "live" && detail.steps.length > 0 && (
        <p className="mt-4 rounded border border-gray-200 bg-gray-50 px-2.5 py-2 text-xs text-gray-600">
          No stored snapshot for version {detail.caseVersion}, so the case&apos;s
          current steps are shown.
        </p>
      )}

      <div className="mt-4">
        <h3 className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
          Steps
        </h3>

        {detail.steps.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">
            This case has no recorded steps — record an overall result below.
          </p>
        ) : (
          <ol className="mt-2 divide-y divide-gray-100 border-y border-gray-100">
            {detail.steps.map((step, index) => (
              <li key={index} className="py-2">
                <p className="text-[11px] font-medium text-gray-400">
                  Step {step.orderNo}
                </p>
                <p className="mt-0.5 whitespace-pre-line text-sm text-gray-800">
                  {step.action}
                </p>
                {step.expected && (
                  <p className="mt-0.5 whitespace-pre-line text-xs text-gray-500">
                    {step.expected}
                  </p>
                )}
              </li>
            ))}
          </ol>
        )}
      </div>
    </>
  );
}
