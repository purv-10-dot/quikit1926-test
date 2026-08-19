"use client";

import { AlertTriangle } from "lucide-react";
import { caseRef, labelOf } from "../../../_components/case-meta";
import type { MemberOption } from "../../../_components/use-project-members";
import { AssigneePicker } from "./assignee-picker";
import { ResultHistory } from "./result-history";
import { testRef, type TestDetail } from "./runner-types";

/**
 * Middle pane — what the tester is meant to do.
 *
 * Renders the steps AS PINNED to this test's `caseVersion`. When the underlying
 * case has since been edited, that is stated explicitly rather than silently
 * showing older content: the tester should know the live case has moved on, but
 * still execute what the run committed to.
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
}

export function CaseDetailPane({
  detail,
  loading,
  members,
  onReassign,
  assignDisabled,
}: CaseDetailPaneProps) {
  if (loading) {
    return (
      <div className="flex-1 p-6 text-sm text-gray-400">Loading test…</div>
    );
  }

  if (!detail) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-sm text-gray-500">
        Select a test from the list to begin.
      </div>
    );
  }

  return (
    <div className="min-w-0 flex-1 overflow-y-auto p-5">
      <div className="mb-1 flex items-center gap-2 text-[11px] text-gray-400">
        <span>{testRef(detail.refId)}</span>
        <span>·</span>
        <span>{caseRef(detail.case.refId)}</span>
        <span>·</span>
        <span>version {detail.caseVersion}</span>
        {detail.config && (
          <>
            <span>·</span>
            <span>{detail.config.name}</span>
          </>
        )}
      </div>

      <h2 className="text-base font-semibold text-gray-900">
        {detail.case.title}
      </h2>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
        <span>Priority: {labelOf(detail.case.priority)}</span>
        <span>Type: {labelOf(detail.case.type)}</span>
        {detail.case.automationId && (
          <span className="font-mono">{detail.case.automationId}</span>
        )}
        {/* QUIKTR-317 — per-test assignment lives HERE, with the test's own
            metadata, rather than above the Passed/Failed buttons: whoever records
            a result is not necessarily the assignee, and a picker in the entry
            pane implied it was. */}
        {onReassign && (
          <span className="inline-flex items-center gap-1.5">
            <span>Assigned to:</span>
            <AssigneePicker
              currentId={detail.assigneeId ?? null}
              members={members ?? []}
              onChange={onReassign}
              disabled={assignDisabled}
            />
          </span>
        )}
      </div>

      {detail.caseHasNewerVersion && (
        <p className="mt-3 flex items-start gap-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            This test is pinned to version {detail.caseVersion}; the case has
            since been edited (now version {detail.case.currentVersion}). You are
            seeing what this run committed to — execute these steps, not the
            newer ones.
          </span>
        </p>
      )}

      {detail.stepsSource === "live" && detail.steps.length > 0 && (
        <p className="mt-3 rounded border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
          No stored snapshot for version {detail.caseVersion}, so the case&apos;s
          current steps are shown.
        </p>
      )}

      {detail.case.description && (
        <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-gray-700">
          {detail.case.description}
        </p>
      )}

      {detail.case.preconditions && (
        <div className="mt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Preconditions
          </h3>
          <p className="mt-1 whitespace-pre-line text-sm text-gray-700">
            {detail.case.preconditions}
          </p>
        </div>
      )}

      <div className="mt-5">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Steps
        </h3>

        {detail.steps.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">
            This case has no recorded steps — record an overall result below.
          </p>
        ) : (
          <ol className="mt-2 divide-y divide-gray-100 border-y border-gray-100">
            {detail.steps.map((step, index) => (
              <li key={index} className="flex gap-3 py-2.5">
                <span className="w-5 shrink-0 pt-0.5 text-right text-xs text-gray-400">
                  {step.orderNo}
                </span>
                <div className="grid min-w-0 flex-1 gap-1 sm:grid-cols-2 sm:gap-4">
                  <p className="whitespace-pre-line text-sm text-gray-800">
                    {step.action}
                  </p>
                  <p className="whitespace-pre-line text-sm text-gray-500">
                    {step.expected ?? "—"}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* QUIKTR-340 — the execution record for this run-case. Beneath the steps
          rather than in the entry pane: it is context for deciding an outcome, not
          part of entering one. */}
      <ResultHistory testId={detail.id} />
    </div>
  );
}
