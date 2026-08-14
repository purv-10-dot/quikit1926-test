import { afterEach, describe, expect, it, vi } from "vitest";
import { GithubProvider } from "@/lib/services/github/github-provider";
import { makeScmProvider } from "@/lib/services/scm/provider-factory";

// Mock the underlying GitHub client so we test the provider's mapping only.
vi.mock("@/lib/services/github/client", () => ({
  githubRequest: vi.fn(),
  createBranch: vi.fn().mockResolvedValue({ ref: "refs/heads/x", url: "api" }),
}));
import { githubRequest } from "@/lib/services/github/client";

const gr = githubRequest as unknown as ReturnType<typeof vi.fn>;

afterEach(() => vi.clearAllMocks());

describe("makeScmProvider", () => {
  it("returns a GithubProvider for github (the default)", () => {
    expect(makeScmProvider({ token: "t" })).toBeInstanceOf(GithubProvider);
    expect(makeScmProvider({ token: "t", system: "github" }).system).toBe("github");
  });
  it("throws on an unsupported system", () => {
    // @ts-expect-error — exercising the runtime guard with an unknown system.
    expect(() => makeScmProvider({ token: "t", system: "svn" })).toThrow(/Unsupported/);
  });
});

describe("GithubProvider mapping", () => {
  const p = new GithubProvider("tok");

  it("normalizes repos", async () => {
    gr.mockResolvedValueOnce({
      repositories: [{ id: 5, full_name: "a/b", default_branch: "main" }],
    });
    expect(await p.listRepos()).toEqual([
      { repoId: "5", repoFullName: "a/b", defaultBranch: "main" },
    ]);
  });

  it("normalizes commits (author + date + url)", async () => {
    gr.mockResolvedValueOnce([
      { sha: "abc", html_url: "u", commit: { message: "m", author: { name: "N", date: "2026-01-01" } } },
    ]);
    expect(await p.listCommits("a/b")).toEqual([
      { sha: "abc", message: "m", authorName: "N", url: "u", committedAt: "2026-01-01" },
    ]);
  });

  it("maps PR state: merged wins, then draft, then closed, else open", async () => {
    gr.mockResolvedValueOnce([
      { number: 1, title: "t", body: null, state: "closed", merged_at: "2026-01-02", draft: false, html_url: "u", updated_at: "d", user: { login: "x" } },
      { number: 2, title: "t", body: null, state: "open", merged_at: null, draft: true, html_url: "u", updated_at: "d", user: null },
      { number: 3, title: "t", body: null, state: "closed", merged_at: null, draft: false, html_url: "u", updated_at: "d", user: null },
      { number: 4, title: "t", body: null, state: "open", merged_at: null, draft: false, html_url: "u", updated_at: "d", user: null },
    ]);
    const prs = await p.listPullRequests("a/b");
    expect(prs.map((x) => x.state)).toEqual(["MERGED", "DRAFT", "CLOSED", "OPEN"]);
  });

  it("createBranch returns normalized name + web url", async () => {
    const out = await p.createBranch("a/b", "main", "QT-9-x");
    expect(out).toEqual({ name: "QT-9-x", url: "https://github.com/a/b/tree/QT-9-x" });
  });
});
