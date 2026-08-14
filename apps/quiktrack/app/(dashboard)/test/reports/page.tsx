import { RequirePerm } from "@/components/shell/require-perm";
import { PendingSchemaNotice } from "@/components/test/pending-schema-notice";

/**
 * QuikTest — cross-project reporting (pass rate, coverage, flakiness, activity).
 */
export default function TestReportsPage() {
  return (
    <RequirePerm resource="TestReport" action="view">
      <PendingSchemaNotice
        title="Test reports"
        description="Pass rate, requirement coverage, flakiness and tester activity, rolled up across projects."
      />
    </RequirePerm>
  );
}
