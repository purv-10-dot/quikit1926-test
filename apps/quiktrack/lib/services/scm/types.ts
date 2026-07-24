/**
 * Provider-agnostic SCM (source-control management) contract.
 *
 * QuikTrack's development integration is designed to support more than GitHub.
 * Everything the app's services need from a provider — listing repos, fetching
 * historical branches/commits/PRs for backfill, and creating a branch — is
 * expressed here in normalized shapes. GitHub is the first implementation
 * (lib/services/github); GitLab / Bitbucket can be added later by implementing
 * `ScmProvider` without touching the DB models, the routes, or the UI.
 *
 * The DB rows (QtDevBranch/Commit/PullRequest) already carry a `sourceSystem`
 * column, so persistence is provider-neutral. Auth/token handling stays inside
 * each provider (GitHub App installation tokens differ from a GitLab PAT), so
 * it is deliberately NOT part of this interface — a provider is constructed
 * with whatever credential context it needs and exposes only these operations.
 */

/** Stable identifier for each supported provider. Matches the `sourceSystem`
 *  value written to dev rows. */
export type ScmSystem = "github" | "gitlab" | "bitbucket";

export interface ScmRepo {
  /** Provider-native repo id (stable across renames). */
  repoId: string;
  /** "owner/name" style full path. */
  repoFullName: string;
  defaultBranch: string;
}

export interface ScmBranch {
  name: string;
  /** Web URL to view the branch, if the provider gives one. */
  url?: string | null;
}

export interface ScmCommit {
  sha: string;
  message: string;
  authorName?: string | null;
  url?: string | null;
  /** ISO-8601 commit timestamp. */
  committedAt?: string | null;
}

export interface ScmPullRequest {
  number: number;
  title: string;
  body?: string | null;
  /** Normalized: OPEN | MERGED | CLOSED | DRAFT. */
  state: "OPEN" | "MERGED" | "CLOSED" | "DRAFT";
  url?: string | null;
  authorName?: string | null;
  /** ISO-8601 last-updated timestamp. */
  updatedAt?: string | null;
}

/**
 * The operations the app's services call. An implementation is created per
 * installation/connection (it already holds the credential context it needs),
 * so these methods take no auth arguments.
 */
export interface ScmProvider {
  readonly system: ScmSystem;

  /** Repositories this connection can see. */
  listRepos(): Promise<ScmRepo[]>;

  /** Branches on a repo (bounded page for backfill). */
  listBranches(repoFullName: string): Promise<ScmBranch[]>;

  /** Recent commits on a repo (bounded page for backfill). */
  listCommits(repoFullName: string): Promise<ScmCommit[]>;

  /** Pull/merge requests on a repo, all states (bounded page for backfill). */
  listPullRequests(repoFullName: string): Promise<ScmPullRequest[]>;

  /**
   * Create a branch `newBranch` off `sourceBranch`. Returns the new branch's
   * web URL. Providers throw a provider-specific error if it already exists.
   */
  createBranch(
    repoFullName: string,
    sourceBranch: string,
    newBranch: string,
  ): Promise<{ name: string; url: string }>;
}
