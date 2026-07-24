import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { setSession } from "../setup";

// Stub the GitHub network calls so the route is testable without hitting GitHub.
vi.mock("@/lib/services/github/repo-service", () => ({
  getInstallationToken: vi.fn().mockResolvedValue("ghs_test_token"),
}));
vi.mock("@/lib/services/github/client", () => ({
  createBranch: vi.fn().mockResolvedValue({ ref: "refs/heads/QT-1-x", url: "https://api/x" }),
}));

import { POST } from "@/app/api/issues/[id]/development/branch/route";

const USER = "user_1";
const ORG = "org_1";
const ISSUE = "iss_1";

function call(body: unknown) {
  return POST(
    new NextRequest(`http://localhost/api/issues/${ISSUE}/development/branch`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
    { params: { id: ISSUE } } as never,
  );
}

const VALID = { repoId: "555", sourceBranch: "main", branchName: "QT-1-login" };

beforeEach(() => {
  resetMockDb();
  setSession(null);
});

describe("POST /api/issues/[id]/development/branch", () => {
  it("401 when unauthenticated", async () => {
    expect((await call(VALID)).status).toBe(401);
  });

  it("404 when the issue is not in the caller's org", async () => {
    setSession({ id: USER, orgId: ORG, role: "member" });
    mockDb.qtIssue.findFirst.mockResolvedValue(null);
    expect((await call(VALID)).status).toBe(404);
  });

  it("400 when the repo is not linked to the org", async () => {
    setSession({ id: USER, orgId: ORG, role: "member" });
    mockDb.qtIssue.findFirst.mockResolvedValue({ id: ISSUE, projectId: "p1" } as never);
    mockDb.qtProjectMember.findFirst.mockResolvedValue({ id: "pm" } as never);
    mockDb.qtGithubRepo.findFirst.mockResolvedValue(null);
    expect((await call(VALID)).status).toBe(400);
  });

  it("creates the branch and records the QtDevBranch link", async () => {
    setSession({ id: USER, orgId: ORG, role: "member" });
    mockDb.qtIssue.findFirst.mockResolvedValue({ id: ISSUE, projectId: "p1" } as never);
    mockDb.qtProjectMember.findFirst.mockResolvedValue({ id: "pm" } as never);
    mockDb.qtGithubRepo.findFirst.mockResolvedValue({
      repoFullName: "acme/app",
      installationId: "inst_1",
    } as never);
    mockDb.qtDevBranch.upsert.mockResolvedValue({ id: "b1" } as never);

    const res = await call(VALID);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.name).toBe("QT-1-login");
    // The recorded link must be org-scoped.
    const arg = mockDb.qtDevBranch.upsert.mock.calls[0][0];
    expect(arg.create).toMatchObject({ orgId: ORG, issueId: ISSUE, repoId: "555" });
  });
});
