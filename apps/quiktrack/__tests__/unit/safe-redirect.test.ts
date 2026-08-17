import { describe, expect, it } from "vitest";
import { safeInternalPath } from "@/lib/utils/safe-redirect";

describe("safeInternalPath", () => {
  it("preserves the work-item deep link a signed-out user was sent", () => {
    expect(safeInternalPath("/browse/SCRUM-58", "/dashboard")).toBe("/browse/SCRUM-58");
    expect(safeInternalPath("/spaces/p1/work/i1", "/dashboard")).toBe("/spaces/p1/work/i1");
  });

  it("keeps the query string and hash intact", () => {
    expect(safeInternalPath("/browse/SCRUM-58?tab=comments#c3", "/dashboard")).toBe(
      "/browse/SCRUM-58?tab=comments#c3",
    );
  });

  it("falls back when absent or empty", () => {
    expect(safeInternalPath(null, "/dashboard")).toBe("/dashboard");
    expect(safeInternalPath(undefined, "/dashboard")).toBe("/dashboard");
    expect(safeInternalPath("", "/dashboard")).toBe("/dashboard");
  });

  it("rejects off-origin destinations (open-redirect guard)", () => {
    for (const evil of [
      "https://evil.test/phish",
      "http://evil.test",
      "//evil.test/phish",
      "/\\evil.test/phish",
      "javascript:alert(1)",
      "dashboard",
    ]) {
      expect(safeInternalPath(evil, "/dashboard")).toBe("/dashboard");
    }
  });

  it("honours the caller's fallback", () => {
    expect(safeInternalPath(null, "/")).toBe("/");
    expect(safeInternalPath("//evil.test", "/")).toBe("/");
  });
});
