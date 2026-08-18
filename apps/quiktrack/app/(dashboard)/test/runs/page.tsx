import { RequirePerm } from "@/components/shell/require-perm";
import { PendingSchemaNotice } from "@/components/test/pending-schema-notice";

/**
 * QuikTest — all runs across projects, filterable by state / source / milestone.
 */
export default function TestRunsPage() {
  return (
    <RequirePerm resource="TestRun" action="view">
      <PendingSchemaNotice
        title="Test runs"
        description="Every run across your projects, with manual and automated result counts, filterable by state, source and milestone."
      />
    </RequirePerm>
  );
}
