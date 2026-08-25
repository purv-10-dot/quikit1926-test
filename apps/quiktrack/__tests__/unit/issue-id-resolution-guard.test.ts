import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { stripComments } from "../helpers/stripComments";

/**
 * GUARD TEST — in a route that resolves `[id]` as an issue-id-OR-key, the raw
 * `params.id` must never be used for anything except being handed to the
 * resolver.
 *
 * THE BUG CLASS THIS EXISTS FOR. `resolveIssueIdOrKey` makes `[id]` accept
 * either a cuid or a key ("WST-42"). Every OTHER use of `params.id` in the
 * same handler then silently receives a key where a cuid is required — and
 * Prisma does not complain, because a key IS a valid string for a cuid column.
 * Three shapes, in ascending order of nastiness:
 *
 *   1. WRONG ANSWER, HTTP 200. `where: { parentId: params.id }` (GET's
 *      subtasks), `where: { issueId: params.id }` (GET's time logs, the
 *      comments list) match nothing and return `[]`. The response looks
 *      well-formed and is wrong. No error surfaces, anywhere, ever.
 *   2. HALF-APPLIED WRITE. DELETE's epic-child unlink (`epicId`) and subtask
 *      cascade (`parentId`) quietly affect zero rows, then the final update
 *      throws P2025 and rolls the transaction back.
 *   3. DATA CORRUPTION. `sourceIssueId: params.id` on POST /links WRITES the
 *      key into a cuid foreign-key column. The row points at nothing, no
 *      constraint catches it, and it outlives the request.
 *
 * (3) is why this is a test and not a code comment. All three were live in the
 * first draft of the id-or-key change; a reviewer caught them by reading. This
 * asserts the property mechanically so the next reviewer does not have to.
 *
 * THE RULE. In any route file that imports `resolveIssueIdOrKey`, every
 * occurrence of `params.id` must be an argument to `resolveIssueIdOrKey(`.
 * Resolve once at the top; use the returned cuid everywhere after.
 *
 * SCOPE. Only files that carry the resolver are scanned. Issue routes that
 * remain deliberately id-only (`/history`, `/watch`, `/attachments`,
 * `/releases`, `/remote-links`, `/transitions`, …) use `params.id` directly
 * and are correct to — they never accept a key, so there is nothing to
 * confuse. Adding the resolver to one of those opts it into this guard
 * automatically, which is the intended coupling: you cannot turn on key
 * acceptance without the guard turning on with it.
 *
 * BOTH PASSES RUN ON COMMENT-STRIPPED SOURCE — deliberately different from
 * agent-jwt-session-guard.test.ts, whose assertion pass reads raw source. The
 * difference is not an oversight: that guard's forbidden token (`session.`)
 * has no business appearing anywhere in an opted-in route, comments included.
 * This guard's token (`params.id`) very much does — the resolution rule is
 * documented in prose at the top of app/api/issues/[id]/route.ts and
 * cross-referenced from the other four. Failing on documentation would push
 * authors to stop documenting the rule, which is the opposite of the point.
 *
 * ⚠️ THIS IS A TRIPWIRE, NOT A PROOF. Same honest limits as its sibling:
 *
 *   • ALIASING defeats it. `const raw = params.id;` then using `raw` in a
 *     query passes clean — only the literal token is matched. The pattern the
 *     routes actually use (`const issueId = resolved.id`) makes the honest
 *     path the short one, which is the real defence.
 *   • TRANSITIVE USE. A handler that passes `params` (not `params.id`) to a
 *     helper that reads `.id` is invisible here. Nothing follows imports.
 *   • DESTRUCTURING. `const { id } = params` sidesteps the token entirely.
 *   • It says nothing about whether the resolver's FIRST argument is
 *     `ctx.orgId` — the cross-org leak. That is covered by the org-isolation
 *     cases in __tests__/api/issue-id-or-key.test.ts, which exercise the real
 *     handler rather than scanning its text.
 *
 * It catches the accident — someone adding a query to a converted handler and
 * reaching for the path param out of habit. Code review covers the rest.
 */

const APP_ROOT = path.resolve(__dirname, "../..");
const API_ROOT = path.join(APP_ROOT, "app", "api");

/** Carries the id-or-key resolver, by import or call. */
const CARRIES_RESOLVER = /resolveIssueIdOrKey/;

/** Every occurrence of the raw path param. */
const PARAMS_ID = /params\.id\b/g;

