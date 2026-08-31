/**
 * Redaction of a captured Fathom payload.
 *
 * This is the gate between "a real client's meeting" and "a file committed to
 * git forever", so the suite is weighted toward the ways redaction fails
 * QUIETLY: a name that survives inside a sentence, a person who gets two
 * different pseudonyms in two fields, a re-run that produces a different file.
 *
 * The structural assertions matter just as much: the fixture exists to test
 * parsing, so timestamps, key names, ordering and array lengths must come
 * through untouched. Redaction that also mangles the shape produces a fixture
 * that tests nothing.
 */
import { describe, it, expect } from "vitest";
import { redactFathomPayload, assertRedacted } from "../../scripts/redactFathomPayload";

/** Shaped like a real Fathom list item, with the same person in three places. */
const PAYLOAD = {
  recording_id: 883,
  title: "Daily Huddle — emossy 121",
  started_at: "2026-08-21T09:00:00.000Z",
  duration_seconds: 612,
  recording_url: "https://fathom.video/calls/883",
  calendar_invitees: [
    { name: null, email: "priya.nair@realclient.com" },
    { name: null, email: "rahul.verma@realclient.com" },
  ],
  team_members: [
    { name: "Himanshu Sajankar", email: "himanshu@moreyeahs.com", linkedin_url: "https://linkedin.com/in/himanshu-sajankar" },
    { name: "Rohit Deshmukh", email: "rohit@moreyeahs.com" },
  ],
  transcript: [
    { speaker: { display_name: "Rohit Deshmukh" }, text: "Himanshu, can you check the KPI list?", timestamp: 49 },
    { speaker: { display_name: "Himanshu Sajankar" }, text: "Yeah, that's up too.", timestamp: 61.5 },
  ],
  default_summary: {
    markdown_formatted:
      "## Key Takeaways\n- Rohit Deshmukh to align KPIs ([View](https://fathom.video/calls/883?timestamp=49.0))",
  },
  action_items: [
    { text: "Optimize and align KPIs", assignee: { name: "Rohit Deshmukh", email: "rohit@moreyeahs.com" }, timestamp: 49 },
  ],
};

describe("redactFathomPayload — identifiers", () => {
  const { payload, map } = redactFathomPayload(PAYLOAD);
  const json = JSON.stringify(payload);

  it("replaces every real email", () => {
    expect(json).not.toMatch(/realclient\.com/);
    expect(json).not.toMatch(/moreyeahs\.com/);
    expect(json).toMatch(/@democlient\.example/);
  });

  it("replaces every real name, including inside prose", () => {
    expect(json).not.toMatch(/Rohit/i);
    expect(json).not.toMatch(/Deshmukh/i);
    expect(json).not.toMatch(/Himanshu/i);
    expect(json).not.toMatch(/Sajankar/i);
  });

  it("gives one person the SAME pseudonym in attendees, transcript and action items", () => {
    // Without this the fixture silently loses the joins it exists to test.
    const p = payload as typeof PAYLOAD;
    const fromRoster = p.team_members[1].name;
    expect(p.transcript[0].speaker.display_name).toBe(fromRoster);
    expect(p.action_items[0].assignee.name).toBe(fromRoster);
    expect(p.default_summary.markdown_formatted).toContain(fromRoster);
  });

  it("scrubs the real recording id out of URLs", () => {
    const p = payload as typeof PAYLOAD;
    expect(p.recording_url).not.toContain("/883");
    expect(p.default_summary.markdown_formatted).not.toContain("/calls/883");
    expect(map.recordingIds["883"]).toBeDefined();
  });

  it("scrubs the LinkedIn slug", () => {
    expect(json).not.toContain("himanshu-sajankar");
  });
});

describe("redactFathomPayload — structure is a fact under test", () => {
  const { payload } = redactFathomPayload(PAYLOAD);
  const p = payload as typeof PAYLOAD;

  it("preserves every timestamp and duration exactly", () => {
    expect(p.started_at).toBe("2026-08-21T09:00:00.000Z");
    expect(p.duration_seconds).toBe(612);
    expect(p.transcript[0].timestamp).toBe(49);
    expect(p.transcript[1].timestamp).toBe(61.5);
    expect(p.action_items[0].timestamp).toBe(49);
  });

  it("preserves key names, array lengths and ordering", () => {
    expect(Object.keys(p)).toEqual(Object.keys(PAYLOAD));
    expect(p.calendar_invitees).toHaveLength(2);
    expect(p.team_members).toHaveLength(2);
    expect(p.transcript).toHaveLength(2);
    expect(Object.keys(p.team_members[0])).toEqual(["name", "email", "linkedin_url"]);
  });

  it("leaves non-identifying prose readable", () => {
    expect(p.transcript[1].text).toBe("Yeah, that's up too.");
    expect(p.action_items[0].text).toBe("Optimize and align KPIs");
    expect(p.transcript[0].text).toMatch(/can you check the KPI list\?$/);
  });

  it("does not mutate the input", () => {
    expect(PAYLOAD.team_members[1].name).toBe("Rohit Deshmukh");
    expect(PAYLOAD.calendar_invitees[0].email).toBe("priya.nair@realclient.com");
  });
});

describe("redactFathomPayload — determinism", () => {
  it("is byte-identical across runs, so re-capturing does not churn the fixture", () => {
    const a = redactFathomPayload(PAYLOAD);
    const b = redactFathomPayload(PAYLOAD);
    expect(JSON.stringify(a.payload)).toBe(JSON.stringify(b.payload));
    expect(a.map).toEqual(b.map);
  });
});

describe("assertRedacted — the safety net", () => {
  it("passes a properly redacted payload", () => {
    const { payload, map } = redactFathomPayload(PAYLOAD);
    expect(assertRedacted(payload, map)).toEqual([]);
  });

  it("names the JSON path of a leaked email", () => {
    const { map } = redactFathomPayload(PAYLOAD);
    const tampered = { attendees: [{ email: "someone@realclient.com" }] };
    const problems = assertRedacted(tampered, map);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("attendees[0].email");
    expect(problems[0]).toContain("someone@realclient.com");
  });

  it("catches a real name that survived inside free text", () => {
    const { map } = redactFathomPayload(PAYLOAD);
    const tampered = { transcript: [{ text: "Thanks Rohit Deshmukh, appreciated." }] };
    const problems = assertRedacted(tampered, map);
    expect(problems.some((p) => p.includes("real name survived"))).toBe(true);
  });

  it("catches a real recording id that survived in a URL", () => {
    const { map } = redactFathomPayload(PAYLOAD);
    const problems = assertRedacted({ url: "https://fathom.video/calls/883" }, map);
    expect(problems.some((p) => p.includes("recording id survived"))).toBe(true);
  });
});
