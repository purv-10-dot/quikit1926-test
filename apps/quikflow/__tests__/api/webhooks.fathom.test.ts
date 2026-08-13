import crypto from "node:crypto";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { mockDb, resetMockDb } from "../helpers/mockDb";
import { encryptSecret } from "@/lib/connectors/crypto";

// A fixed 32-byte key so encryptSecret/decryptSecret round-trip in tests
// without touching the real .env.local value.
process.env.WF_CONNECTION_ENC_KEY = crypto.randomBytes(32).toString("hex");

const enqueueEvent = vi.fn(async () => "job_1");
vi.mock("@/lib/queue/queue", () => ({ enqueueEvent: (...args: unknown[]) => enqueueEvent(...args) }));

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
