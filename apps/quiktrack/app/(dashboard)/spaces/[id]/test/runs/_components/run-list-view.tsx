"use client";

import { useState } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ClipboardList, Plus } from "lucide-react";
import { Button, EmptyState, TableSkeleton } from "@quikit/ui";
import { useApiData } from "@/lib/hooks/useApiData";
import { useMyProjectPermissions } from "@/lib/hooks/useMyProjectPermissions";
import { passRate, totalTests, type StatusCounts } from "@/lib/test/statuses";
import { NewRunPanel } from "./new-run-panel";

/**
 * Runs list — the way into the runner.
 *
 * Shows pass rate per run computed with the SAME helpers the runner and the
 * work-item panel use, so a number never differs between screens.
 */

interface RunRow {
  id: string;
  refId: number;
  name: string;
  source: string;
  state: string;
  build: string | null;
  environment: string | null;
  createdAt: string;
  closedAt: string | null;
  testCount: number;
  counts: StatusCounts;
}

export function RunListView({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const perms = useMyProjectPermissions(projectId);
  const canCreate = perms.loading || perms.has("TestRun", "create");
  const [panelOpen, setPanelOpen] = useState(false);

  const runsKey = ["quiktrack", "test-runs", projectId] as const;
  const { data, isLoading } = useApiData<{ items: RunRow[]; total: number }>(
    runsKey,
    `/api/test/runs?projectId=${projectId}`,
    { staleTime: 0 },
  );

  const runs = data?.items ?? [];

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-3 border-b border-gray-200 px-4 py-3">
        <div>
          <Link
            href={`/spaces/${projectId}/test`}
            className="mb-1 inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800"
          >
            <ArrowLeft className="h-3 w-3" />
            Test cases
          </Link>
          <h1 className="text-base font-semibold text-gray-900">Test runs</h1>
          <p className="text-xs text-gray-500">
            Each run is an immutable record of one execution pass.
          </p>
        </div>
        {canCreate && (
          <Button
            size="sm"
            className="bg-accent-600 text-white hover:bg-accent-700"
            onClick={() => setPanelOpen(true)}
          >
            <Plus className="mr-1 h-4 w-4" />
            New run
          </Button>
        )}
      </div>

      <div className="flex-1 overflow-auto">
        {isLoading ? (
          <div className="p-4">
            <TableSkeleton rows={5} cols={5} />
          </div>
        ) : runs.length === 0 ? (
          <div className="p-8">
            <EmptyState
              icon={ClipboardList}
              title="No test runs yet"
              message="Create a run from a suite or a selection of cases, then record results against it."
              action={
                canCreate
                  ? { label: "New run", onClick: () => setPanelOpen(true) }
                  : undefined
              }
            />
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0">
              <tr className="text-left">
                <th className="bg-accent-50 px-4 py-2 font-medium text-gray-700">Run</th>
                <th className="bg-accent-50 px-4 py-2 font-medium text-gray-700">Name</th>
                <th className="bg-accent-50 px-4 py-2 font-medium text-gray-700">Source</th>
                <th className="bg-accent-50 px-4 py-2 font-medium text-gray-700">Tests</th>
                <th className="bg-accent-50 px-4 py-2 font-medium text-gray-700">Passed</th>
                <th className="bg-accent-50 px-4 py-2 font-medium text-gray-700">State</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => {
                const total = totalTests(run.counts);
                return (
                  <tr
                    key={run.id}
                    className="border-b border-gray-100 hover:bg-blue-50"
                  >
                    <td className="whitespace-nowrap px-4 py-2 text-gray-900">
                      R{run.refId}
                    </td>
                    <td className="px-4 py-2">
                      <Link
                        href={`/spaces/${projectId}/test/runs/${run.id}`}
                        className="text-gray-900 hover:underline"
                      >
                        {run.name}
                      </Link>
                      {run.build && (
                        <span className="ml-2 text-[11px] text-gray-400">
                          build {run.build}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-gray-500">
                      {run.source}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-gray-500">
                      {run.testCount}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-gray-700">
                      {total === 0 ? "—" : `${passRate(run.counts)}%`}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                          run.state === "closed"
                            ? "bg-gray-100 text-gray-600"
                            : "bg-green-100 text-green-800"
                        }`}
                      >
                        {run.state}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <NewRunPanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        projectId={projectId}
        onCreated={() => {
          void queryClient.invalidateQueries({ queryKey: runsKey });
        }}
      />
    </div>
  );
}
