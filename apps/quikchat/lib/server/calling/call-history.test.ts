/**
 * Call History (`listHistory`) — direction derivation, name resolution, terminal
 * filtering and org scoping.
 *
 * Lives in its own file on the mocked-Prisma harness because
 * `calling.service.test.ts` is DB-backed and excluded from the Vitest run (see
 * `vitest.config.ts`), so cases added there would never execute.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { mockDb, resetMockDb } from "@/__tests__/helpers/mockDb";
import { listHistory } from "./calling.service";
import type { OrgContext } from "@/lib/shared";

const ctx: OrgContext = { orgId: "org-1", userId: "me" } as OrgContext;

const STARTED = new Date("2026-07-20T10:30:00Z");

/** Minimal qcCall row + participant rows, only the fields listHistory reads. */
function call(over: {
  id?: string;
  initiatorId?: string;
  status?: string;
  type?: string;
  duration?: number | null;
  channelId?: string | null;
  participantIds?: string[];
}) {
  const participantIds = over.participantIds ?? ["me", "u-bob"];
  return {
    id: over.id ?? "call-1",
    orgId: "org-1",
    channelId: over.channelId ?? null,
    meetingId: null,
    initiatorId: over.initiatorId ?? "me",
    type: over.type ?? "audio",
    status: over.status ?? "ended",
    startedAt: STARTED,
    answeredAt: STARTED,
    endedAt: STARTED,
    duration: over.duration === undefined ? 252 : over.duration,
    participants: participantIds.map((userId, i) => ({
      id: `p-${i}`,
      callId: over.id ?? "call-1",
      userId,
      joinedAt: STARTED,
      leftAt: STARTED,
      state: "disconnected",
      lastHeartbeatAt: null,
    })),
  };
}

/** `loadPublicUsers` reads prisma.user.findMany; give it bob by default. */
function withUsers(users: { id: string; firstName: string; avatar: string | null }[] = []) {
  mockDb.user.findMany.mockResolvedValue(
    users.map((u) => ({ ...u, lastName: "", email: `${u.id}@acme.test` })) as never,
  );
}

beforeEach(() => {
  resetMockDb();
  withUsers([{ id: "u-bob", firstName: "Bob", avatar: null }]);
  mockDb.qcChannel.findMany.mockResolvedValue([] as never);
});

describe("listHistory — direction derivation", () => {
  // "missed" is specifically an unanswered call TO the viewer. A call the viewer
  // STARTED that nobody answered is an unanswered OUTGOING call.
  const cases: { label: string; caller: string; status: string; dir: string }[] = [
    { label: "I called, we talked", caller: "me", status: "ended", dir: "outgoing" },
    { label: "I called, rang out", caller: "me", status: "timed_out", dir: "outgoing" },
    { label: "I called, marked missed", caller: "me", status: "missed", dir: "outgoing" },
    { label: "I called, they declined", caller: "me", status: "rejected", dir: "outgoing" },
    { label: "they called, we talked", caller: "u-bob", status: "ended", dir: "incoming" },
    { label: "they called, I declined", caller: "u-bob", status: "rejected", dir: "incoming" },
    { label: "they called, I missed it", caller: "u-bob", status: "missed", dir: "missed" },
    { label: "they called, rang out", caller: "u-bob", status: "timed_out", dir: "missed" },
  ];

  for (const c of cases) {
    it(`${c.label} → ${c.dir}`, async () => {
      mockDb.qcCall.findMany.mockResolvedValue([
        call({ initiatorId: c.caller, status: c.status }),
      ] as never);

      const [item] = await listHistory(ctx);
      expect(item!.direction).toBe(c.dir);
      expect(item!.status).toBe(c.status);
    });
  }
});

