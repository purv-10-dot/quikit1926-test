import { describe, it, expect } from "vitest";
import {
  calendarDayInTz,
  linkedInConversationExternalId,
  LINKEDIN_CONVERSATION_CODE,
  LINKEDIN_CONVERSATION_LABEL,
} from "@/lib/services/activities/linkedin-conversation-activity";
import { DEFAULT_ACTIVITY_TYPES } from "@/lib/activities/activity-types-defaults";

/**
 * The "one LinkedIn Conversation activity per prospect per calendar day" rule
 * is enforced by the (orgId, sourceSystem, externalId) unique index, so these
 * tests pin the externalId's collision behaviour — that key IS the rule.
 */
describe("linkedin conversation activity key", () => {
  it("is stable for the same prospect on the same day", () => {
    const morning = new Date("2026-08-13T09:00:00Z");
    const afternoon = new Date("2026-08-13T14:00:00Z");
    const evening = new Date("2026-08-13T20:00:00Z");

    const a = linkedInConversationExternalId("prospect-1", morning, "UTC");
    const b = linkedInConversationExternalId("prospect-1", afternoon, "UTC");
    const c = linkedInConversationExternalId("prospect-1", evening, "UTC");

    // Three saves across one day → one key → logActivity upserts to one row.
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it("differs across calendar days (same prospect)", () => {
    const day1 = linkedInConversationExternalId("p1", new Date("2026-08-13T23:00:00Z"), "UTC");
    const day2 = linkedInConversationExternalId("p1", new Date("2026-08-14T01:00:00Z"), "UTC");
    expect(day1).not.toBe(day2);
  });

  it("differs across prospects (same day)", () => {
    const when = new Date("2026-08-13T09:00:00Z");
    expect(linkedInConversationExternalId("p1", when, "UTC")).not.toBe(
      linkedInConversationExternalId("p2", when, "UTC"),
    );
  });

  it("uses the supplied timezone to decide the calendar day", () => {
    // 20:30 UTC on the 13th is already the 14th in Asia/Kolkata (+05:30).
    const instant = new Date("2026-08-13T20:30:00Z");
    expect(calendarDayInTz(instant, "UTC")).toBe("2026-08-13");
    expect(calendarDayInTz(instant, "Asia/Kolkata")).toBe("2026-08-14");

    expect(linkedInConversationExternalId("p1", instant, "UTC")).not.toBe(
      linkedInConversationExternalId("p1", instant, "Asia/Kolkata"),
    );
  });

  it("falls back to UTC for an invalid timezone rather than throwing", () => {
    expect(calendarDayInTz(new Date("2026-08-13T09:00:00Z"), "Not/AZone")).toBe("2026-08-13");
  });

  it("produces the documented key shape", () => {
    expect(linkedInConversationExternalId("abc", new Date("2026-08-13T09:00:00Z"), "UTC")).toBe(
      "linkedin-conversation:abc:2026-08-13",
    );
  });
});

describe("linkedin conversation activity type default", () => {
  it("is registered exactly once in the defaults", () => {
    const matches = DEFAULT_ACTIVITY_TYPES.filter(
      (t) => t.code === LINKEDIN_CONVERSATION_CODE,
    );
    expect(matches).toHaveLength(1);
    expect(matches[0].label).toBe(LINKEDIN_CONVERSATION_LABEL);
  });

  it("does not collide with any other default code", () => {
    const codes = DEFAULT_ACTIVITY_TYPES.map((t) => t.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});
