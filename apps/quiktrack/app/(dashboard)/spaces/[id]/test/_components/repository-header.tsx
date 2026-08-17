"use client";

import Link from "next/link";
import { Plus, Upload } from "lucide-react";
import { Button } from "@quikit/ui";

/**
 * Header for the Tests page: the Cases/Runs tabs plus the create + import actions.
 *
 * Split from `repository-view.tsx`, which passed the 300-line ceiling in
 * apps/quiktrack/CLAUDE.md once Import landed.
 *
 * "Test cases" and "Test runs" are TABS rather than a heading plus a link, because
 * they are two places in the module, not an action on the current one.
 */
export function RepositoryHeader({
  projectId,
  canCreate,
  hasSuites,
  onCreate,
  onImport,
}: {
  projectId: string;
  canCreate: boolean;
  /** With no suite there is nowhere to put a case, so the actions are hidden. */
  hasSuites: boolean;
  onCreate: () => void;
  onImport: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-4 py-2.5">
      <nav className="flex items-center gap-1">
        <span className="rounded-md bg-accent-50 px-2.5 py-1.5 text-[13px] font-medium text-accent-800">
          Test cases
        </span>
        <Link
          href={`/spaces/${projectId}/test/runs`}
          className="rounded-md px-2.5 py-1.5 text-[13px] text-gray-600 hover:bg-gray-50 hover:text-gray-900"
        >
          Test runs
        </Link>
      </nav>

      {/* Hidden with no suites: the empty state's own button is then the single call
          to action, so the two no longer compete. */}
      {canCreate && hasSuites && (
        <div className="flex items-center gap-2">
          {/* Import sits beside New test case and inherits the CURRENT suite and
              folder from the tree selection — nothing to re-pick. */}
          <Button size="sm" variant="outline" onClick={onImport}>
            <Upload className="mr-1 h-4 w-4" />
            Import test cases
          </Button>
          <Button
            size="sm"
            className="bg-accent-600 text-white hover:bg-accent-700"
            onClick={onCreate}
          >
            <Plus className="mr-1 h-4 w-4" />
            New test case
          </Button>
        </div>
      )}
    </div>
  );
}
