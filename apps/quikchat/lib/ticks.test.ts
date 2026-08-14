import {
  ASSISTANT_BOT_USER_ID,
  type ChannelList,
  type MessageDto,
  type PublicUser,
} from "@/lib/shared";
import { describe, expect, it } from "vitest";
import { isDeliveredToAll, isReadByAll, partitionMessageAudience, tickState } from "./ticks";
import { applyReadEvent } from "./realtime-cache";

const me = "me";
const created = "2026-05-08T12:00:00Z";
const after = "2026-05-08T12:05:00Z";
const before = "2026-05-08T11:00:00Z";

const u = (id: string): PublicUser => ({ id, displayName: id, avatarUrl: null });

const own = (id = "m1", senderId = me): MessageDto =>
  ({
    id,
    channelId: "c1",
    senderId,
    actorType: "human",
    type: "Text",
    content: "hi",
    data: null,
    parentMessageId: null,
    parentPreview: null,
    isPinned: false,
    reactions: [],
    mentions: [],
    createdAt: created,
    editedAt: null,
  }) as MessageDto;

describe("tickState", () => {
  const members = [u(me), u("bob"), u("cara")];

  it("temp (optimistic) row → sending", () => {
    expect(tickState(own("temp-1"), members, {}, {})).toBe("sending");
  });

  it("persisted, nobody delivered → sent", () => {
    expect(tickState(own(), members, {}, {})).toBe("sent");
  });

  it("ALL non-sender members delivered → delivered", () => {
    const delivered = { bob: after, cara: after };
    expect(tickState(own(), members, {}, delivered)).toBe("delivered");
  });

  it("partial delivery stays at sent (not all members)", () => {
    expect(tickState(own(), members, {}, { bob: after })).toBe("sent");
  });

  it("ALL non-sender members read → read", () => {
    const read = { bob: after, cara: after };
    expect(tickState(own(), members, read, { bob: after, cara: after })).toBe("read");
  });

  it("partial read stays at delivered when all delivered", () => {
    expect(tickState(own(), members, { bob: after }, { bob: after, cara: after })).toBe(
      "delivered",
    );
  });

  it("DM (one other member) collapses naturally", () => {
    const dm = [u(me), u("bob")];
    expect(tickState(own(), dm, {}, { bob: after })).toBe("delivered");
    expect(tickState(own(), dm, { bob: after }, { bob: after })).toBe("read");
  });

  it("only-sender-present (no recipients) → sent", () => {
    expect(tickState(own(), [u(me)], {}, {})).toBe("sent");
  });

  it("excludes the assistant bot from receipt math (S14b Step 0)", () => {
    // me + bob (human) + the bot; the bot never acks but must not block ticks.
    const withBot = [u(me), u("bob"), u(ASSISTANT_BOT_USER_ID)];
    expect(tickState(own(), withBot, { bob: after }, { bob: after })).toBe("read");
    expect(tickState(own(), withBot, {}, { bob: after })).toBe("delivered");
  });

  it("watermarks before the message don't count", () => {
    expect(isDeliveredToAll(own(), [u(me), u("bob")], { bob: before })).toBe(false);
    expect(isReadByAll(own(), [u(me), u("bob")], { bob: before })).toBe(false);
  });
});

describe("partitionMessageAudience (Message info)", () => {
  const members = [u(me), u("bob"), u("cara"), u("dan")];

  it("never lists the assistant bot", () => {
    const audience = partitionMessageAudience(
      own(),
      [u(me), u("bob"), u(ASSISTANT_BOT_USER_ID)],
      {},
      {},
    );
    const all = [...audience.read, ...audience.delivered, ...audience.pending].map(
      (e) => e.user.id,
    );
    expect(all).not.toContain(ASSISTANT_BOT_USER_ID);
    expect(all).toContain("bob");
  });

  it("partitions non-sender members into read / delivered / pending with times", () => {
    const audience = partitionMessageAudience(
      own(),
      members,
      { bob: after }, // bob read
      { bob: after, cara: after }, // cara only delivered; dan nothing
    );
    expect(audience.read.map((e) => e.user.id)).toEqual(["bob"]);
    expect(audience.read[0]!.at).toBe(after);
    expect(audience.delivered.map((e) => e.user.id)).toEqual(["cara"]);
    expect(audience.pending.map((e) => e.user.id)).toEqual(["dan"]);
  });
});

// QC_005 regression: the `read` socket event → applyReadEvent (channels cache
// `memberReadAt`) → ConversationView passes `channel.memberReadAt` → tickState.
// This guards the data contract between the two ends of that wiring (the keys
// applyReadEvent writes are the keys tickState reads), so the blue "read" tick
// can't silently stop working.
describe("read event → tick contract (QC_005)", () => {
  const channelId = "c1";
  const dm: ChannelList = {
    priority: [],
    recent: [
      {
        channelId,
        name: "Bob",
        avatarUrl: null,
        type: "dm",
        visibility: "private",
        isPriority: false,
        unreadCount: 0,
        lastActivityAt: created,
        members: [u(me), u("bob")],
        memberReadAt: {},
        memberDeliveredAt: { bob: after },
        lastMessage: null,
      },
    ],
  } as unknown as ChannelList;

  it("a bob `read` watermark flips an own message from delivered → read", () => {
    // Before the read event: delivered (bob received, not yet read).
    const item0 = dm.recent[0]!;
    expect(tickState(own(), item0.members, item0.memberReadAt, item0.memberDeliveredAt)).toBe(
      "delivered",
    );

    // Apply the read event exactly as onRead does in the client.
    const next = applyReadEvent(dm, channelId, "bob", after);
    const item1 = next.recent[0]!;
    expect(item1.memberReadAt).toEqual({ bob: after });
    expect(tickState(own(), item1.members, item1.memberReadAt, item1.memberDeliveredAt)).toBe(
      "read",
    );
  });
});
