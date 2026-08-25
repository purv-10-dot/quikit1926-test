"use client";

import { Layers } from "lucide-react";

/**
 * First-run state for the case repository — no suite exists yet. Explains the
 * two concepts in order rather than leaving one sentence floating in an empty
 * pane. Extracted from `repository-view.tsx`, which passed the 300-line
 * ceiling in apps/quiktrack/CLAUDE.md once folder/suite delete landed.
 */
export function RepositoryEmptyState({
  canEditSuite,
  onCreateSuite,
}: {
  canEditSuite: boolean;
  onCreateSuite: () => void;
}) {
  return (
    <div className="flex h-full items-start justify-center px-6 py-12">
      <div className="max-w-md text-center">
        <Layers className="mx-auto h-8 w-8 text-gray-300" />
        <h3 className="mt-3 text-sm font-semibold text-gray-800">
          Start with a suite
        </h3>
        <p className="mt-1 text-xs leading-relaxed text-gray-500">
          A <strong className="font-medium text-gray-700">suite</strong> is
          a collection of test cases, like Regression or Smoke. Inside it you
          can add <strong className="font-medium text-gray-700">folders</strong>{" "}
          to group cases by area, then execute them together as a{" "}
          <strong className="font-medium text-gray-700">test run</strong>.
        </p>
        {canEditSuite && (
          <button
            type="button"
            onClick={onCreateSuite}
            className="mt-4 rounded-lg bg-accent-600 px-3 py-2 text-xs font-medium text-white hover:bg-accent-700"
          >
            Create your first suite
          </button>
        )}
      </div>
    </div>
  );
}
