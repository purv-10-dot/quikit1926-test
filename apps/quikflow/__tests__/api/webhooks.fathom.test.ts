import crypto from "node:crypto";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { encryptSecret } from "@/lib/connectors/crypto";

// A fixed 32-byte key so encryptSecret/decryptSecret round-trip in tests
// without touching the real .env.local value.
process.env.WF_CONNECTION_ENC_KEY = crypto.randomBytes(32).toString("hex");

const enqueueEvent = vi.fn(async (_event: { data: Record<string, unknown> } & Record<string, unknown>) => "job_1");
vi.mock("@/lib/queue/queue", () => ({
  enqueueEvent: (event: never) => enqueueEvent(event),
}));

const { POST } = await import("@/app/api/webhooks/fathom/route");

function req(url: string, body: string, headers: Record<string, string> = {}) {
  return new NextRequest(new URL(url, "http://localhost"), {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}

/** Signs a body the same way `verifyWebhookSignature` checks it (Standard-Webhooks/Svix). */
function sign(secret: string, id: string, timestamp: string, rawBody: string) {
  const key = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  const sig = crypto
    .createHmac("sha256", Buffer.from(key, "base64"))
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest("base64");
  return `v1,${sig}`;
}

const CONNECTION_ID = "conn_fathom_1";
const ORG_ID = "org_A";
const SECRET = `whsec_${Buffer.from("a-test-signing-key-32-bytes-long").toString("base64").slice(0, 32)}`;

const MEETING_PAYLOAD = JSON.stringify({
  recording_id: "rec_123",
  title: "Acme Corp Daily Huddle",
  started_at: "2026-08-07T09:00:00.000Z",
  attendees: [{ name: "Jane Doe", email: "jane@acme.com" }],
  transcript: "Jane: Let's kick off the huddle.",
});

beforeEach(() => {
  resetMockDb();
  enqueueEvent.mockClear();
});

describe("POST /api/webhooks/fathom", () => {
  it("400s when the connection id query param is missing", async () => {
    const res = await POST(req("/api/webhooks/fathom", MEETING_PAYLOAD));
    expect(res.status).toBe(400);
    expect(enqueueEvent).not.toHaveBeenCalled();
  });

  it("404s when the connection doesn't exist or isn't connected", async () => {
    mockDb.wfConnection.findFirst.mockResolvedValue(null);
    const res = await POST(req(`/api/webhooks/fathom?c=${CONNECTION_ID}`, MEETING_PAYLOAD));
    expect(res.status).toBe(404);
    expect(enqueueEvent).not.toHaveBeenCalled();
  });

  it("401s on a bad signature", async () => {
    mockDb.wfConnection.findFirst.mockResolvedValue({
      id: CONNECTION_ID,
      orgId: ORG_ID,
      refreshToken: encryptSecret(SECRET),
    } as never);
    const res = await POST(
      req(`/api/webhooks/fathom?c=${CONNECTION_ID}`, MEETING_PAYLOAD, {
        "webhook-id": "msg_1",
        "webhook-timestamp": String(Math.floor(Date.now() / 1000)),
        "webhook-signature": "v1,not-the-right-signature",
      }),
    );
    expect(res.status).toBe(401);
    expect(enqueueEvent).not.toHaveBeenCalled();
  });

  it("401s (fail-closed) when no secret is stored and FATHOM_WEBHOOK_INSECURE isn't set", async () => {
    delete process.env.FATHOM_WEBHOOK_INSECURE;
    mockDb.wfConnection.findFirst.mockResolvedValue({
      id: CONNECTION_ID,
      orgId: ORG_ID,
      refreshToken: null,
    } as never);
    const res = await POST(req(`/api/webhooks/fathom?c=${CONNECTION_ID}`, MEETING_PAYLOAD));
    expect(res.status).toBe(401);
    expect(enqueueEvent).not.toHaveBeenCalled();
  });

  it("enqueues fathom.meeting.transcribed for a validly signed meeting payload", async () => {
    mockDb.wfConnection.findFirst.mockResolvedValue({
      id: CONNECTION_ID,
      orgId: ORG_ID,
      refreshToken: encryptSecret(SECRET),
    } as never);
    const id = "msg_1";
    const timestamp = String(Math.floor(Date.now() / 1000));
    const res = await POST(
      req(`/api/webhooks/fathom?c=${CONNECTION_ID}`, MEETING_PAYLOAD, {
        "webhook-id": id,
        "webhook-timestamp": timestamp,
        "webhook-signature": sign(SECRET, id, timestamp, MEETING_PAYLOAD),
      }),
    );
    const body = await res.json();
    expect(res.status).toBe(202);
    expect(body.data.enqueued).toBe(true);
    expect(enqueueEvent).toHaveBeenCalledTimes(1);
    const event = enqueueEvent.mock.calls[0][0] as Record<string, unknown>;
    expect(event.app).toBe("fathom");
    expect(event.event).toBe("fathom.meeting.transcribed");
    expect(event.orgId).toBe(ORG_ID);
    expect(event.dedupeKey).toBe("fathom:rec_123");
  });

  it("acknowledges without enqueueing when the payload isn't a recognizable meeting (e.g. a ping)", async () => {
    mockDb.wfConnection.findFirst.mockResolvedValue({
      id: CONNECTION_ID,
      orgId: ORG_ID,
      refreshToken: encryptSecret(SECRET),
    } as never);
    const pingBody = JSON.stringify({ type: "ping" });
    const id = "msg_2";
    const timestamp = String(Math.floor(Date.now() / 1000));
    const res = await POST(
      req(`/api/webhooks/fathom?c=${CONNECTION_ID}`, pingBody, {
        "webhook-id": id,
        "webhook-timestamp": timestamp,
        "webhook-signature": sign(SECRET, id, timestamp, pingBody),
      }),
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.ignored).toBe(true);
    expect(enqueueEvent).not.toHaveBeenCalled();
  });
});

/**
 * Backfilling what the webhook payload left out.
 *
 * Fathom's webhook ANNOUNCES that a recording is ready rather than carrying it,
 * so the body routinely arrives without a transcript, without a summary and
 * without action items. Nothing downstream ever re-read those fields, so such a
 * meeting kept an empty summary permanently — silent, unrecoverable loss.
 *
 * The contract these tests pin down is a cost contract as much as a data one:
 * a COMPLETE payload must cost zero extra requests, and an incomplete one must
 * cost at most a detail fetch plus a transcript fallback.
 */
describe("POST /api/webhooks/fathom — detail backfill", () => {
  /** Complete: transcript, summary and action items all inlined. */
  const COMPLETE = JSON.stringify({
    recording_id: "rec_complete",
    title: "Acme Corp Daily Huddle",
    started_at: new Date().toISOString(),
    attendees: [{ name: "Jane Doe", email: "jane@acme.com" }],
    transcript: [{ speaker: { display_name: "Jane Doe" }, text: "Kicking off.", timestamp: 9 }],
    default_summary: { markdown_formatted: "## Key Takeaways\n- Shipped the thing" },
    action_items: [{ text: "Send the deck", assignee: { name: "Jane Doe" }, timestamp: 49 }],
  });

  /** What Fathom's webhook actually tends to send: metadata and nothing else. */
  const BARE = JSON.stringify({
    recording_id: "rec_bare",
    title: "Acme Corp Daily Huddle",
    started_at: new Date().toISOString(),
    attendees: [{ name: "Jane Doe", email: "jane@acme.com" }],
  });

  /** The full record the detail endpoint returns for `rec_bare`. */
  const DETAIL_BODY = {
    recording_id: "rec_bare",
    title: "Acme Corp Daily Huddle",
    transcript: [{ speaker: { display_name: "Jane Doe" }, text: "Kicking off.", timestamp: 9 }],
    default_summary: { markdown_formatted: "## Key Takeaways\n- Shipped the thing" },
    action_items: [{ text: "Send the deck", assignee: { name: "Jane Doe", email: "jane@acme.com" }, timestamp: 49 }],
  };

  const signedPost = (body: string) => {
    const id = "msg_backfill";
    const timestamp = String(Math.floor(Date.now() / 1000));
    return POST(
      req(`/api/webhooks/fathom?c=${CONNECTION_ID}`, body, {
        "webhook-id": id,
        "webhook-timestamp": timestamp,
        "webhook-signature": sign(SECRET, id, timestamp, body),
      }),
    );
  };

  const eventData = () => (enqueueEvent.mock.calls[0][0] as { data: Record<string, unknown> }).data;

  beforeEach(() => {
    mockDb.wfConnection.findFirst.mockResolvedValue({
      id: CONNECTION_ID,
      orgId: ORG_ID,
      refreshToken: encryptSecret(SECRET),
      accessToken: encryptSecret("fathom-api-key"),
    } as never);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("spends ZERO extra requests when the payload is already complete", async () => {
    const fetchMock = vi.fn(async (_url: string) => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await signedPost(COMPLETE);
    expect(res.status).toBe(202);
    expect(fetchMock).not.toHaveBeenCalled();

    const data = eventData();
    expect(data.summary).toBe("## Key Takeaways\n- Shipped the thing");
    expect(data.transcriptText).toBe("Jane Doe: Kicking off.");
  });

  it("recovers transcript, summary AND action items from one detail request", async () => {
    const fetchMock = vi.fn(async (_url: string) => new Response(JSON.stringify(DETAIL_BODY), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await signedPost(BARE);
    expect(res.status).toBe(202);
    // One request filled all three gaps — no separate /transcript call needed.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/meetings/rec_bare?");

    const data = eventData();
    expect(data.transcriptText).toBe("Jane Doe: Kicking off.");
    expect(data.summary).toBe("## Key Takeaways\n- Shipped the thing");
    expect(data.transcriptSegments).toEqual([{ speaker: "Jane Doe", text: "Kicking off.", timestamp: 9 }]);
    const items = data.actionItems as { text: string; assignee: string | null; timestampSeconds: number | null }[];
    expect(items[0]).toMatchObject({ text: "Send the deck", assignee: "Jane Doe", timestampSeconds: 49 });
  });

  it("falls back to /transcript when the detail endpoint does not exist", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      String(url).includes("/transcript")
        ? new Response(
            JSON.stringify({ transcript: [{ speaker: { display_name: "Jane Doe" }, text: "Kicking off.", timestamp: 9 }] }),
            { status: 200 },
          )
        : new Response("Not Found", { status: 404 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await signedPost(BARE);
    expect(res.status).toBe(202);
    // Detail 404 is a finding, not an error: it degrades to the endpoint we know exists.
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toContain("/meetings/rec_bare/transcript");
    expect(eventData().transcriptText).toBe("Jane Doe: Kicking off.");
  });

  it("never overwrites a value the payload already carried with a null", async () => {
    // Detail knows the summary but has lost the transcript; the payload has the
    // transcript. The merge must end up with both.
    const withTranscriptOnly = JSON.stringify({
      recording_id: "rec_bare",
      started_at: new Date().toISOString(),
      transcript: "Jane: original text",
    });
    const fetchMock = vi.fn(async (url: string) =>
      String(url).includes("/transcript")
        ? new Response("{}", { status: 404 })
        : new Response(JSON.stringify({ recording_id: "rec_bare", default_summary: { markdown_formatted: "S" } }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await signedPost(withTranscriptOnly);
    const data = eventData();
    expect(data.transcriptText).toBe("Jane: original text");
    expect(data.summary).toBe("S");
  });

  it("still enqueues the meeting when every backfill request fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Fathom is down"); }));

    const res = await signedPost(BARE);
    expect(res.status).toBe(202);
    expect(enqueueEvent).toHaveBeenCalledTimes(1);
    expect(eventData().transcriptText).toBeNull();
  });

  it("does not chase missing action items on an old meeting", async () => {
    // An empty actionItems array cannot be told apart from "Fathom generated
    // none", so past the freshness window we only chase unambiguous absences.
    const old = JSON.stringify({
      recording_id: "rec_old",
      started_at: "2020-01-01T09:00:00.000Z",
      transcript: "Jane: hello",
      summary: "Already have one",
    });
    const fetchMock = vi.fn(async (_url: string) => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await signedPost(old);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
