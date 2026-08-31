/**
 * Upwork conversation capture — dedupe keys and payload validation.
 *
 * The feature adds no storage: each scraped message becomes an ordinary
 * CrmActivity related to its job (relatedKind "Upwork" -> CrmUpworkJob.id) AND
 * carrying the `<jobId>:` externalId prefix, which is what the job's timeline
 * actually queries by. What these tests pin is the part that would silently
 * corrupt data if it drifted:
 *
 *   - a message's dedupe key is derived from the UPWORK MESSAGE ID, never from a
 *     timestamp, so re-extracting the same room upserts instead of duplicating;
 *   - that key still carries the `<jobId>:` prefix the timeline query reads;
 *   - it can never collide with a system event or a MANUAL row;
 *   - the payload validator rejects the shapes that would produce junk rows.
 */
import { describe, expect, it } from "vitest";
import {
  ACTIVITY_PRIMARY_KINDS,
  isAccountlessKind,
  isPrimaryKind,
} from "@/lib/services/activities/target-existence";
import {
  UPWORK_ACTIVITY_TYPES,
  buildManualUpworkActivityExternalId,
  buildUpworkActivityExternalId,
  buildUpworkMessageExternalId,
  upworkActivityExternalIdPrefix,
} from "@/lib/services/activities/upwork-activity-types";
import { upworkConversationSchema } from "@/lib/validators/upwork";

const JOB = "job-123";

describe("buildUpworkMessageExternalId", () => {
  it("keys on the message id, so the same message re-scraped is one row", () => {
    // The whole dedupe guarantee in one assertion: identical inputs → identical
    // key → logActivity() upserts on (orgId, sourceSystem, externalId).
    expect(buildUpworkMessageExternalId(JOB, "msg-1")).toBe(
      buildUpworkMessageExternalId(JOB, "msg-1"),
    );
  });

  it("is independent of when the scrape happened", () => {
    // Regression guard for the bug this helper exists to avoid: routing messages
    // through buildUpworkActivityExternalId would mint a NEW key per scrape,
    // because a non-oncePerJob type discriminates on occurredAt. Upwork renders
    // relative times, so a re-parse can shift the resolved date and silently
    // duplicate the whole thread.
    const viaTimestamp = (d: Date) =>
      buildUpworkActivityExternalId("UPWORK_CONVERSATION_MESSAGE", JOB, d);
    expect(viaTimestamp(new Date("2026-01-01T00:00:00Z"))).not.toBe(
      viaTimestamp(new Date("2026-01-01T00:00:01Z")),
    );
    // The helper we actually use has no such dependency — there is no date input.
    expect(buildUpworkMessageExternalId(JOB, "msg-1")).toBe(`${JOB}:MSG:msg-1`);
  });

  it("distinguishes different messages on the same job", () => {
    expect(buildUpworkMessageExternalId(JOB, "msg-1")).not.toBe(
      buildUpworkMessageExternalId(JOB, "msg-2"),
    );
  });

  it("scopes the key to the job, so one message id under two jobs is two rows", () => {
    expect(buildUpworkMessageExternalId("job-a", "msg-1")).not.toBe(
      buildUpworkMessageExternalId("job-b", "msg-1"),
    );
  });

  it("carries the <jobId>: prefix the job timeline is queried by", () => {
    // Without this the messages would save successfully and then be invisible on
    // the job — the timeline reads by prefix, not by relatedObjectId.
    expect(
      buildUpworkMessageExternalId(JOB, "msg-1").startsWith(
        upworkActivityExternalIdPrefix(JOB),
      ),
    ).toBe(true);
  });

  it("cannot collide with a system event or a user-logged activity", () => {
    const message = buildUpworkMessageExternalId(JOB, "msg-1");
    const systemEvent = buildUpworkActivityExternalId(
      "UPWORK_JOB_SAVED",
      JOB,
      new Date("2026-01-01T00:00:00Z"),
    );
    const manual = buildManualUpworkActivityExternalId(JOB, "activity-1");
    expect(new Set([message, systemEvent, manual]).size).toBe(3);
  });
});

describe("UPWORK_CONVERSATION_MESSAGE registry entry", () => {
  it("is not oncePerJob — a conversation is many messages", () => {
    // If this flipped to true, every message after the first would upsert over
    // the previous one and a thread would collapse to a single row.
    expect(UPWORK_ACTIVITY_TYPES.UPWORK_CONVERSATION_MESSAGE.oncePerJob).toBe(false);
  });

  it("leaves the pre-existing capture/convert entries untouched", () => {
    expect(UPWORK_ACTIVITY_TYPES.UPWORK_JOB_SAVED.oncePerJob).toBe(true);
    expect(UPWORK_ACTIVITY_TYPES.UPWORK_CONVERTED_TO_PROSPECT.oncePerJob).toBe(true);
  });
});

