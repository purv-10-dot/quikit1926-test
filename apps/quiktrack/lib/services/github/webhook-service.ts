/**
 * Turn verified GitHub webhook payloads into linked dev artifacts.
 *
 * Each handler parses issue keys out of the relevant text (branch ref, commit
 * message, PR title/body), resolves them to QtIssue rows scoped by `orgId`, and
 * upserts QtDevBranch / QtDevCommit / QtDevPullRequest idempotently. A candidate
 * key that matches no issue in this org is silently ignored.
 *
 * The route verifies the HMAC signature before calling anything here.
 */

import { db } from "@/lib/db";
import { parseIssueKeys } from "@/lib/services/github/issue-key";

/** Resolve candidate keys to QtIssue ids for this org. Unknown keys dropped. */
async function resolveIssueIds(
  orgId: string,
  keys: string[],
): Promise<string[]> {
  if (keys.length === 0) return [];
  const issues = await db.qtIssue.findMany({
    where: { orgId, key: { in: keys } },
    select: { id: true },
  });
  return issues.map((i) => i.id);
}

interface RepoRef {
  repoId: string;
  repoFullName: string;
}

/** `create`/`delete` events for a branch ref. */
export async function handleBranchEvent(
  orgId: string,
  repo: RepoRef,
  refType: string,
  ref: string,
  action: "created" | "deleted",
): Promise<number> {
  if (refType !== "branch") return 0;
  const issueIds = await resolveIssueIds(orgId, parseIssueKeys(ref));
  if (issueIds.length === 0) return 0;

  if (action === "deleted") {
    const res = await db.qtDevBranch.deleteMany({
      where: { orgId, repoId: repo.repoId, name: ref, issueId: { in: issueIds } },
    });
    return res.count;
  }

  for (const issueId of issueIds) {
    await db.qtDevBranch.upsert({
      where: {
        issueId_repoId_name: { issueId, repoId: repo.repoId, name: ref },
      },
      create: {
        orgId,
        issueId,
        repoId: repo.repoId,
        repoFullName: repo.repoFullName,
        name: ref,
      },
      update: { repoFullName: repo.repoFullName },
    });
  }
  return issueIds.length;
}

interface CommitPayload {
  id: string;
  message: string;
  url?: string;
  timestamp?: string;
  author?: { name?: string };
}

/** `push` event — link each commit whose message carries a known key. */
export async function handlePushEvent(
  orgId: string,
  repo: RepoRef,
  commits: CommitPayload[],
): Promise<number> {
  let linked = 0;
  for (const c of commits) {
    const issueIds = await resolveIssueIds(orgId, parseIssueKeys(c.message));
    for (const issueId of issueIds) {
      await db.qtDevCommit.upsert({
        where: { repoId_sha: { repoId: repo.repoId, sha: c.id } },
        create: {
          orgId,
          issueId,
          repoId: repo.repoId,
          repoFullName: repo.repoFullName,
          sha: c.id,
          message: c.message,
          authorName: c.author?.name ?? null,
          url: c.url ?? null,
          committedAt: c.timestamp ? new Date(c.timestamp) : null,
        },
        update: { message: c.message },
      });
      linked++;
    }
  }
  return linked;
}

interface PullRequestPayload {
  number: number;
  title: string;
  body?: string | null;
  state?: string;
  merged?: boolean;
  draft?: boolean;
  html_url?: string;
  updated_at?: string;
  user?: { login?: string };
  /** Head branch ref (e.g. "QUIKTR-104-work") — often carries the key when the
   *  human-typed title/body doesn't. GitHub sends this as pull_request.head.ref. */
  headRef?: string | null;
}

function prState(pr: PullRequestPayload): string {
  if (pr.merged) return "MERGED";
  if (pr.draft) return "DRAFT";
  if (pr.state === "closed") return "CLOSED";
  return "OPEN";
}

/** `pull_request` event — link a PR whose title/body carries a known key. */
export async function handlePullRequestEvent(
  orgId: string,
  repo: RepoRef,
  pr: PullRequestPayload,
): Promise<number> {
  // Parse the title, body AND the head branch ref — the branch often carries
  // the key (e.g. "QUIKTR-104-work") even when the PR title doesn't.
  const keys = parseIssueKeys(`${pr.title}\n${pr.body ?? ""}\n${pr.headRef ?? ""}`);
  const issueIds = await resolveIssueIds(orgId, keys);
  const state = prState(pr);
  for (const issueId of issueIds) {
    await db.qtDevPullRequest.upsert({
      where: { repoId_number: { repoId: repo.repoId, number: pr.number } },
      create: {
        orgId,
        issueId,
        repoId: repo.repoId,
        repoFullName: repo.repoFullName,
        number: pr.number,
        title: pr.title,
        state,
        url: pr.html_url ?? null,
        authorName: pr.user?.login ?? null,
        updatedAtGh: pr.updated_at ? new Date(pr.updated_at) : null,
      },
      update: {
        title: pr.title,
        state,
        updatedAtGh: pr.updated_at ? new Date(pr.updated_at) : null,
      },
    });
  }
  return issueIds.length;
}
