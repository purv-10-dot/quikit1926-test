import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { IssueFullView } from "@/components/issue-full-view/issue-full-view";

// Session-scoped, per-request — the issue is resolved from the live org.
export const dynamic = "force-dynamic";

/**
 * Jira-style readable work-item URL: `/browse/SCRUM-58`.
 *
 * Issue keys are unique per project (`@@unique([projectId, key])`), but the
 * `PROJECT-N` key embeds the org-unique project prefix, so a `{ orgId, key }`
 * lookup resolves to exactly one issue within the caller's org. We resolve the
 * key → issue here (server-side), then render the same full-page view the
 * `/spaces/[id]/work/[issueId]` route uses. No client redirect — the URL stays
 * `/browse/{key}`.
 */
export default async function BrowseIssuePage({
  params,
}: {
  params: { key: string };
}) {
  const session = await getServerSession(authOptions);
  const orgId = session?.user?.orgId;
  if (!orgId) notFound();

  const key = decodeURIComponent(params.key).toUpperCase();
  const issue = await db.qtIssue.findFirst({
    where: { orgId, key, isDeleted: false },
    select: { id: true, projectId: true },
  });
  if (!issue) notFound();

  return <IssueFullView projectId={issue.projectId} issueId={issue.id} />;
}
