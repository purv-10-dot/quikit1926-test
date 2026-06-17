import { describe, expect, it } from "vitest";
import {
  normalizeInviteEmail,
  resolveTemplateIdsForRole,
  shouldSendInviteEmail,
} from "@/lib/services/settings/invite-helpers";

describe("invite-helpers", () => {
  it("normalizes email", () => {
    expect(normalizeInviteEmail("  User@Example.COM ")).toBe("user@example.com");
  });

  it("resolves template by CRM role when none passed", () => {
    const ids = resolveTemplateIdsForRole(
      "SalesUser",
      [],
      [
        { id: "t1", name: "Finance" },
        { id: "t2", name: "Sales User" },
      ],
    );
    expect(ids).toEqual(["t2"]);
  });

  it("skips invite email when linking existing member", () => {
    expect(
      shouldSendInviteEmail({ linkExistingUserId: "u1", invitationToken: "tok" }),
    ).toBe(false);
    expect(shouldSendInviteEmail({ invitationToken: "tok" })).toBe(true);
  });
});
