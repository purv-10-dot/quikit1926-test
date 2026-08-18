import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * GUARD TEST — a route that accepts an agent JWT must not read `ctx.session`.
 *
 * `resolveAgentJwtIdentity` (lib/api/withOrgAuth.ts) builds a synthetic session
 * with exactly two fields:
 *
 *     { user: { id, orgId }, expires: "" } as unknown as Session
 *
 * No `email`, no `name`, no `isSuperAdmin`, no `membershipRole`. A handler that
 * reads any of those under an agent JWT gets `undefined` and carries on — so a
 * route deriving authorization from `session.user.isSuperAdmin` would silently
 * treat every agent caller as a non-admin instead of failing. That is exactly
 * why `/api/me/permissions` carries a "DO NOT add allowAgentJwt" comment.
 *
 * The `as unknown as Session` cast means TypeScript cannot catch this. Hence a
 * text scan. Opted-in routes must derive authorization from `ctx.userId` /
 * `ctx.orgId` and the project-access helpers, never from `ctx.session`.
 *
 * TWO PASSES OVER DIFFERENT TEXT, deliberately:
 *
 *   • The SELECTOR (which files are opted in) runs on comment-stripped source.
 *     `/api/me/permissions` documents its refusal by quoting the literal
 *     `{ allowAgentJwt: true }` inside a comment; matching raw source would
 *     pull that route into the scan and fail it on its legitimate
 *     `session.user.isSuperAdmin` read. Stripping is what keeps a route's
 *     *documentation* of the flag distinct from its *use* of it.
 *   • The ASSERTION (does it read session) runs on raw source, comments
 *     included. A comment is not a safe place to describe a session read in a
 *     route that accepts agent JWTs, and failing loudly on one is cheap.
 *
 * ⚠️ THIS IS A TRIPWIRE, NOT A PROOF. It is a text scan, not an AST pass or a
 * type check, and it is defeatable:
 *
 *   • TRANSITIVE READS (the real risk, and the one that would actually
 *     happen). Only the route file itself is scanned. A route that passes
 *     `ctx` to a helper in `lib/` which reads `ctx.session.membershipRole`
 *     passes this guard clean. Nothing here follows imports.
 *   • DESTRUCTURING. `const { user } = ctx.session; user.isSuperAdmin` trips
 *     on the first line, but the same split across a helper, or a re-exported
 *     alias, may not.
 *   • DYNAMIC ACCESS. `session.user["isSuperAdmin"]`, or a computed key.
 *   • COMMENT STRIPPING is a hand-rolled scanner, not a parser. It tracks
 *     string and template literals so a `//` inside `"http://…"` cannot eat
 *     the rest of the line (which would hide a real opt-in), but it does not
 *     understand regex literals — `/\/\//` and friends are not used in these
 *     route files, and a false negative there would need a regex literal on
 *     the same line as the opt-in.
 *   • FALSE POSITIVES, deliberately tolerated. A comment containing the
 *     literal text `session.` in an opted-in route trips the assertion. That
 *     is the safe direction — it fails loudly and the comment can be reworded.
 *
 * It catches the accident (someone opting a route in without reading the
 * session-shape constraint), not the determined workaround. Code review covers
 * the rest — the same honest limitation pilot-status-write-guard.test.ts
 * documents about itself.
 */

const APP_ROOT = path.resolve(__dirname, "../..");
const API_ROOT = path.join(APP_ROOT, "app", "api");

/**
 * Matches the opt-in wherever it is expressed — `withOrgAuth(..., {
 * allowAgentJwt: true })` on a route, and `withProjectAccess(..., {
 * allowAgentJwt: true })` on the routes that go through that wrapper. Keying
 * on the option rather than the wrapper is what stops a passthrough route from
 * slipping the scan entirely.
 */
const OPT_IN = /allowAgentJwt:\s*true/;

/** Any `session.` member access. Does not match "session cookie" or
 *  "session/API-token" in prose. */
const SESSION_ACCESS = /\bsession\s*\./;

/** The two fields that make a silent misclassification, called out by name so
 *  a failure message says what went wrong rather than just "matched". */
const FORBIDDEN_FIELDS = ["isSuperAdmin", "membershipRole"];

