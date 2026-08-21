"use client";

import { useState } from "react";
import { useProjectMembers } from "../../../_components/use-project-members";
import Link from "next/link";
import { ArrowLeft, Lock, Unlock } from "lucide-react";
import { Button } from "@quikit/ui";
import { RunSummary } from "@/components/test/run-summary";
import { CaseDetailPane } from "./case-detail-pane";
import { RunTabPanels } from "./run-tab-panels";
import { RunTabs, type RunTab } from "./run-tabs";
import { useRunnerData } from "./use-runner-data";
import { runRef } from "./runner-types";

/**
 * The runner: a TestRail-style GRID (QUIKTR-341) → case detail on row click.
 *
 * Status, Assigned To, Priority and Labels are inline-editable columns in the
 * grid itself — there is no separate result-entry form or Untested/Failed/Mine
 * filter chips (dropped, not relocated; see WAVE1_REMEDIATION_LOG.md). Picking a
 * status records a result immediately with no comment/elapsed time, matching the
 * reference UI. Keyboard shortcuts (1-5 to record, j/k to move) still act on
 * whichever row was last clicked open (`activeTestId`) exactly as before.
 *
 * All data-fetching and mutation logic lives in `use-runner-data.ts` — this file
 * is JSX and header chrome only.
 */

interface RunnerViewProps {
  projectId: string;
  runId: string;
}

export function RunnerView({ projectId, runId }: RunnerViewProps) {
  const [tab, setTab] = useState<RunTab>("tests");
  const { members: memberList } = useProjectMembers(projectId);
  const d = useRunnerData({ runId, tab });

  return (
    <div className="flex h-full flex-col p-4">
      <Link
        href={`/spaces/${projectId}/test/runs`}
        className="mb-3 inline-flex w-fit items-center gap-1 text-xs text-gray-500 hover:text-gray-800"
      >
        <ArrowLeft className="h-3 w-3" />
        Test runs
      </Link>

      {/* QUIKTR-341 — the reference UI frames the whole run (header, summary,
          tabs, grid) as ONE bordered card, with the detail panel as a SEPARATE
          card beside it. Previously everything sat flat edge-to-edge with no
          visual containment at all, which read as an unfinished layout rather
          than a cramped detail panel — the panel wasn't too narrow, it just
          wasn't framed as a panel. */}
      <div className="flex min-h-0 flex-1 gap-4">
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold text-gray-900 dark:text-gray-100">
                {d.run ? `${runRef(d.run.refId)} · ${d.run.name}` : "Loading run…"}
              </h1>
              {d.run && (
                <p className="text-xs text-gray-500">
                  {d.run.source}
                  {d.run.build ? ` · build ${d.run.build}` : ""}
                  {d.run.environment ? ` · ${d.run.environment}` : ""}
                  {/* Run owner. Individual tests are assigned separately, so
                      this is who owns the run, not who executes each case. */}
                  {d.run.owner
                    ? ` · owner ${`${d.run.owner.firstName} ${d.run.owner.lastName}`.trim()}`
                    : ""}
                  {d.run.state === "closed" ? " · closed" : ""}
                </p>
              )}
            </div>

            {d.run && (
              <Button
                size="sm"
                variant="outline"
                onClick={d.toggleRunState}
                className="shrink-0"
              >
                {d.run.state === "closed" ? (
                  <>
                    <Unlock className="mr-1 h-3.5 w-3.5" />
                    Reopen run
                  </>
                ) : (
                  <>
                    <Lock className="mr-1 h-3.5 w-3.5" />
                    Close run
                  </>
                )}
              </Button>
            )}
          </div>

          {d.run && Object.keys(d.run.counts).length > 0 && (
            <div className="border-b border-gray-200 dark:border-gray-700 px-4 py-3">
              <RunSummary counts={d.run.counts} size="sm" />
            </div>
          )}

          {/* QUIKTR-339 — tabs rather than routes: the header above stays put
              across all three, and routing would remount it and lose the
              selected test on every switch. */}
          <RunTabs active={tab} onChange={setTab} />

          <RunTabPanels
            tab={tab}
            projectId={projectId}
            runId={runId}
            run={d.run}
            tests={d.tests}
            testsTotal={d.testsTotal}
            testsLoading={d.testsLoading}
            activeTestId={d.activeTestId}
            onOpenDetail={d.openTest}
            statuses={d.statuses}
            members={memberList}
            onSetStatus={(testId, statusId) => d.submitResult(testId, { statusId })}
            onReassign={d.reassign}
            onSetCaseField={d.setCaseField}
            onLabelsChanged={d.onLabelsChanged}
            sort={d.sort}
            onSortChange={d.setSort}
            filters={d.filters}
            onSetFilter={d.setFilter}
            onClearFilters={d.clearFilters}
            activity={d.activity}
            activityLoading={d.activityLoading}
          />

          {tab === "tests" && (
            <div className="border-t border-gray-200 dark:border-gray-700 px-4 py-1.5 text-[11px] text-gray-400 dark:text-gray-500">
              Shortcuts: 1 Passed · 2 Failed · 3 Blocked · 4 Retest · 5 Skipped
              · j/k to move
            </div>
          )}
        </div>

        {/* The detail pane's own card — a SIBLING of the main card above, not
            nested inside it, matching the reference UI's two-card layout. Only
            on the Tests tab, and only once something is actually selected: see
            case-detail-pane.tsx's `onClose` / use-runner-data.ts's
            `panelClosed` for why "nothing selected" renders nothing rather
            than an empty card taking up width. */}
        {tab === "tests" && (d.detail || d.detailLoading) && (
          <div className="w-80 shrink-0 overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm">
            <CaseDetailPane
              detail={d.detail}
              loading={d.detailLoading}
              members={memberList}
              onReassign={(userId) => {
                if (d.activeTestId) return d.reassign(d.activeTestId, userId);
              }}
              assignDisabled={d.run?.state === "closed"}
              readOnly={d.run?.state === "closed"}
              onClose={d.closePanel}
              onSetField={(field, value) => {
                if (!d.activeTestId || !d.detail) return Promise.resolve(false);
                return d.setCaseField(d.activeTestId, d.detail.case.id, field, value);
              }}
              onSetStatus={(statusId) =>
                d.activeTestId
                  ? d.submitResult(d.activeTestId, { statusId })
                  : Promise.resolve(false)
              }
              statuses={d.statuses}
              onLabelsChanged={d.onLabelsChanged}
              projectId={projectId}
              onEdited={d.onLabelsChanged}
            />
          </div>
        )}
      </div>
    </div>
  );
}
