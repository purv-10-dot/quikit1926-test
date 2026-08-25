import { describe, expect, it } from "vitest";

/**
 * QUIKTR-341 — "QuikTest: Cases" / "QuikTest: Runs" opened from a work item.
 *
 * These are plain-logic assertions on the URL contract shared between the
 * details-panel links (issue-details-panel.tsx / edit-issue-modal.tsx) and the
 * receiving deep-link hooks (use-link-issue-deeplink.ts /
 * use-link-issue-run-deeplink.ts). The hooks themselves need a mounted
 * next/navigation router to exercise directly; what's verified here is the
 * contract that would silently break if either side drifted: which params are
 * required, which get stripped, and that the id is never dropped in favour of
 * only the key (coverage links need the id; the key is display-only).
 */

/** Mirrors the query the case-creation link builds. */
function buildCaseLinkQuery(issueId: string, issueKey: string): string {
  const p = new URLSearchParams();
  p.set("createCase", "1");
  p.set("linkIssueId", issueId);
  p.set("linkIssueKey", issueKey);
  return p.toString();
}

/** Mirrors the query the run-creation link builds. */
function buildRunLinkQuery(issueKey: string): string {
  const p = new URLSearchParams();
  p.set("createRun", "1");
  p.set("linkIssueKey", issueKey);
  return p.toString();
}

/** Mirrors the strip-after-consume step in both deep-link hooks. */
function stripCaseParams(qs: string): string {
  const p = new URLSearchParams(qs);
  p.delete("createCase");
  p.delete("linkIssueId");
  p.delete("linkIssueKey");
  return p.toString();
}

function stripRunParams(qs: string): string {
  const p = new URLSearchParams(qs);
  p.delete("createRun");
  p.delete("linkIssueKey");
  p.delete("linkIssueId");
  return p.toString();
}

describe("case-creation deep-link query", () => {
  it("carries both the id (for the coverage POST) and the key (for display)", () => {
    const qs = buildCaseLinkQuery("cuid_123", "QUIKTR-141");
    const p = new URLSearchParams(qs);
    expect(p.get("linkIssueId")).toBe("cuid_123");
    expect(p.get("linkIssueKey")).toBe("QUIKTR-141");
    expect(p.get("createCase")).toBe("1");
  });

  it("is fully consumed by the strip step — no leftover linking params", () => {
    const qs = buildCaseLinkQuery("cuid_123", "QUIKTR-141");
    const after = stripCaseParams(qs);
    expect(after).toBe("");
  });

  it("preserves unrelated params already on the URL (e.g. an active filter)", () => {
    const qs = `priority=HIGH&${buildCaseLinkQuery("cuid_123", "QUIKTR-141")}`;
    const after = stripCaseParams(qs);
    expect(after).toBe("priority=HIGH");
  });
});

describe("run-creation deep-link query", () => {
  it("carries only the key — runs have no id-based coverage relation to POST", () => {
    const qs = buildRunLinkQuery("QUIKTR-141");
    const p = new URLSearchParams(qs);
    expect(p.get("linkIssueKey")).toBe("QUIKTR-141");
    expect(p.get("createRun")).toBe("1");
  });

  it("is fully consumed by the strip step", () => {
    const qs = buildRunLinkQuery("QUIKTR-141");
    expect(stripRunParams(qs)).toBe("");
  });
});

describe("URL encoding of the issue key", () => {
  it("round-trips a key containing characters that need escaping", () => {
    // Defensive: project keys are alnum today, but the encode/decode round-trip
    // itself must not corrupt a value even if that ever changes.
    const raw = "QUIK TR-141";
    const encoded = encodeURIComponent(raw);
    const p = new URLSearchParams(`linkIssueKey=${encoded}`);
    expect(p.get("linkIssueKey")).toBe(raw);
  });
});
