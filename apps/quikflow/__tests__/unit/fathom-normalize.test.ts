/**
 * Fathom payload normalisation — the fields that reach QuikScale at all.
 *
 * Every assertion here traces to something Fathom's own UI displays that the
 * app did not, so the suite reads as a list of things that were silently lost:
 *
 *   · action-item timestamps ("@ 0:49") — never parsed
 *   · action-item assignees — parsed with a string-only helper, so Fathom's
 *     object-shaped assignee became null with no error
 *   · whole attendees — `pick()` returned the FIRST non-null list, so when
 *     Fathom sent calendar invitees AND identified people, one list vanished
 *
 * "Silently" is the operative word in all three: nothing threw, nothing logged,
 * the data just wasn't there. Hence the tests.
 */
import { describe, it, expect } from "vitest";
import { normalizeMeeting, meetingToEventData, clockToSeconds } from "@/lib/connectors/fathom";

describe("clockToSeconds", () => {
  it("parses the clock forms Fathom shows", () => {
    expect(clockToSeconds("0:49")).toBe(49);
    expect(clockToSeconds("1:50")).toBe(110);
    expect(clockToSeconds("1:02:03")).toBe(3723);
    expect(clockToSeconds("49")).toBe(49);
    expect(clockToSeconds(49)).toBe(49);
    expect(clockToSeconds(142.5)).toBe(142.5);
  });

  it("returns null rather than 0 for absent or unparseable input", () => {
    // "missing" and "at the very start" must stay distinguishable.
    expect(clockToSeconds(null)).toBeNull();
    expect(clockToSeconds(undefined)).toBeNull();
    expect(clockToSeconds("")).toBeNull();
    expect(clockToSeconds("later")).toBeNull();
    expect(clockToSeconds(-5)).toBeNull();
    expect(clockToSeconds("1:2:3:4")).toBeNull();
  });
});

describe("normalizeMeeting — action items", () => {
  it("keeps the assignee when Fathom sends an OBJECT, not a string", () => {
    // The regression that mattered: str() nulled this, and an item with no
    // assignee is indistinguishable from an unassigned one.
    const m = normalizeMeeting({
      recording_id: 1,
      action_items: [{ text: "Optimize and align KPIs", assignee: { name: "Rohit Deshmukh", email: "rohit@example.com" } }],
    })!;
    expect(m.actionItems[0].assignee).toBe("Rohit Deshmukh");
    expect(m.actionItems[0].assigneeEmail).toBe("rohit@example.com");
  });

  it("still accepts a plain-string assignee", () => {
    const m = normalizeMeeting({ recording_id: 1, action_items: [{ text: "Do it", assignee: "Rohit Deshmukh" }] })!;
    expect(m.actionItems[0].assignee).toBe("Rohit Deshmukh");
    expect(m.actionItems[0].assigneeEmail).toBeNull();
  });

  it("falls back to the assignee's email when no name is given", () => {
    const m = normalizeMeeting({ recording_id: 1, action_items: [{ text: "Do it", assignee: { email: "rohit@example.com" } }] })!;
    expect(m.actionItems[0].assignee).toBe("rohit@example.com");
  });

  it("reads the timestamp from a numeric field", () => {
    const m = normalizeMeeting({ recording_id: 1, action_items: [{ text: "Do it", timestamp: 49 }] })!;
    expect(m.actionItems[0].timestampSeconds).toBe(49);
  });

  it("reads the timestamp from a clock string", () => {
    const m = normalizeMeeting({ recording_id: 1, action_items: [{ text: "Do it", recording_timestamp: "1:50" }] })!;
    expect(m.actionItems[0].timestampSeconds).toBe(110);
  });

  it("reads the timestamp out of a playback URL query param", () => {
    // The citation format Fathom uses in its own summaries, so the likeliest
    // real carrier of a per-item offset.
    const m = normalizeMeeting({
      recording_id: 1,
      action_items: [{ text: "Do it", recording_playback_url: "https://fathom.video/calls/883?timestamp=142.5" }],
    })!;
    expect(m.actionItems[0].timestampSeconds).toBe(142.5);
  });

  it("leaves the timestamp null when Fathom sends none, rather than inventing 0:00", () => {
    const m = normalizeMeeting({ recording_id: 1, action_items: [{ text: "Do it" }] })!;
    expect(m.actionItems[0].timestampSeconds).toBeNull();
  });

  it("captures completed state and the source id when present", () => {
    const m = normalizeMeeting({ recording_id: 1, action_items: [{ text: "Do it", completed: false, id: "ai_9" }] })!;
    expect(m.actionItems[0].completed).toBe(false);
    expect(m.actionItems[0].sourceId).toBe("ai_9");
  });

  it("still handles a bare-string action item", () => {
    const m = normalizeMeeting({ recording_id: 1, action_items: ["Send the deck"] })!;
    expect(m.actionItems[0]).toMatchObject({ text: "Send the deck", assignee: null, timestampSeconds: null });
  });

  it("drops an item with no text", () => {
    const m = normalizeMeeting({ recording_id: 1, action_items: [{ assignee: "Someone" }, { text: "Real" }] })!;
    expect(m.actionItems).toHaveLength(1);
  });
});

