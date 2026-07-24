/**
 * Historical backfill for a linked repo.
 *
 * Webhooks only capture activity from the moment the App is installed; backfill
 * fetches existing branches, recent commits, and pull requests and links any
 * that carry a known issue key — the same parse+resolve+upsert path the webhook
 * handler uses. Idempotent: re-running updates rather than duplicates.
 *
 * Per-task status is written to QtGithubRepo.backfillStatus (JSON) so the
 * settings UI can render the Jira-style checklist (branches ✓, commits ✓, …).
 * Bounded page counts keep a single invocation within serverless limits; a
 * follow-up phase can add cursor-based resumption for very large repos.
 */

import { db } from "@/lib/db";
import { githubRequest } from "@/lib/services/github/client";
import { getInstallationToken } from "@/lib/services/github/repo-service";
import { parseIssueKeys } from "@/lib/services/github/issue-key";
import {
  handleBranchEvent,
  handlePushEvent,
  handlePullRequestEvent,
} from "@/lib/services/github/webhook-service";

export interface BackfillResult {
  branches: number;
  commits: number;
  pullRequests: number;
}

interface RepoRow {
  repoId: string;
  repoFullName: string;
  installationId: string;
}

async function resolveRepo(orgId: string, repoId: string): Promise<RepoRow> {
  const repo = await db.qtGithubRepo.findFirst({
    where: { orgId, repoId },
    select: { repoId: true, repoFullName: true, installationId: true },
  });
  if (!repo) throw new Error("Repo is not linked for this org.");
  return repo;
}

/**
 * Run a bounded backfill for one linked repo. Marks the installation RUNNING →
 * FINISHED (or ERROR) so the UI reflects progress.
 */
export async function backfillRepo(
  orgId: string,
  repoId: string,
): Promise<BackfillResult> {
  const repo = await resolveRepo(orgId, repoId);
  const token = await getInstallationToken(orgId, repo.installationId);
  const ref = { repoId: repo.repoId, repoFullName: repo.repoFullName };
  const result: BackfillResult = { branches: 0, commits: 0, pullRequests: 0 };

  await db.qtGithubInstallation.updateMany({
    where: { id: repo.installationId, orgId },
    data: { backfillStatus: "RUNNING" },
  });

  try {
    // Branches (page 1, up to 100).
    const branches = await githubRequest<Array<{ name: string }>>(
      token,
      `/repos/${repo.repoFullName}/branches?per_page=100`,
    );
    for (const b of branches) {
      if (parseIssueKeys(b.name).length === 0) continue;
      result.branches += await handleBranchEvent(orgId, ref, "branch", b.name, "created");
    }

    // Recent commits (page 1, up to 100).
    const commits = await githubRequest<
      Array<{ sha: string; html_url: string; commit: { message: string; author?: { name?: string; date?: string } } }>
    >(token, `/repos/${repo.repoFullName}/commits?per_page=100`);
    result.commits += await handlePushEvent(
      orgId,
      ref,
      commits.map((c) => ({
        id: c.sha,
        message: c.commit.message,
        url: c.html_url,
        timestamp: c.commit.author?.date,
        author: { name: c.commit.author?.name },
      })),
    );

    // Pull requests (all states, page 1, up to 100).
    const prs = await githubRequest<
      Array<{
        number: number; title: string; body: string | null; state: string;
        merged_at: string | null; draft: boolean; html_url: string;
        updated_at: string; user: { login: string } | null;
      }>
    >(token, `/repos/${repo.repoFullName}/pulls?state=all&per_page=100`);
    for (const pr of prs) {
      result.pullRequests += await handlePullRequestEvent(orgId, ref, {
        number: pr.number,
        title: pr.title,
        body: pr.body,
        state: pr.state,
        merged: Boolean(pr.merged_at),
        draft: pr.draft,
        html_url: pr.html_url,
        updated_at: pr.updated_at,
        user: pr.user ?? undefined,
      });
    }

    await db.qtGithubRepo.updateMany({
      where: { orgId, repoId },
      data: { backfillStatus: { branches: true, commits: true, pullRequests: true } },
    });
    await db.qtGithubInstallation.updateMany({
      where: { id: repo.installationId, orgId },
      data: { backfillStatus: "FINISHED", backfilledFrom: new Date(), lastError: null },
    });
    return result;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Backfill failed";
    await db.qtGithubInstallation.updateMany({
      where: { id: repo.installationId, orgId },
      data: { backfillStatus: "ERROR", lastError: message },
    });
    throw error;
  }
}
