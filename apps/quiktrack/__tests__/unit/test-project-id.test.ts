import { describe, expect, it } from "vitest";
import {
  assertResolvedProjectId,
  isResolvedProjectId,
} from "@/lib/test/projectId";

/**
 * Guard against a `projectKey` reaching a write path expecting a cuid.
 *
 * This existed as a real bug: QuikTest read endpoints filtered rows by the raw
 * URL value, so `/spaces/QUIKTR/test` matched nothing and rendered an empty
 * repository — which reads as "my data was deleted" rather than "wrong
 * identifier". The write paths were worse: they would have stored "QUIKTR" in
 * the projectId column, producing rows no id-based query returns and bypassing
 * the (projectId, automationId) uniqueness index.
 */

describe("isResolvedProjectId", () => {
  it("accepts a real cuid", () => {
    expect(isResolvedProjectId("cmpqrve90001t97sjla4q6qp0")).toBe(true);
  });

  it("rejects the project keys this app actually uses", () => {
    for (const key of ["QUIKTR", "CHATAP", "AB", "QUIKSC", "UXLHRM"]) {
      expect(isResolvedProjectId(key)).toBe(false);
    }
  });

  it("rejects an empty string", () => {
    expect(isResolvedProjectId("")).toBe(false);
  });

  it("rejects a lowercase word that is not a cuid", () => {
    // Starts with "c" but far too short to be a cuid.
    expect(isResolvedProjectId("chat")).toBe(false);
  });

  it("rejects an uppercase string of cuid length", () => {
    expect(isResolvedProjectId("CMPQRVE90001T97SJLA4Q6QP0")).toBe(false);
  });
});

describe("assertResolvedProjectId", () => {
  it("passes a cuid through silently", () => {
    expect(() => assertResolvedProjectId("cmpqrve90001t97sjla4q6qp0")).not.toThrow();
  });

  it("throws on a project key, naming the fix", () => {
    expect(() => assertResolvedProjectId("QUIKTR")).toThrow(
      /looks like a project key, not an id/,
    );
    // The message must point at the resolver, not just complain.
    expect(() => assertResolvedProjectId("QUIKTR")).toThrow(/gateProjectResolved/);
  });

  it("throws on an empty value", () => {
    expect(() => assertResolvedProjectId("")).toThrow(/required/);
  });
});