describe("normalizeMeeting — attendees", () => {
  /** Exactly what Fathom's UI shows: 3 invitee emails + 2 identified people. */
  const TWO_LISTS = {
    recording_id: 1,
    calendar_invitees: [
      { email: "priya.nair@democlient.example" },
      { email: "rahul.verma@democlient.example" },
      { email: "alexgiver601@gmail.com" },
    ],
    team_members: [
      { name: "Himanshu Sajankar", email: "himanshu@moreyeahs.com", linkedin_url: "https://linkedin.com/in/hs" },
      { name: "Rohit Deshmukh", email: "rohit@moreyeahs.com" },
    ],
  };

  it("MERGES both lists instead of reading only the first", () => {
    // The old `pick()` returned calendar_invitees and threw team_members away —
    // two whole people missing from the app with no error anywhere.
    const m = normalizeMeeting(TWO_LISTS)!;
    expect(m.attendees).toHaveLength(5);
  });

  it("tags each person with which list they came from", () => {
    const m = normalizeMeeting(TWO_LISTS)!;
    expect(m.attendees.filter((a) => a.isInvitee)).toHaveLength(3);
    expect(m.attendees.filter((a) => a.isIdentified)).toHaveLength(2);
    expect(m.attendees.find((a) => a.name === "Rohit Deshmukh")).toMatchObject({
      isIdentified: true,
      isInvitee: false,
      email: "rohit@moreyeahs.com",
    });
  });

  it("unions the flags for someone in BOTH lists, without duplicating them", () => {
    const m = normalizeMeeting({
      recording_id: 1,
      calendar_invitees: [{ email: "Rohit@Moreyeahs.com" }],
      team_members: [{ name: "Rohit Deshmukh", email: "rohit@moreyeahs.com" }],
    })!;
    expect(m.attendees).toHaveLength(1);
    expect(m.attendees[0]).toMatchObject({ name: "Rohit Deshmukh", isInvitee: true, isIdentified: true });
  });

  it("keeps a LinkedIn URL only when Fathom actually sends one", () => {
    const m = normalizeMeeting(TWO_LISTS)!;
    expect(m.attendees.find((a) => a.name === "Himanshu Sajankar")?.linkedinUrl).toBe("https://linkedin.com/in/hs");
    expect(m.attendees.find((a) => a.name === "Rohit Deshmukh")?.linkedinUrl).toBeNull();
  });

  it("still handles the single-list and bare-string shapes", () => {
    const m = normalizeMeeting({ recording_id: 1, attendees: ["jane@acme.com", { name: "Bob" }] })!;
    expect(m.attendees).toHaveLength(2);
    expect(m.attendees[0]).toMatchObject({ email: "jane@acme.com", isInvitee: true });
  });

  it("feeds every attendee email to the matcher, from both lists", () => {
    // Wider recall is right here — an identified-but-not-invited person is
    // still evidence of which client the meeting belongs to.
    const data = meetingToEventData(normalizeMeeting(TWO_LISTS)!);
    expect(data.attendeeCount).toBe(5);
    expect(String(data.attendeeEmails)).toContain("rohit@moreyeahs.com");
    expect(String(data.attendeeEmails)).toContain("priya.nair@democlient.example");
  });
});

describe("normalizeMeeting — summary", () => {
  it("reads Fathom's markdown summary from default_summary", () => {
    const m = normalizeMeeting({
      recording_id: 1,
      default_summary: { markdown_formatted: "## Key Takeaways\n- Shipped" },
    })!;
    expect(m.summary).toBe("## Key Takeaways\n- Shipped");
  });

  it("accepts a plain-string summary", () => {
    expect(normalizeMeeting({ recording_id: 1, summary: "Short one" })!.summary).toBe("Short one");
  });

  it("is null when Fathom sent none — the case the backfill exists for", () => {
    expect(normalizeMeeting({ recording_id: 1 })!.summary).toBeNull();
  });
});