/**
 * Remove `//` line comments and block comments, leaving everything else —
 * including newlines — in place so line structure survives.
 *
 * String and template literals are tracked so a `//` inside a URL string does
 * not swallow the rest of the line. That direction matters: over-stripping
 * would drop a real `allowAgentJwt: true` and silently exclude a route from
 * the scan, which is the failure this guard exists to prevent.
 */
export function stripComments(src: string): string {
  type State = "code" | "line" | "block" | "single" | "double" | "template";
  let state: State = "code";
  let out = "";
  let i = 0;

  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];

    if (state === "code") {
      if (c === "/" && next === "/") {
        state = "line";
        i += 2;
        continue;
      }
      if (c === "/" && next === "*") {
        state = "block";
        i += 2;
        continue;
      }
      if (c === "'") state = "single";
      else if (c === '"') state = "double";
      else if (c === "`") state = "template";
      out += c;
      i++;
      continue;
    }

    if (state === "line") {
      if (c === "\n") {
        state = "code";
        out += c;
      }
      i++;
      continue;
    }

    if (state === "block") {
      if (c === "*" && next === "/") {
        state = "code";
        i += 2;
        continue;
      }
      if (c === "\n") out += c; // keep line numbers honest
      i++;
      continue;
    }

    // Inside a string or template literal — copy verbatim, honour escapes.
    if (c === "\\") {
      out += c + (next ?? "");
      i += 2;
      continue;
    }
    if (
      (state === "single" && c === "'") ||
      (state === "double" && c === '"') ||
      (state === "template" && c === "`")
    ) {
      state = "code";
    }
    out += c;
    i++;
  }

  return out;
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

const optedInRoutes = walk(API_ROOT).filter((file) =>
  OPT_IN.test(stripComments(readFileSync(file, "utf8"))),
);

describe("agent-JWT routes must not read ctx.session", () => {
  // Anti-vacuity: if the opt-in regex ever stops matching (a formatting change,
  // a rename), every assertion below would pass over an empty list and this
  // guard would quietly stop guarding.
  it("finds at least one opted-in route to scan", () => {
    expect(optedInRoutes.length).toBeGreaterThan(0);
  });

  it.each(optedInRoutes.map((f) => [path.relative(APP_ROOT, f), f]))(
    "%s reads nothing from ctx.session",
    (_label, file) => {
      const source = readFileSync(file as string, "utf8");
      expect(SESSION_ACCESS.test(source)).toBe(false);
      for (const field of FORBIDDEN_FIELDS) {
        expect(source).not.toContain(field);
      }
    },
  );
});

describe("the selector ignores commented-out occurrences", () => {
  it("does not match a line-commented opt-in", () => {
    const src = `// DO NOT add { allowAgentJwt: true } to this route.\nexport const GET = withOrgAuth(handler);\n`;
    expect(OPT_IN.test(stripComments(src))).toBe(false);
  });

  it("does not match a block-commented opt-in", () => {
    const src = `/**\n * Never pass { allowAgentJwt: true } here.\n */\nexport const GET = withOrgAuth(handler);\n`;
    expect(OPT_IN.test(stripComments(src))).toBe(false);
  });

  it("still matches a real opt-in (positive control)", () => {
    const src = `export const GET = withOrgAuth(handler, { allowAgentJwt: true });\n`;
    expect(OPT_IN.test(stripComments(src))).toBe(true);
  });

  it("does not let a URL's // swallow an opt-in later on the same line", () => {
    const src = `const u = "http://localhost"; export const GET = withOrgAuth(h, { allowAgentJwt: true });\n`;
    expect(OPT_IN.test(stripComments(src))).toBe(true);
  });

  /**
   * The concrete regression: /api/me/permissions documents its refusal by
   * quoting the flag, and legitimately reads session.user.isSuperAdmin. It
   * must not be selected. This is an assertion about the selector, NOT a
   * path exemption — if that route is ever genuinely opted in, this test
   * fails and the session assertion above fails with it.
   */
  it("does not select /api/me/permissions, which only quotes the flag in a comment", () => {
    const file = path.join(API_ROOT, "me", "permissions", "route.ts");
    const raw = readFileSync(file, "utf8");
    expect(OPT_IN.test(raw)).toBe(true); // the comment really is there
    expect(OPT_IN.test(stripComments(raw))).toBe(false); // …and only there
    expect(optedInRoutes).not.toContain(file);
  });
});
