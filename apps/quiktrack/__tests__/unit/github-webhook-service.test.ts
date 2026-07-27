import { beforeEach, describe, expect, it } from "vitest";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import {
  handleBranchEvent,
  handlePushEvent,
  handlePullRequestEvent,
} from "@/lib/services/github/webhook-service";

const ORG = "org_1";
const REPO = { repoId: "555", repoFullName: "acme/app" };

beforeEach(() => {
  resetMockDb();
});

describe("webhook-service", () => {
  it("links a created branch to a resolved issue", async () => {
    mockDb.qtIssue.findMany.mockResolvedValue([{ id: "iss_1" }] as never);
    mockDb.qtDevBranch.upsert.mockResolvedValue({ id: "b1" } as never);

    const n = await handleBranchEvent(ORG, REPO, "branch", "feature/QT-1-login", "created");

    expect(n).toBe(1);
    expect(mockDb.qtDevBranch.upsert).toHaveBeenCalledTimes(1);
    const arg = mockDb.qtDevBranch.upsert.mock.calls[0][0];
    expect(arg.create).toMatchObject({ orgId: ORG, issueId: "iss_1", name: "feature/QT-1-login" });
  });

  it("ignores a branch with no resolvable key", async () => {
    mockDb.qtIssue.findMany.mockResolvedValue([] as never);
    const n = await handleBranchEvent(ORG, REPO, "branch", "chore/cleanup", "created");
    expect(n).toBe(0);
    expect(mockDb.qtDevBranch.upsert).not.toHaveBeenCalled();
  });

  it("ignores non-branch ref types (e.g. tag)", async () => {
    const n = await handleBranchEvent(ORG, REPO, "tag", "v1.0.0", "created");
    expect(n).toBe(0);
    expect(mockDb.qtIssue.findMany).not.toHaveBeenCalled();
  });

  it("deletes branch links on a delete event", async () => {
    mockDb.qtIssue.findMany.mockResolvedValue([{ id: "iss_1" }] as never);
    mockDb.qtDevBranch.deleteMany.mockResolvedValue({ count: 1 } as never);
    const n = await handleBranchEvent(ORG, REPO, "branch", "QT-9-x", "deleted");
    expect(n).toBe(1);
    expect(mockDb.qtDevBranch.deleteMany).toHaveBeenCalled();
  });

  it("links commits whose messages carry a key", async () => {
    mockDb.qtIssue.findMany.mockResolvedValue([{ id: "iss_2" }] as never);
    mockDb.qtDevCommit.upsert.mockResolvedValue({ id: "c1" } as never);
    const n = await handlePushEvent(ORG, REPO, [
      { id: "sha1", message: "QT-2 implement" },
      { id: "sha2", message: "no key here" },
    ]);
    expect(n).toBe(1);
    expect(mockDb.qtDevCommit.upsert).toHaveBeenCalledTimes(1);
  });

  it("derives PR state (merged wins over closed)", async () => {
    mockDb.qtIssue.findMany.mockResolvedValue([{ id: "iss_3" }] as never);
    mockDb.qtDevPullRequest.upsert.mockResolvedValue({ id: "p1" } as never);
    await handlePullRequestEvent(ORG, REPO, {
      number: 7,
      title: "QT-3 add wizard",
      state: "closed",
      merged: true,
      html_url: "https://gh/pr/7",
    });
    const arg = mockDb.qtDevPullRequest.upsert.mock.calls[0][0];
    expect(arg.create).toMatchObject({ state: "MERGED", number: 7, issueId: "iss_3" });
  });

  it("links a PR via its head branch ref when the title has no key", async () => {
    // Regression: PR titled "Q UI ktr 104 work" (no key) but branch is
    // "QUIKTR-104-work" — must still link via headRef.
    mockDb.qtIssue.findMany.mockResolvedValue([{ id: "iss_104" }] as never);
    mockDb.qtDevPullRequest.upsert.mockResolvedValue({ id: "p2" } as never);
    const n = await handlePullRequestEvent(ORG, REPO, {
      number: 3,
      title: "Q UI ktr 104 work",
      state: "closed",
      merged: true,
      html_url: "https://gh/pr/3",
      headRef: "QUIKTR-104-work",
    });
    expect(n).toBe(1);
    // The resolver must have been asked for the branch-derived key.
    const where = (mockDb.qtIssue.findMany.mock.calls[0]?.[0] as { where: { key: { in: string[] } } }).where;
    expect(where.key.in).toContain("QUIKTR-104");
  });
});
