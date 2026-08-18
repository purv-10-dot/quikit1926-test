/**
 * Branch coverage for `getOrStartMeetingCall`.
 *
 * Lives in its own file against a mocked Prisma because
 * `lib/server/calling/calling.service.test.ts` is in vitest.config.ts's
 * `exclude` list (it needs a real Postgres, which CI has no service for) —
 * anything asserted there is not asserted by `npm run test`.
 *
 * WHAT THIS DOES NOT PROVE: the race. Mocked Prisma runs one call at a time, so
 * these tests prove the claim's BRANCH LOGIC — winner proceeds, loser cleans up
 * and redirects, a stale claim is reclaimed — not that two concurrent writers
 * serialize. That guarantee comes from Postgres row locks on the conditional
 * `updateMany`, and verifying it needs either a DB-backed test (blocked: no
 * Postgres in CI) or a two-context Playwright spec. Treat the race as reasoned,
 * not covered.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrgContext } from "@/lib/shared";

const h = vi.hoisted(() => ({
  meetingFindFirst: vi.fn(),
  meetingUpdateMany: vi.fn(),
  callFindFirst: vi.fn(),
  callDelete: vi.fn(),
  createCall: vi.fn(),
}));

vi.mock("@quikit/database", async () => {
  const actual = await vi.importActual<typeof import("@prisma/client")>("@prisma/client");
  return {
    ...actual,
    db: {
      qcMeeting: { findFirst: h.meetingFindFirst, updateMany: h.meetingUpdateMany },
      qcCall: { findFirst: h.callFindFirst, delete: h.callDelete },
    },
  };
});

vi.mock("@/lib/auth-shims", async () => {
  const errors = await vi.importActual<typeof import("@/lib/errors")>("@/lib/errors");
  return { ...errors };
});

vi.mock("./calling.service", () => ({ createCall: h.createCall }));

import { HttpError } from "@/lib/errors";
import { getOrStartMeetingCall } from "./meeting-call";

const ctx = { orgId: "org-1", userId: "u-me" } as OrgContext;
const MEETING = "m-1";

function meeting(over: Record<string, unknown> = {}) {
  return {
    id: MEETING,
    orgId: "org-1",
    channelId: "chan-1",
    status: "scheduled",
    callId: null,
    attendees: [{ userId: "u-me" }, { userId: "u-other" }],
    ...over,
  };
}

beforeEach(() => {
  Object.values(h).forEach((fn) => fn.mockReset());
  h.createCall.mockResolvedValue({ id: "call-new" });
  h.meetingUpdateMany.mockResolvedValue({ count: 1 });
  h.callDelete.mockResolvedValue({});
});

describe("getOrStartMeetingCall — authorization", () => {
  it("rejects a meeting that does not exist", async () => {
    h.meetingFindFirst.mockResolvedValue(null);
    await expect(getOrStartMeetingCall(ctx, MEETING)).rejects.toMatchObject({
      status: 404,
      code: "not_found",
    });
  });

  it("rejects a cancelled meeting rather than starting a call for it", async () => {
    h.meetingFindFirst.mockResolvedValue(meeting({ status: "cancelled" }));
    await expect(getOrStartMeetingCall(ctx, MEETING)).rejects.toMatchObject({
      status: 409,
      code: "cancelled",
    });
    expect(h.createCall).not.toHaveBeenCalled();
  });

  it("authorizes on the ATTENDEE list, not channel membership", async () => {
    // The whole point of the separate entry point: if this passed for any
    // channel member it would just be Call.Group:create with extra steps.
    h.meetingFindFirst.mockResolvedValue(meeting({ attendees: [{ userId: "u-other" }] }));
    await expect(getOrStartMeetingCall(ctx, MEETING)).rejects.toMatchObject({
      status: 403,
      code: "not_attendee",
    });
    expect(h.createCall).not.toHaveBeenCalled();
  });
});

describe("getOrStartMeetingCall — resolve vs start", () => {
  it("joins the live call without creating a second one", async () => {
    h.meetingFindFirst.mockResolvedValue(meeting());
    h.callFindFirst.mockResolvedValue({ id: "call-live" });

    await expect(getOrStartMeetingCall(ctx, MEETING)).resolves.toEqual({
      callId: "call-live",
      created: false,
    });
    // Critical: never reaches createCall, whose one-call-per-user guard would
    // 409 every attendee except whoever clicked first.
    expect(h.createCall).not.toHaveBeenCalled();
  });

  it("starts the call from the meeting's own data when none is live", async () => {
    h.meetingFindFirst.mockResolvedValue(meeting());
    h.callFindFirst.mockResolvedValue(null);

    await expect(getOrStartMeetingCall(ctx, MEETING)).resolves.toEqual({
      callId: "call-new",
      created: true,
    });
    // Everything derived from the meeting row — no caller-supplied channel or
    // targets, which is what stops this being an ad-hoc group-call back door.
    expect(h.createCall).toHaveBeenCalledWith(ctx, {
      channelId: "chan-1",
      type: "video",
      targetUserIds: ["u-me", "u-other"],
      meetingId: MEETING,
      initialStatus: "active",
    });
  });
});

describe("getOrStartMeetingCall — the claim", () => {
  it("reclaims over a stale claim left by an ended call", async () => {
    // The failure this prevents: a second occurrence, or a rejoin after
    // everyone hung up, finding callId pointing at a dead call and nobody being
    // able to start a new one.
    h.meetingFindFirst.mockResolvedValue(meeting({ callId: "call-dead" }));
    h.callFindFirst.mockResolvedValue(null); // nothing live, despite the claim

    await expect(getOrStartMeetingCall(ctx, MEETING)).resolves.toEqual({
      callId: "call-new",
      created: true,
    });
    expect(h.meetingUpdateMany).toHaveBeenCalledWith({
      where: { id: MEETING, OR: [{ callId: null }, { callId: "call-dead" }] },
      data: { callId: "call-new" },
    });
  });

  it("on losing the claim, cleans up and redirects to the winner's call", async () => {
    h.meetingFindFirst.mockResolvedValue(meeting());
    h.callFindFirst
      .mockResolvedValueOnce(null) // nothing live at the start
      .mockResolvedValueOnce({ id: "call-winner" }); // the winner, after losing
    h.meetingUpdateMany.mockResolvedValue({ count: 0 }); // someone else claimed

    await expect(getOrStartMeetingCall(ctx, MEETING)).resolves.toEqual({
      callId: "call-winner",
      created: false,
    });
    expect(h.callDelete).toHaveBeenCalledWith({ where: { id: "call-new" } });
  });

  it("still redirects when the losing cleanup fails (best-effort delete)", async () => {
    // An orphaned QcCall is untidy; leaving the user on an error screen is not.
    h.meetingFindFirst.mockResolvedValue(meeting());
    h.callFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "call-winner" });
    h.meetingUpdateMany.mockResolvedValue({ count: 0 });
    h.callDelete.mockRejectedValue(new Error("FK constraint"));

    await expect(getOrStartMeetingCall(ctx, MEETING)).resolves.toEqual({
      callId: "call-winner",
      created: false,
    });
  });
});

describe("getOrStartMeetingCall — one call per user", () => {
  it("treats a 409 with a live meeting call as losing the race, not being busy", async () => {
    // The winner's call already made this attendee a participant, so createCall
    // 409s — but they are not busy, they are late by microseconds.
    h.meetingFindFirst.mockResolvedValue(meeting());
    h.callFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "call-winner" });
    h.createCall.mockRejectedValue(new HttpError(409, "You already have an active call"));

    await expect(getOrStartMeetingCall(ctx, MEETING)).resolves.toEqual({
      callId: "call-winner",
      created: false,
    });
  });

  it("reports `busy` when the 409 is a genuinely different call", async () => {
    h.meetingFindFirst.mockResolvedValue(meeting());
    h.callFindFirst.mockResolvedValue(null); // no call for THIS meeting, ever
    h.createCall.mockRejectedValue(new HttpError(409, "You already have an active call"));

    await expect(getOrStartMeetingCall(ctx, MEETING)).rejects.toMatchObject({
      status: 409,
      code: "busy",
    });
  });

  it("does not swallow non-409 failures from createCall", async () => {
    h.meetingFindFirst.mockResolvedValue(meeting());
    h.callFindFirst.mockResolvedValue(null);
    h.createCall.mockRejectedValue(new HttpError(500, "SFU exploded"));

    await expect(getOrStartMeetingCall(ctx, MEETING)).rejects.toMatchObject({ status: 500 });
  });
});
