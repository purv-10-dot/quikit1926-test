// @vitest-environment node
/**
 * The stub can park a write; park one whose ledger row is missing; and park one
 * decided by somebody the channel cannot name.
 *
 * ── WHY THE STUB NEEDED THIS ───────────────────────────────────────────────
 * Until now `assist()` only ever answered — it could not emit `approval_needed`
 * at all — so the entire proposal path was reachable only from UAT or from a
 * unit test that constructed the frame by hand. Persisting the card made that
 * worse, not better: there was a whole new surface (the channel-visible card,
 * the decision patch, the reconcile pass) that no local run could reach.
 *
 * Two of the three fixtures are shaped by what they LACK, which is why they need
 * guarding:
 *
 *   STUB_AGED_REQUEST_ID      — absent from the ledger, modelling a request aged
 *                               out of the 24h window. The only way a persisted
 *                               card reaches the `unconfirmed` state.
 *   STUB_DEPARTED_REQUEST_ID  — present and decided, but by a user in no channel
 *                               roster. The only way the card's passive-voice
 *                               fallback is reached without waiting for someone
 *                               to actually leave.
 *
 * These tests exist mostly to stop someone "completing" the fixture set — adding
 * a ledger row for the first, or a roster entry for the second, silently deletes
 * the path it exists to expose. Same instinct as the snake_case `custom_field_7`
 * key and the summary-less `cancelled` row.
 */
import { describe, expect, it } from "vitest";
import type { AssistInput, RuntimeEvent } from "./types";
import {
  StubRuntimeClient,
  STUB_AGED_REQUEST_ID,
  STUB_DEPARTED_REQUEST_ID,
  STUB_DEPARTED_USER_ID,
  STUB_PARKED_REQUEST_ID,
} from "./stub";

function input(prompt: string): AssistInput {
  return {
    orgId: "org-1",
    userId: "u-1",
    channelId: "c-1",
    prompt,
    history: [],
    appId: "quikchat",
    locale: "en",
    botAgentId: "quikchat-assistant",
    traceId: "t-1",
  };
}

async function drain(client: StubRuntimeClient, prompt: string): Promise<RuntimeEvent[]> {
  const out: RuntimeEvent[] = [];
  for await (const e of client.assist(input(prompt))) out.push(e);
  return out;
}

describe("stub assist — parking a write", () => {
  it("answers normally for an ordinary prompt", async () => {
    const events = await drain(new StubRuntimeClient(), "what happened this week?");
    expect(events.some((e) => e.type === "approval_needed")).toBe(false);
    expect(events.at(-1)?.type).toBe("done");
  });

  it("parks a write on /approve, and emits it INSTEAD of done", async () => {
    // `approval_needed` is terminal exactly like `done` — one per stream, and
    // there is no answer text. A stub that emitted both would let a client that
    // wrongly renders both pass locally.
    const events = await drain(new StubRuntimeClient(), "/approve file a bug");
    expect(events).toHaveLength(1);
    const evt = events[0]!;
    expect(evt.type).toBe("approval_needed");
    expect(evt).toMatchObject({ requestId: STUB_PARKED_REQUEST_ID, appId: "quiktrack" });
  });

  it("carries a snake_case argument key, so a normalising consumer breaks here", async () => {
    const [evt] = await drain(new StubRuntimeClient(), "/approve file a bug");
    const toolInput = (evt as { toolInput: Record<string, unknown> }).toolInput;
    expect(Object.keys(toolInput)).toContain("custom_field_7");
  });

  it("parks an ALREADY-AGED write on /approve-aged", async () => {
    const [evt] = await drain(new StubRuntimeClient(), "/approve-aged file a bug");
    expect(evt).toMatchObject({ type: "approval_needed", requestId: STUB_AGED_REQUEST_ID });
  });

  it("is expiry-actionable, so the card is usable while a developer looks at it", async () => {
    const [evt] = await drain(new StubRuntimeClient(), "/approve file a bug");
    const expiresAt = (evt as { expiresAt: string }).expiresAt;
    expect(Date.parse(expiresAt)).toBeGreaterThan(Date.now());
  });
});

describe("stub ledger — the aged request is deliberately absent", () => {
  const client = new StubRuntimeClient();
  const listInput = { orgId: "org-1", userId: "u-1", botAgentId: "quikchat-assistant" };

  it("⚠️ never returns a row for STUB_AGED_REQUEST_ID", async () => {
    // ITS ABSENCE IS THE FIXTURE. Adding a row to "complete" the set would
    // silently delete the only local path to the `unconfirmed` card.
    const page = await client.listApprovalRequests(listInput);
    expect(page.requests.map((r) => r.id)).not.toContain(STUB_AGED_REQUEST_ID);
  });

  it("does return a row for the ordinary parked write, so reconcile can confirm it", async () => {
    const page = await client.listApprovalRequests(listInput);
    expect(page.requests.map((r) => r.id)).toContain(STUB_PARKED_REQUEST_ID);
  });

  it("refuses a decision on the aged id the way the real runtime would", async () => {
    // The runtime would not know it either — 404, not a cheerful success.
    await expect(
      client.approveRequest({
        ...listInput,
        requestId: STUB_AGED_REQUEST_ID,
        traceId: "t-1",
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("stub — the departed decider, so passive-voice fallback is reachable", () => {
  const client = new StubRuntimeClient();
  const listInput = { orgId: "org-1", userId: "u-1", botAgentId: "quikchat-assistant" };

  it("parks a write on /approve-departed", async () => {
    const [evt] = await drain(new StubRuntimeClient(), "/approve-departed file a bug");
    expect(evt).toMatchObject({ type: "approval_needed", requestId: STUB_DEPARTED_REQUEST_ID });
  });

  it("serves it already decided, by a user in no channel roster", async () => {
    // The reconcile pass patches the persisted card from this row; the card then
    // fails to resolve the id and must fall back to passive voice. Without this
    // fixture that fallback is reachable only from a unit test.
    const page = await client.listApprovalRequests(listInput);
    const row = page.requests.find((r) => r.id === STUB_DEPARTED_REQUEST_ID);
    expect(row).toBeDefined();
    expect(row!.status).toBe("executed");
    expect(row!.decisionBy).toBe(STUB_DEPARTED_USER_ID);
    // It still carries a real outcome sentence, so the card shows WHAT happened
    // even though it cannot say WHO — which is exactly the state under test.
    expect(row!.outcomeSummary).toContain("QTRK-451");
  });

  it("carries decisionAgentId, so the log dimension has something to report", async () => {
    const page = await client.listApprovalRequests(listInput);
    const row = page.requests.find((r) => r.id === STUB_DEPARTED_REQUEST_ID);
    expect(row!.decisionAgentId).toBe("quikchat-assistant");
  });

  it("is decided by someone OTHER than the caller, or it would take the \"you\" path", async () => {
    // The property that makes this fixture exercise NAME RESOLUTION at all. If
    // `decisionBy` were the requesting user, the card would say "you" and the
    // unresolvable-id fallback would never be reached from here.
    const page = await client.listApprovalRequests(listInput);
    const row = page.requests.find((r) => r.id === STUB_DEPARTED_REQUEST_ID);
    expect(row!.decisionBy).not.toBe(listInput.userId);
  });
});
