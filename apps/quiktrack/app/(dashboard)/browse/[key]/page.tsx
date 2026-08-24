import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { loadProjectAccess } from "@/lib/api/withProjectAccess";
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
 *
 * Cross-org fallback: the session holds one active org, so a user who belongs
 * to several orgs can arrive here on the wrong one — clicking an emailed link
 * for org B while their last session was org A. New emails carry `?org=<orgId>`
 * and middleware switches the session before the page renders; links sent
 * before that (and any hand-typed key) still land here on the wrong org, so
 * rather than 404 we look the key up across the caller's other orgs and route
 * through the same switch endpoint.
 */
export default async function BrowseIssuePage({
  params,
}: {
  params: { key: string };
}) {
  const session = await getServerSession(authOptions);
  const orgId = session?.user?.orgId;
  const userId = session?.user?.id;
  if (!orgId || !userId) notFound();

  const key = decodeURIComponent(params.key).toUpperCase();
  const issue = await db.qtIssue.findFirst({
    where: { orgId, key, isDeleted: false },
    select: { id: true, projectId: true },
  });

  if (!issue) {
    const target = await findKeyInOtherOrgs({ userId, currentOrgId: orgId, key });
    if (target) {
      const to = `/browse/${encodeURIComponent(key)}`;
      redirect(
        `/api/session/switch-org?orgId=${encodeURIComponent(target)}&to=${encodeURIComponent(to)}`,
      );
    }
    notFound();
  }

  // The issue exists in this org, but the viewer may not be a member of its
  // project (e.g. an emailed "copy link" opened by a teammate who has QuikTrack
  // but not this space). loadProjectAccess returns null in exactly that case.
  // Without this guard the client IssueFullView fires project-scoped fetches
  // that 403, and the page sits on its loading shimmer forever — so render a
  // clear no-access message instead.
  const access = await loadProjectAccess(orgId, userId, issue.projectId);
  if (!access) {
    return <NoSpaceAccess />;
  }

  return <IssueFullView projectId={issue.projectId} issueId={issue.id} />;
}

/** Shown when the viewer has QuikTrack but not the work item's space. */
function NoSpaceAccess() {
  return (
    <div className="flex h-full min-h-[60vh] items-center justify-center px-6 py-16">
      <div className="max-w-md text-center">
        <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          You don&apos;t have access to this space
        </h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          This work item lives in a project you&apos;re not a member of. Ask a
          project admin to add you, then open the link again.
        </p>
        <Link
          href="/dashboard"
          className="mt-5 inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Go to your work
        </Link>
      </div>
    </div>
  );
}

/**
 * Which OTHER org of this user owns `key`, if any.
 *
 * Scoped to active memberships in active orgs — the same rule
 * /api/session/switch-org enforces, so we never redirect into a switch that is
 * going to be refused. Keys are unique per project, not per org, so two orgs
 * can in principle both hold a `TRACK-1`; taking the first match is the best
 * available guess and mirrors what the emailed `?org=` link would have picked.
 */
async function findKeyInOtherOrgs(args: {
  userId: string;
  currentOrgId: string;
  key: string;
}): Promise<string | null> {
  const memberships = await db.orgMember.findMany({
    where: {
      userId: args.userId,
      status: "active",
      orgId: { not: args.currentOrgId },
      org: { status: "active" },
    },
    select: { orgId: true },
  });
  if (memberships.length === 0) return null;

  const match = await db.qtIssue.findFirst({
    where: {
      key: args.key,
      isDeleted: false,
      orgId: { in: memberships.map((m) => m.orgId) },
    },
    select: { orgId: true },
  });
  return match?.orgId ?? null;
}
