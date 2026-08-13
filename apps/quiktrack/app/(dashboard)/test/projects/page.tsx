import { RequirePerm } from "@/components/shell/require-perm";
import { PendingSchemaNotice } from "@/components/test/pending-schema-notice";

/**
 * QuikTest — per-project rollup table ("Projects" leaf of the sidebar tree).
 * Each row links through to that space's own Tests tab.
 */
export default function TestProjectsPage() {
  return (
    <RequirePerm resource="TestCase" action="view">
      <PendingSchemaNotice
        title="Projects"
        description="Total cases, pass rate, automation coverage, open defects and last run for each project you can see."
      />
    </RequirePerm>
  );
}
