/**
 * DORA-style metric computation from stored dev data.
 *
 * Pure functions (no DB / no clock reads passed in as args) so they're fully
 * unit-testable. The route supplies the raw rows + a "now" reference.
 *
 *  - PR cycle time: median hours from a PR's first-seen (createdAt) to merge.
 *    We approximate "opened" with the row's createdAt when GitHub's opened_at
 *    isn't stored; good enough for a rolling median and matches what we have.
 *  - Lead time for changes: median hours from a linked commit's committedAt to
 *    the merge time of a PR on the same issue. Falls back to null when we can't
 *    pair them.
 *  - Deployment frequency: deployments per week over the window. Needs
 *    deployment rows (populated by webhooks); 0 until those exist — same as
 *    Jira shows without a connected deploy pipeline.
 */

export interface PrRow {
  issueId: string;
  state: string; // OPEN | MERGED | CLOSED | DRAFT
  createdAt: Date;
  /** merge time — we use updatedAtGh as the best available proxy when MERGED. */
  updatedAtGh: Date | null;
}

export interface CommitRow {
  issueId: string;
  committedAt: Date | null;
}

export interface DeploymentRow {
  deployedAt: Date;
}

const HOUR = 1000 * 60 * 60;
const DAY = HOUR * 24;

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Median PR cycle time in hours (open → merge), rolling `windowDays`. */
export function prCycleTimeHours(
  prs: PrRow[],
  now: number,
  windowDays = 7,
): number | null {
  const since = now - windowDays * DAY;
  const durations: number[] = [];
  for (const pr of prs) {
    if (pr.state !== "MERGED" || !pr.updatedAtGh) continue;
    const merged = pr.updatedAtGh.getTime();
    if (merged < since) continue;
    const opened = pr.createdAt.getTime();
    if (merged > opened) durations.push((merged - opened) / HOUR);
  }
  const m = median(durations);
  return m == null ? null : Math.round(m);
}

/**
 * Median lead time for changes in hours: earliest linked commit → merge of a
 * PR on the same issue, rolling `windowDays`. Null when no pair exists.
 */
export function leadTimeHours(
  prs: PrRow[],
  commits: CommitRow[],
  now: number,
  windowDays = 12 * 7,
): number | null {
  const since = now - windowDays * DAY;
  // earliest commit per issue
  const firstCommit = new Map<string, number>();
  for (const c of commits) {
    if (!c.committedAt) continue;
    const t = c.committedAt.getTime();
    const cur = firstCommit.get(c.issueId);
    if (cur == null || t < cur) firstCommit.set(c.issueId, t);
  }
  const durations: number[] = [];
  for (const pr of prs) {
    if (pr.state !== "MERGED" || !pr.updatedAtGh) continue;
    const merged = pr.updatedAtGh.getTime();
    if (merged < since) continue;
    const start = firstCommit.get(pr.issueId);
    if (start != null && merged > start) durations.push((merged - start) / HOUR);
  }
  const m = median(durations);
  return m == null ? null : Math.round(m);
}

/** Deployments per week over `windowDays` (default 12 weeks). */
export function deploymentFrequencyPerWeek(
  deployments: DeploymentRow[],
  now: number,
  windowDays = 12 * 7,
): number {
  const since = now - windowDays * DAY;
  const n = deployments.filter((d) => d.deployedAt.getTime() >= since).length;
  const weeks = windowDays / 7;
  return Math.round((n / weeks) * 10) / 10; // 1 decimal
}
