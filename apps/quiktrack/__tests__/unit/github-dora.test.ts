import { describe, expect, it } from "vitest";
import {
  prCycleTimeHours,
  leadTimeHours,
  deploymentFrequencyPerWeek,
} from "@/lib/services/github/dora";

const NOW = 1_000_000_000_000; // fixed reference
const H = 1000 * 60 * 60;
const D = H * 24;

describe("prCycleTimeHours", () => {
  it("medians merged PRs' open→merge within the window", () => {
    const prs = [
      { issueId: "a", state: "MERGED", createdAt: new Date(NOW - 10 * H), updatedAtGh: new Date(NOW - 8 * H) }, // 2h
      { issueId: "b", state: "MERGED", createdAt: new Date(NOW - 20 * H), updatedAtGh: new Date(NOW - 16 * H) }, // 4h
    ];
    expect(prCycleTimeHours(prs, NOW, 7)).toBe(3); // median of 2,4
  });
  it("ignores non-merged and out-of-window PRs", () => {
    const prs = [
      { issueId: "a", state: "OPEN", createdAt: new Date(NOW - 2 * H), updatedAtGh: null },
      { issueId: "b", state: "MERGED", createdAt: new Date(NOW - 40 * D), updatedAtGh: new Date(NOW - 39 * D) },
    ];
    expect(prCycleTimeHours(prs, NOW, 7)).toBeNull();
  });
});

describe("leadTimeHours", () => {
  it("measures earliest commit → merge for the same issue", () => {
    const prs = [{ issueId: "x", state: "MERGED", createdAt: new Date(NOW - 5 * H), updatedAtGh: new Date(NOW - 1 * H) }];
    const commits = [
      { issueId: "x", committedAt: new Date(NOW - 9 * H) }, // earliest
      { issueId: "x", committedAt: new Date(NOW - 3 * H) },
    ];
    expect(leadTimeHours(prs, commits, NOW)).toBe(8); // 9h ago → 1h ago
  });
  it("is null when no commit pairs with a merged PR", () => {
    const prs = [{ issueId: "x", state: "MERGED", createdAt: new Date(NOW - 5 * H), updatedAtGh: new Date(NOW - 1 * H) }];
    expect(leadTimeHours(prs, [], NOW)).toBeNull();
  });
});

describe("deploymentFrequencyPerWeek", () => {
  it("averages deployments over the window", () => {
    // 12 deployments across the 12-week window → 1.0/week
    const deployments = Array.from({ length: 12 }, (_, i) => ({ deployedAt: new Date(NOW - i * 7 * D) }));
    expect(deploymentFrequencyPerWeek(deployments, NOW)).toBe(1);
  });
  it("is 0 with no deployments (localhost/no pipeline)", () => {
    expect(deploymentFrequencyPerWeek([], NOW)).toBe(0);
  });
});
