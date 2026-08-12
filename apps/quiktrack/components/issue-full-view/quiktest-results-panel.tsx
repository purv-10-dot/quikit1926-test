"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MoreHorizontal } from "lucide-react";
import { Skeleton } from "@quikit/ui";
import { RunSummary } from "@/components/test/run-summary";
import type { StatusCounts } from "@/lib/test/statuses";
import {
  SimpleRow,
  TestRow,
  type PanelTestRow,
} from "./quiktest-panel-rows";

/**
 * "QuikTest: Results" — the test-management panel on a work item.
 *
 * Mirrors the TestRail-for-Jira panel: a six-tab strip over the tests, cases,
 * runs, plans and milestones related to this work item, a status donut, and rows
 * that expand to Project / Milestone / Test Run.
 *
 * "Related" means two things at once — cases that COVER this issue as a
 * requirement, and results that RAISED it as a defect. One endpoint resolves
 * both (see app/api/test/issues/[key]/results).
 */

const TABS = [
  { key: "all", label: "All Results" },
  { key: "tests", label: "Tests" },
  { key: "cases", label: "Cases" },
  { key: "runs", label: "Runs" },
  { key: "plans", label: "Plans" },
  { key: "milestones", label: "Milestones" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

interface CaseRow {
  id: string;
  refId: number;
  title: string;
  priority: string;
  type: string;
  approvalState: string;
  automationId: string | null;
}

interface RunRow {
  id: string;
  refId: number;
  name: string;
  state: string;
  source: string;
  build: string | null;
  milestone: { id: string; name: string } | null;
  plan: { id: string; name: string } | null;
}

interface GroupRow {
  id: string;
  name: string;
  state?: string;
  dueDate?: string | null;
}

interface PanelResponse {
  issueKey: string;
  tab: TabKey;
  items: unknown[];
  total: number;
  page: number;
  pageSize: number;
  counts: StatusCounts;
}

async function fetchPanel(
  issueKey: string,
  tab: TabKey,
  page: number,
): Promise<PanelResponse> {
  const res = await fetch(
    `/api/test/issues/${encodeURIComponent(issueKey)}/results?tab=${tab}&page=${page}`,
  );
  const json = (await res.json()) as {
    success: boolean;
    data?: PanelResponse;
    error?: string;
  };
  if (!res.ok || !json.success || !json.data) {
    throw new Error(json.error ?? "Failed to load test results");
  }
  return json.data;
}

export function QuikTestResultsPanel({
  issueKey,
  projectId,
}: {
  issueKey: string;
  projectId: string;
}) {
  const [hidden, setHidden] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [tab, setTab] = useState<TabKey>("all");
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["quiktrack", "issue-test-results", issueKey, tab, page],
    queryFn: () => fetchPanel(issueKey, tab, page),
    staleTime: 30_000,
  });

  if (hidden) return null;

  const projectHref = `/spaces/${projectId}`;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const hasCounts = data ? Object.keys(data.counts).length > 0 : false;

  const changeTab = (next: TabKey) => {
    setTab(next);
    setPage(1);
    setExpandedId(null);
  };

  return (
    <div className="mb-5">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          QuikTest: Results
        </h3>
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 dark:hover:bg-gray-700"
            aria-label="Panel actions"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 z-10 mt-1 w-56 rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800">
              <p className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                Actions
              </p>
              <button
                type="button"
                onClick={() => {
                  setHidden(true);
                  setMenuOpen(false);
                }}
                className="block w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                Hide QuikTest: Results
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 dark:border-gray-700">
        <div className="flex flex-wrap items-center justify-end gap-1 border-b border-gray-200 px-2 py-1.5 dark:border-gray-700">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => changeTab(t.key)}
              className={`rounded px-2 py-1 text-xs ${
                tab === t.key
                  ? "bg-slate-700 font-medium text-white"
                  : "text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {isLoading && (
          <div className="space-y-2 p-3">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-16 w-full" />
          </div>
        )}

        {isError && (
          <p className="px-3 py-4 text-sm text-gray-500">
            Could not load test results for this work item.
          </p>
        )}

        {data && !isLoading && (
          <>
            {hasCounts && (tab === "all" || tab === "runs" || tab === "tests") && (
              <div className="border-b border-gray-200 px-3 py-3 dark:border-gray-700">
                <RunSummary counts={data.counts} size="sm" />
              </div>
            )}

            {data.items.length === 0 ? (
              <p className="px-3 py-4 text-sm text-gray-500">
                No linked test {tab === "all" ? "results" : tab} for this work
                item. Link a test case to it as coverage, or a failed result as a
                defect.
              </p>
            ) : (
              <div>
                {(tab === "all" || tab === "tests") &&
                  (data.items as PanelTestRow[]).map((row) => (
                    <TestRow
                      key={row.id}
                      row={row}
                      expanded={expandedId === row.id}
                      onToggle={() =>
                        setExpandedId(expandedId === row.id ? null : row.id)
                      }
                      projectHref={projectHref}
                    />
                  ))}

                {tab === "cases" &&
                  (data.items as CaseRow[]).map((c) => (
                    <SimpleRow
                      key={c.id}
                      left={`TC-${c.refId}`}
                      title={c.title}
                      href={`${projectHref}/test`}
                      meta={c.automationId ? "automated" : null}
                      pill={{ statusKey: "", label: c.approvalState }}
                    />
                  ))}

                {tab === "runs" &&
                  (data.items as RunRow[]).map((r) => (
                    <SimpleRow
                      key={r.id}
                      left={`R${r.refId}`}
                      title={r.name}
                      href={`${projectHref}/test/runs/${r.id}`}
                      meta={r.build ? `build ${r.build}` : r.source}
                      pill={{ statusKey: "", label: r.state }}
                    />
                  ))}

                {(tab === "plans" || tab === "milestones") &&
                  (data.items as GroupRow[]).map((g) => (
                    <SimpleRow
                      key={g.id}
                      left={tab === "plans" ? "Plan" : "M"}
                      title={g.name}
                      meta={g.state ?? null}
                    />
                  ))}
              </div>
            )}

            {totalPages > 1 && (
              <div className="flex items-center justify-end gap-1 border-t border-gray-200 px-3 py-1.5 text-xs dark:border-gray-700">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded px-1.5 py-0.5 text-gray-500 hover:bg-gray-100 disabled:opacity-40 dark:hover:bg-gray-700"
                >
                  « Prev
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setPage(n)}
                    className={`rounded px-1.5 py-0.5 ${
                      n === page
                        ? "font-semibold text-gray-900 dark:text-gray-100"
                        : "text-blue-700 hover:bg-gray-100 dark:text-blue-400 dark:hover:bg-gray-700"
                    }`}
                  >
                    {n}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="rounded px-1.5 py-0.5 text-gray-500 hover:bg-gray-100 disabled:opacity-40 dark:hover:bg-gray-700"
                >
                  Next »
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
