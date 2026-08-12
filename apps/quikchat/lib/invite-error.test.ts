import { describe, expect, it } from "vitest";
import { inviteErrorMessage } from "./invite-error";

/**
 * The bug being fixed was a LIE, not a missing feature: every failed accept
 * rendered "…It may have expired, been revoked, or reached its limit", which is
 * false for a user in the wrong org or without QuikChat access. So these tests
 * are as much about what the mapper refuses to say as what it says.
 */
describe("inviteErrorMessage", () => {
  it("prefers the server's own message — it is more specific than any status", () => {
    // 410 alone cannot distinguish these four; the server can.
    expect(inviteErrorMessage(410, "This invite was revoked")).toBe("This invite was revoked");
    expect(inviteErrorMessage(410, "This invite has expired")).toBe("This invite has expired");
    expect(inviteErrorMessage(410, "This invite has reached its use limit")).toBe(
      "This invite has reached its use limit",
    );
    expect(inviteErrorMessage(410, "Channel no longer exists")).toBe("Channel no longer exists");
  });

  it("distinguishes the two 403s the server can send", () => {
    expect(inviteErrorMessage(403, "QuikChat access required")).toBe("QuikChat access required");
    expect(inviteErrorMessage(403, "This invite belongs to a different organisation")).toBe(
      "This invite belongs to a different organisation",
    );
  });

  it("falls back per status when the response carried no body", () => {
    expect(inviteErrorMessage(403)).toBe("You don't have access to this invite.");
    expect(inviteErrorMessage(404)).toBe("This invite link isn't valid.");
    expect(inviteErrorMessage(410)).toBe("This invite is no longer usable.");
  });

  it("treats an empty or whitespace-only server message as absent", () => {
    expect(inviteErrorMessage(404, "")).toBe("This invite link isn't valid.");
    expect(inviteErrorMessage(404, "   ")).toBe("This invite link isn't valid.");
    expect(inviteErrorMessage(404, null)).toBe("This invite link isn't valid.");
  });

  it("trims a server message rather than rendering its padding", () => {
    expect(inviteErrorMessage(410, "  This invite has expired  ")).toBe("This invite has expired");
  });

  // THE ONE THAT MATTERS MOST. An unrecognised status is exactly where the old
  // copy went wrong — it asserted expiry/revocation/limit for failures that were
  // none of those. The fallback must claim NO cause it cannot know.
  it("invents no cause for an unknown status", () => {
    for (const status of [400, 418, 429, 500, 502, 0]) {
      const msg = inviteErrorMessage(status);
      expect(msg).toBe("This invite couldn't be opened.");
      expect(msg).not.toMatch(/expire|revoke|limit|organisation|access/i);
    }
  });

  it("still prefers the server's message on an unknown status", () => {
    expect(inviteErrorMessage(500, "Something specific broke")).toBe("Something specific broke");
  });
});
