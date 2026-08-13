import { RequirePerm } from "@/components/shell/require-perm";

/**
 * QuikTest — "About" leaf of the sidebar tree. Static: what the module does and
 * where its surfaces live. No data access, so nothing to gate beyond TestCase:view.
 */
export default function TestAboutPage() {
  return (
    <RequirePerm resource="TestCase" action="view">
      <div className="mx-auto max-w-2xl p-8">
        <h1 className="text-xl font-semibold text-gray-900">About QuikTest</h1>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">
          QuikTest is QuikTrack&apos;s test management module: reusable test cases
          organised in suites, test runs that execute them, and an append-only
          record of every execution — manual and automated — in one trail.
        </p>

        <h2 className="mt-8 text-sm font-semibold text-gray-900">Where things live</h2>
        <dl className="mt-3 space-y-3 text-sm">
          <div>
            <dt className="font-medium text-gray-800">Per project</dt>
            <dd className="text-gray-600">
              Each project has its own <span className="font-medium">Tests</span> tab
              holding that project&apos;s case repository, runs and reports.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-gray-800">Across projects</dt>
            <dd className="text-gray-600">
              This <span className="font-medium">Apps → QuikTest</span> section is the
              org-wide view — totals and runs spanning every project you can see.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-gray-800">On work items</dt>
            <dd className="text-gray-600">
              A <span className="font-medium">QuikTest: Results</span> panel on each
              work item shows the tests covering it and the failures that raised it.
            </dd>
          </div>
        </dl>

        <h2 className="mt-8 text-sm font-semibold text-gray-900">Core rules</h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-gray-600">
          <li>Results are never edited or deleted — a correction is a new result.</li>
          <li>
            Manual and automated executions share one store; the{" "}
            <span className="font-medium">source</span> distinguishes them.
          </li>
          <li>
            CI maps its tests to cases by{" "}
            <span className="font-medium">automation ID</span>; unmatched IDs are
            reported, never dropped.
          </li>
        </ul>
      </div>
    </RequirePerm>
  );
}