describe("listHistory — name resolution", () => {
  it("uses the other participant for a 1:1", async () => {
    withUsers([{ id: "u-bob", firstName: "Bob", avatar: "avatars/bob.png" }]);
    mockDb.qcCall.findMany.mockResolvedValue([call({ participantIds: ["me", "u-bob"] })] as never);

    const [item] = await listHistory(ctx);
    expect(item!.name).toBe("Bob");
    expect(item!.avatarUrl).toBe("avatars/bob.png");
    expect(item!.isGroup).toBe(false);
  });

  it("uses the channel name for a group call, with no avatar", async () => {
    mockDb.qcChannel.findMany.mockResolvedValue([{ id: "c1", name: "Design" }] as never);
    mockDb.qcCall.findMany.mockResolvedValue([
      call({ channelId: "c1", participantIds: ["me", "u-bob", "u-carol"] }),
    ] as never);

    const [item] = await listHistory(ctx);
    expect(item!.name).toBe("Design");
    expect(item!.avatarUrl).toBeNull();
    expect(item!.isGroup).toBe(true);
  });

  it("falls back to \"Group call\" when the channel is gone or unset", async () => {
    mockDb.qcCall.findMany.mockResolvedValue([
      call({ channelId: null, participantIds: ["me", "u-bob", "u-carol"] }),
    ] as never);

    expect((await listHistory(ctx))[0]!.name).toBe("Group call");
  });

  it("falls back to \"Unknown\" when the other participant can't be resolved", async () => {
    withUsers([]); // user row deleted
    mockDb.qcCall.findMany.mockResolvedValue([call({})] as never);

    expect((await listHistory(ctx))[0]!.name).toBe("Unknown");
  });

  // A 1:1 call carries its DM channelId, so group-ness must key on participant
  // count — not on channelId being present.
  it("treats a 2-participant call with a channelId as 1:1, not group", async () => {
    mockDb.qcChannel.findMany.mockResolvedValue([{ id: "dm1", name: "dm" }] as never);
    mockDb.qcCall.findMany.mockResolvedValue([
      call({ channelId: "dm1", participantIds: ["me", "u-bob"] }),
    ] as never);

    const [item] = await listHistory(ctx);
    expect(item!.isGroup).toBe(false);
    expect(item!.name).toBe("Bob");
  });
});

describe("listHistory — query shape", () => {
  beforeEach(() => {
    mockDb.qcCall.findMany.mockResolvedValue([] as never);
  });

  it("asks only for terminal statuses — never ringing/active", async () => {
    await listHistory(ctx);
    const where = mockDb.qcCall.findMany.mock.calls[0]![0]!.where as {
      status: { in: string[] };
    };
    expect(where.status.in).toEqual(["ended", "missed", "rejected", "timed_out"]);
    expect(where.status.in).not.toContain("ringing");
    expect(where.status.in).not.toContain("active");
  });

  it("scopes to the caller's org and to calls they took part in", async () => {
    await listHistory(ctx);
    const where = mockDb.qcCall.findMany.mock.calls[0]![0]!.where as Record<string, unknown>;
    expect(where.orgId).toBe("org-1");
    expect(where.OR).toEqual([
      { initiatorId: "me" },
      { participants: { some: { userId: "me" } } },
    ]);
  });

  it("returns newest first, capped at 100", async () => {
    await listHistory(ctx);
    const args = mockDb.qcCall.findMany.mock.calls[0]![0]!;
    expect(args.orderBy).toEqual({ startedAt: "desc" });
    expect(args.take).toBe(100);
  });

  it("scopes the group-name lookup to the org too", async () => {
    mockDb.qcCall.findMany.mockResolvedValue([
      call({ channelId: "c1", participantIds: ["me", "u-bob", "u-carol"] }),
    ] as never);
    await listHistory(ctx);
    const where = mockDb.qcChannel.findMany.mock.calls[0]![0]!.where as Record<string, unknown>;
    expect(where.orgId).toBe("org-1");
  });
});

describe("listHistory — duration", () => {
  it("passes talk time through as raw seconds", async () => {
    mockDb.qcCall.findMany.mockResolvedValue([call({ duration: 252 })] as never);
    expect((await listHistory(ctx))[0]!.durationSeconds).toBe(252);
  });

  it("normalizes null and 0 to null so the UI hides it", async () => {
    mockDb.qcCall.findMany.mockResolvedValue([
      call({ id: "a", duration: null, status: "missed", initiatorId: "u-bob" }),
      call({ id: "b", duration: 0, status: "rejected", initiatorId: "u-bob" }),
    ] as never);

    const items = await listHistory(ctx);
    expect(items[0]!.durationSeconds).toBeNull();
    expect(items[1]!.durationSeconds).toBeNull();
  });
});

describe("listHistory — serialization", () => {
  it("emits ISO timestamps and the call type", async () => {
    mockDb.qcCall.findMany.mockResolvedValue([call({ type: "video" })] as never);
    const [item] = await listHistory(ctx);
    expect(item!.startedAt).toBe(STARTED.toISOString());
    expect(item!.type).toBe("video");
  });
});
