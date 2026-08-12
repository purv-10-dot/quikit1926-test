import { RequirePerm } from "@/components/shell/require-perm";

/**
 * QuikTest — "Space Integration" leaf. How CI reports results in: the two
 * automation endpoints, the automation-ID convention and the status mapping.
 *
 * Documentation only. The endpoints themselves arrive with P3/P4; the JUnit
 * parser behind them already exists (lib/test/resultParser.ts), and the status
 * mapping shown here is the parser's actual behaviour.
 */

const CODE = "rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[13px] text-gray-800";

export default function TestIntegrationPage() {
  return (
    <RequirePerm resource="TestCase" action="view">
      <div className="mx-auto max-w-2xl p-8">
        <h1 className="text-xl font-semibold text-gray-900">Space Integration</h1>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">
          How an automated suite reports into QuikTest. CI authenticates as a
          service account holding only the <span className="font-medium">execute
          tests</span> permission — no human login in a pipeline.
        </p>

        <h2 className="mt-8 text-sm font-semibold text-gray-900">1. Map your tests</h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">
          Each test case carries an <span className="font-medium">automation ID</span>{" "}
          that CI uses to find it, so your framework never needs internal database
          IDs. The default convention is{" "}
          <code className={CODE}>classname::name</code> — for example{" "}
          <code className={CODE}>checkout.spec.ts::guest_can_pay</code>. IDs are
          unique per project.
        </p>

        <h2 className="mt-8 text-sm font-semibold text-gray-900">2. Report results</h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">
          Two ways in, both landing in the same store. Upload your framework&apos;s
          XML output, or post JSON if you have a custom reporter.
        </p>
        <ul className="mt-3 space-y-2 text-sm text-gray-600">
          <li>
            <code className={CODE}>POST /api/test/runs/&#123;runId&#125;/results/junit</code>
            <span className="ml-1">— JUnit / xUnit XML plus artifacts (multipart).</span>
          </li>
          <li>
            <code className={CODE}>POST /api/test/runs/&#123;runId&#125;/results</code>
            <span className="ml-1">— JSON results keyed by automation ID.</span>
          </li>
        </ul>

        <h2 className="mt-8 text-sm font-semibold text-gray-900">3. Status mapping</h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">
          How JUnit elements become QuikTest statuses:
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left">
                <th className="bg-accent-50 px-3 py-2 font-medium text-gray-700">
                  In the XML
                </th>
                <th className="bg-accent-50 px-3 py-2 font-medium text-gray-700">
                  Recorded as
                </th>
              </tr>
            </thead>
            <tbody className="text-gray-600">
              <tr className="border-b border-gray-100">
                <td className="px-3 py-2">
                  <code className={CODE}>&lt;failure&gt;</code> or{" "}
                  <code className={CODE}>&lt;error&gt;</code>
                </td>
                <td className="px-3 py-2">Failed — message and stack captured</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="px-3 py-2">
                  <code className={CODE}>&lt;skipped&gt;</code>
                </td>
                <td className="px-3 py-2">Blocked</td>
              </tr>
              <tr className="border-b border-gray-100">
                <td className="px-3 py-2">neither</td>
                <td className="px-3 py-2">Passed</td>
              </tr>
              <tr>
                <td className="px-3 py-2">
                  <code className={CODE}>time</code> attribute
                </td>
                <td className="px-3 py-2">Elapsed duration</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h2 className="mt-8 text-sm font-semibold text-gray-900">Good to know</h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-gray-600">
          <li>
            Re-running the same build attaches to the existing run rather than
            creating a duplicate, so retried pipelines stay clean.
          </li>
          <li>
            An automation ID matching no case is reported back as{" "}
            <span className="font-medium">unmatched</span> — the rest of the batch
            still lands, and nothing is silently discarded.
          </li>
          <li>
            Malformed XML is rejected with the line and column of the problem
            rather than a generic parse failure.
          </li>
          <li>Nested test suites are supported at any depth.</li>
        </ul>
      </div>
    </RequirePerm>
  );
}
