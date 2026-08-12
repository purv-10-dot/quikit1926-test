import { RequirePerm } from "@/components/shell/require-perm";
import { PendingSchemaNotice } from "@/components/test/pending-schema-notice";

/**
 * QuikTest — org-wide (cross-project) dashboard. The "Dashboard" leaf of the
 * sidebar's Apps → QuikTest tree.
 *
 * Cross-project by design, but still org-scoped: aggregates only the caller's
 * visible projects (plan §6.8). The rollup must go through one audited helper
 * once the schema lands — an ad-hoc groupBy here would leak counts from
 * projects the user can't open.
 */
export default function TestDashboardPage() {
  return (
    <RequirePerm resource="TestCase" action="view">
      <PendingSchemaNotice
        title="QuikTest dashboard"
        description="Cross-project totals, pass-rate trend and active milestones across every project you can see."
      />
    </RequirePerm>
  );
}