/**
 * `params.id` in argument position to the resolver — the ONLY sanctioned use.
 * `[^)]*` spans the preceding `orgId, ` argument without crossing the call's
 * closing paren, so a later `params.id` on the same line is not absorbed.
 */
const RESOLVER_ARG = /resolveIssueIdOrKey\(\s*[^)]*params\.id\b/g;

function countMatches(src: string, re: RegExp): number {
  return (src.match(re) ?? []).length;
}

function walk(dir: string): string[] {
  let out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out; // a scan root that does not exist yet is not a failure
  }
  for (const entry of entries) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry === ".next") continue;
      out = out.concat(walk(full));
    } else if (entry === "route.ts" || entry === "route.tsx") {
      out.push(full);
    }
  }
  return out;
}

const resolverRoutes = walk(API_ROOT).filter((file) =>
  CARRIES_RESOLVER.test(stripComments(readFileSync(file, "utf8"))),
);

describe("routes accepting an issue key must not reuse the raw path param", () => {
  /**
   * Anti-vacuity, in two directions. If the selector regex ever stops matching
   * (a rename, an import-style change), every assertion below would pass over
   * an empty list and this guard would quietly stop guarding. The exact-count
   * assertion additionally catches the reverse mistake — a route being
   * converted without anyone extending this list — so the guard's own scope
   * stays a reviewed decision rather than a silent drift.
   */
  it("scans exactly the five converted routes", () => {
    const relative = resolverRoutes.map((f) =>
      path.relative(APP_ROOT, f).split(path.sep).join("/"),
    );
    expect(relative.sort()).toEqual([
      "app/api/issues/[id]/comments/route.ts",
      "app/api/issues/[id]/links/route.ts",
      "app/api/issues/[id]/move/route.ts",
      "app/api/issues/[id]/route.ts",
      "app/api/issues/[id]/summary/route.ts",
    ]);
  });

  it.each(resolverRoutes.map((f) => [path.relative(APP_ROOT, f), f]))(
    "%s uses params.id only as a resolver argument",
    (_label, file) => {
      const src = stripComments(readFileSync(file as string, "utf8"));
      const total = countMatches(src, PARAMS_ID);
      const resolverArgs = countMatches(src, RESOLVER_ARG);

      // Every handler in these files resolves, so there is always at least one.
      expect(total).toBeGreaterThan(0);
      expect(resolverArgs).toBe(total);
    },
  );
});

describe("the guard's own matching", () => {
  it("accepts a resolved handler", () => {
    const src = `
      const resolved = await resolveIssueIdOrKey(orgId, params.id);
      const issueId = resolved.id;
      await db.qtIssue.findMany({ where: { parentId: issueId } });
    `;
    expect(countMatches(src, PARAMS_ID)).toBe(countMatches(src, RESOLVER_ARG));
  });

  /** The silent-200 regression: a second use slipped into a query. */
  it("rejects a query that reaches for the raw path param", () => {
    const src = `
      const resolved = await resolveIssueIdOrKey(orgId, params.id);
      await db.qtIssue.findMany({ where: { parentId: params.id } });
    `;
    expect(countMatches(src, PARAMS_ID)).toBe(2);
    expect(countMatches(src, RESOLVER_ARG)).toBe(1);
  });

  /** The data-corruption regression: a raw key written to a cuid FK column. */
  it("rejects a write that stores the raw path param", () => {
    const src = `
      const resolved = await resolveIssueIdOrKey(orgId, params.id);
      await db.qtIssueLink.create({ data: { sourceIssueId: params.id } });
    `;
    expect(countMatches(src, RESOLVER_ARG)).toBeLessThan(
      countMatches(src, PARAMS_ID),
    );
  });

  it("does not absorb a second params.id sharing a line with the resolver call", () => {
    const src = `const r = await resolveIssueIdOrKey(orgId, params.id); log(params.id);`;
    expect(countMatches(src, PARAMS_ID)).toBe(2);
    expect(countMatches(src, RESOLVER_ARG)).toBe(1);
  });

  it("ignores params.id appearing only in prose", () => {
    const src = `
      // The raw params.id must never reach a query.
      /* Not even here: params.id. */
      const resolved = await resolveIssueIdOrKey(orgId, params.id);
    `;
    const stripped = stripComments(src);
    expect(countMatches(stripped, PARAMS_ID)).toBe(1);
    expect(countMatches(stripped, RESOLVER_ARG)).toBe(1);
  });
});