describe("upworkConversationSchema", () => {
  const message = { id: "m1", text: "Hello there" };

  it("accepts a minimal thread — every descriptive field is optional", () => {
    // Upwork does not render a client name / thread id / timestamp in every
    // room. The extension sends null rather than guessing, so null must parse.
    const r = upworkConversationSchema.safeParse({
      threadId: null,
      conversationUrl: null,
      clientName: null,
      messages: [message],
    });
    expect(r.success).toBe(true);
  });

  it("accepts a fully populated thread", () => {
    const r = upworkConversationSchema.safeParse({
      threadId: "room_abc",
      conversationUrl: "https://www.upwork.com/ab/messages/rooms/room_abc",
      clientName: "Acme Inc",
      messages: [
        {
          id: "m1",
          text: "Hi",
          senderName: "Acme Inc",
          senderType: "client",
          sentAt: "2026-01-01T00:00:00.000Z",
          order: 0,
        },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("rejects an empty conversation — no empty CRM conversation is created", () => {
    const r = upworkConversationSchema.safeParse({ messages: [] });
    expect(r.success).toBe(false);
  });

  it("rejects a message with no id — there would be no dedupe key", () => {
    const r = upworkConversationSchema.safeParse({
      messages: [{ id: "", text: "Hello" }],
    });
    expect(r.success).toBe(false);
  });

  it("rejects an empty message body", () => {
    const r = upworkConversationSchema.safeParse({
      messages: [{ id: "m1", text: "   " }],
    });
    expect(r.success).toBe(false);
  });

  it("rejects an unknown senderType rather than coercing it", () => {
    const r = upworkConversationSchema.safeParse({
      messages: [{ ...message, senderType: "robot" }],
    });
    expect(r.success).toBe(false);
  });

  it("caps a runaway scrape at 500 messages", () => {
    const many = Array.from({ length: 501 }, (_, i) => ({
      id: `m${i}`,
      text: "hi",
    }));
    expect(upworkConversationSchema.safeParse({ messages: many }).success).toBe(false);
  });
});

describe("conversation messages are explicitly related to the job", () => {
  it("uses Upwork as a real, validated linkable kind", () => {
    // The architecture requirement: a message must reference its CrmUpworkJob
    // through the CRM relationship itself, not only through externalId. This is
    // possible with no schema change because "Upwork" is already a primary kind.
    expect(isPrimaryKind("Upwork")).toBe(true);
    expect(ACTIVITY_PRIMARY_KINDS).toContain("Upwork");
  });

  it("sits outside the account ACL, like Prospect", () => {
    // An Upwork job has no accountId, so account-scope checks must be a no-op
    // rather than a rejection — otherwise relating the message would 403.
    expect(isAccountlessKind("Upwork")).toBe(true);
  });

  it("still carries the <jobId>: prefix the timeline reads by", () => {
    // Regression guard for the one way this change could silently break the UI:
    // UpworkActivityTimeline queries by (sourceSystem, externalId prefix), NOT
    // by relatedObjectId. Relating the row is additive — the prefix must stay.
    const key = buildUpworkMessageExternalId(JOB, "msg-1");
    expect(key.startsWith(upworkActivityExternalIdPrefix(JOB))).toBe(true);
  });
});

describe("UPWORK_PROPOSAL_SAVED", () => {
  it("uses the required subject and description wording", () => {
    const d = UPWORK_ACTIVITY_TYPES.UPWORK_PROPOSAL_SAVED;
    const title = "D365 Sales CRM Setup and Migration";
    expect(d.subject(title)).toBe("Saved Upwork proposal: D365 Sales CRM Setup and Migration");
    expect(d.describe(title)).toBe(
      'Saved the Upwork proposal for "D365 Sales CRM Setup and Migration" to CRM.',
    );
  });

  it("is oncePerJob, so re-saving a proposal cannot append a second row", () => {
    // The proposal lives in columns ON the job, so a re-save UPDATES it. A
    // second timeline row would imply a second proposal.
    expect(UPWORK_ACTIVITY_TYPES.UPWORK_PROPOSAL_SAVED.oncePerJob).toBe(true);
  });

  it("keys on the job alone, so a replayed save upserts the same row", () => {
    const a = buildUpworkActivityExternalId(
      "UPWORK_PROPOSAL_SAVED",
      JOB,
      new Date("2026-01-01T00:00:00Z"),
    );
    const b = buildUpworkActivityExternalId(
      "UPWORK_PROPOSAL_SAVED",
      JOB,
      new Date("2026-06-30T12:34:56Z"),
    );
    // Same key despite different timestamps -> logActivity() upserts.
    expect(a).toBe(b);
    expect(a).toBe(`${JOB}:UPWORK_PROPOSAL_SAVED`);
  });

  it("cannot collide with the job-saved event or a conversation message", () => {
    const proposal = buildUpworkActivityExternalId(
      "UPWORK_PROPOSAL_SAVED",
      JOB,
      new Date("2026-01-01T00:00:00Z"),
    );
    const jobSaved = buildUpworkActivityExternalId(
      "UPWORK_JOB_SAVED",
      JOB,
      new Date("2026-01-01T00:00:00Z"),
    );
    const message = buildUpworkMessageExternalId(JOB, "msg-1");
    expect(new Set([proposal, jobSaved, message]).size).toBe(3);
  });

  it("appears on the job timeline through the shared <jobId>: prefix", () => {
    const key = buildUpworkActivityExternalId(
      "UPWORK_PROPOSAL_SAVED",
      JOB,
      new Date("2026-01-01T00:00:00Z"),
    );
    expect(key.startsWith(upworkActivityExternalIdPrefix(JOB))).toBe(true);
  });

  it("leaves UPWORK_JOB_SAVED completely unchanged", () => {
    // Regression guard: the existing capture event keeps its exact wording and
    // its once-per-job semantics.
    const d = UPWORK_ACTIVITY_TYPES.UPWORK_JOB_SAVED;
    expect(d.subject("X")).toBe("Saved Upwork job: X");
    expect(d.describe("X")).toBe('Added the Upwork job "X" to CRM.');
    expect(d.oncePerJob).toBe(true);
  });
});
