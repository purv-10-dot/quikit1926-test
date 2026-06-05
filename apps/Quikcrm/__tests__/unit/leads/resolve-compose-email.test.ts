import { describe, expect, it } from "vitest";
import { resolveLeadComposeEmail } from "@/lib/leads/resolve-compose-email";
import { resolveComposeEmailAccess } from "@/lib/services/leads/full-record";

describe("resolveLeadComposeEmail", () => {
  it("prefers primary over secondary", () => {
    expect(
      resolveLeadComposeEmail({
        email: " primary@x.com ",
        secondaryEmail: "sec@x.com",
      }),
    ).toBe("primary@x.com");
  });

  it("falls back to secondary", () => {
    expect(
      resolveLeadComposeEmail({ email: null, secondaryEmail: "sec@x.com" }),
    ).toBe("sec@x.com");
  });
});

describe("resolveComposeEmailAccess", () => {
  it("marks missing when no address on file", () => {
    expect(resolveComposeEmailAccess({}, {})).toEqual({
      to: null,
      blockReason: "missing",
    });
  });

  it("marks hidden when address existed before mask", () => {
    expect(
      resolveComposeEmailAccess(
        { email: "a@b.com" },
        { email: null },
      ),
    ).toEqual({ to: null, blockReason: "hidden" });
  });

  it("returns visible address", () => {
    expect(
      resolveComposeEmailAccess(
        { email: "a@b.com" },
        { email: "a@b.com" },
      ),
    ).toEqual({ to: "a@b.com", blockReason: null });
  });
});
