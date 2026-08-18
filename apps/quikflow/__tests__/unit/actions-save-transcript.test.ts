import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * quikscale.save_transcript executor — the QuikFlow side of the Fathom flow:
 * a "meeting transcript is ready" event → forward the transcript to QuikScale's
 * internal save-transcript endpoint (which matches it to a client & stores it in
 * Meeting Rhythm). We mock the outbound fetch and assert the forwarded payload.
 */
vi.mock("@/lib/connectors", () => ({
  createCalendarEventForOrg: vi.fn(),
  deleteCalendarEventsForOrg: vi.fn(),
  sendMailForOrg: vi.fn(),
  scheduleClientMeetingsForOrg: vi.fn(),
  isCalendarConnectedForOrg: vi.fn(),
}));

import { getActionExecutor } from "@/lib/engine/actions";
import type { ActionContext } from "@/lib/engine/types";

const SECRET = "s3cr3t";
const transcribed = {
  app: "fathom",
  event: "fathom.meeting.transcribed",
  orgId: "org_A",
  dedupeKey: "fathom:rec_1",
  data: {
    recordingId: "rec_1",
    title: "Daily Huddle — Acme",
    startedAt: "2026-08-07T10:00:00Z",
    endedAt: "2026-08-07T10:15:00Z",
    durationMinutes: 15,
    attendees: [{ name: "Alok", email: "alok@moreyeahs.com" }],
    recordingUrl: "https://fathom.example/rec_1",
    transcriptText: "Full meeting transcript text…",
    summary: "Discussed the quarterly plan.",
    actionItems: ["Send the deck"],
  },
};

function ctx(data: Record<string, unknown> = transcribed.data): ActionContext {
  return {
    orgId: "org_A",
    workflowId: "wf1",
    runId: "run1",
    event: { ...transcribed, data },
    node: { id: "a1", kind: "action", label: "Save transcript", config: { actionId: "quikscale.save_transcript" } },
  } as ActionContext;
}

const origFetch = global.fetch;
beforeEach(() => {
  process.env.QUIKSCALE_URL = "http://quikscale.test";
  process.env.INTERNAL_SECRET = SECRET;
});
afterEach(() => {
  global.fetch = origFetch;
});

describe("quikscale.save_transcript executor (Fathom → QuikScale)", () => {
  it("forwards the transcript to QuikScale save-transcript and reports the save", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ success: true, data: { id: "t_1", matchStatus: "MATCHED", clientId: "client_1", type: "DAILY" } }),
          { status: 200 },
        ),
    );
    global.fetch = fetchMock as never;

    const res = await getActionExecutor("quikscale.save_transcript")(ctx());
    expect(res.status).toBe("ok");
    expect(res.output).toMatchObject({ saved: true, transcriptId: "t_1", matchStatus: "MATCHED", clientId: "client_1" });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { headers: Record<string, string>; body: string }];
    expect(String(url)).toBe("http://quikscale.test/api/internal/actions/save-transcript");
    expect(init.headers["x-internal-secret"]).toBe(SECRET);
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({
      orgId: "org_A",
      recordingId: "rec_1",
      title: "Daily Huddle — Acme",
      rawText: "Full meeting transcript text…",
      summary: "Discussed the quarterly plan.",
    });
    expect(body.attendees).toHaveLength(1);
    expect(body.actionItems).toEqual(["Send the deck"]);
  });

  it("skips cleanly when there is no recordingId", async () => {
    const res = await getActionExecutor("quikscale.save_transcript")(ctx({}));
    expect(res.output).toMatchObject({ skipped: true });
  });

  it("fails when QuikScale rejects the save (e.g. no client match rule)", async () => {
    global.fetch = vi.fn(
      async () => new Response(JSON.stringify({ success: false, error: "unmatched" }), { status: 200 }),
    ) as never;
    const res = await getActionExecutor("quikscale.save_transcript")(ctx());
    expect(res.status).toBe("failed");
  });
});
