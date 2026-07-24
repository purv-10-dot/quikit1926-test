/**
 * GitHub implementation of the provider-agnostic ScmProvider contract.
 *
 * Wraps the existing GitHub REST client (which carries the retry/backoff and
 * App-token auth) and maps raw GitHub payloads to the normalized Scm* shapes.
 * Constructed with an installation access token — the caller (repo-service)
 * mints/refreshes that token; this class only performs operations.
 */

import type {
  ScmProvider,
  ScmRepo,
  ScmBranch,
  ScmCommit,
  ScmPullRequest,
} from "@/lib/services/scm/types";
import { createBranch, githubRequest } from "@/lib/services/github/client";

interface GhRepo { id: number; full_name: string; default_branch: string }
interface GhBranch { name: string }
interface GhCommit {
  sha: string;
  html_url: string;
  commit: { message: string; author?: { name?: string; date?: string } };
}
interface GhPull {
  number: number;
  title: string;
  body: string | null;
  state: string;
  merged_at: string | null;
  draft: boolean;
  html_url: string;
  updated_at: string;
  user: { login: string } | null;
}

function prState(pr: GhPull): ScmPullRequest["state"] {
  if (pr.merged_at) return "MERGED";
  if (pr.draft) return "DRAFT";
  if (pr.state === "closed") return "CLOSED";
  return "OPEN";
}

export class GithubProvider implements ScmProvider {
  readonly system = "github" as const;

  constructor(private readonly token: string) {}

  async listRepos(): Promise<ScmRepo[]> {
    const data = await githubRequest<{ repositories: GhRepo[] }>(
      this.token,
      "/installation/repositories?per_page=100",
    );
    return data.repositories.map((r) => ({
      repoId: String(r.id),
      repoFullName: r.full_name,
      defaultBranch: r.default_branch,
    }));
  }

  async listBranches(repoFullName: string): Promise<ScmBranch[]> {
    const data = await githubRequest<GhBranch[]>(
      this.token,
      `/repos/${repoFullName}/branches?per_page=100`,
    );
    return data.map((b) => ({ name: b.name }));
  }

  async listCommits(repoFullName: string): Promise<ScmCommit[]> {
    const data = await githubRequest<GhCommit[]>(
      this.token,
      `/repos/${repoFullName}/commits?per_page=100`,
    );
    return data.map((c) => ({
      sha: c.sha,
      message: c.commit.message,
      authorName: c.commit.author?.name ?? null,
      url: c.html_url,
      committedAt: c.commit.author?.date ?? null,
    }));
  }

  async listPullRequests(repoFullName: string): Promise<ScmPullRequest[]> {
    const data = await githubRequest<GhPull[]>(
      this.token,
      `/repos/${repoFullName}/pulls?state=all&per_page=100`,
    );
    return data.map((pr) => ({
      number: pr.number,
      title: pr.title,
      body: pr.body,
      state: prState(pr),
      url: pr.html_url,
      authorName: pr.user?.login ?? null,
      updatedAt: pr.updated_at,
    }));
  }

  async createBranch(
    repoFullName: string,
    sourceBranch: string,
    newBranch: string,
  ): Promise<{ name: string; url: string }> {
    await createBranch(this.token, repoFullName, sourceBranch, newBranch);
    return {
      name: newBranch,
      url: `https://github.com/${repoFullName}/tree/${newBranch}`,
    };
  }
}
