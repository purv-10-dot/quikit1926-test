import type { MessageDto, PublicUser } from "@/lib/shared";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { decideScroll, MessageList } from "./MessageList";

const me = "u-me";
const members: PublicUser[] = [
  { id: me, displayName: "Me", avatarUrl: null },
  { id: "u-bob", displayName: "Bob", avatarUrl: null },
];

const base = (over: Partial<MessageDto> & { id: string }): MessageDto => ({
  channelId: "c1",
  senderId: "u-bob",
  actorType: "human",
  type: "Text",
  content: "hi",
  data: null,
  parentMessageId: null,
  parentPreview: null,
  isPinned: false,
  reactions: [],
  mentions: [],
  createdAt: new Date("2026-05-08T12:00:00Z").toISOString(),
  editedAt: null,
  ...over,
});

function renderList(messages: MessageDto[], memberReadAt: Record<string, string | null> = {}) {
  return render(
    <MessageList
      messages={messages}
      currentUserId={me}
      members={members}
      memberReadAt={memberReadAt}
      memberDeliveredAt={{}}
    />,
  );
}

describe("MessageList", () => {
  it("renders text with a mention pill", () => {
    renderList([
      base({
        id: "a",
        content: "hi @Bob",
        mentions: [{ userId: "u-bob", displayName: "Bob", offsetStart: 3, offsetEnd: 7 }],
      }),
    ]);
    const pill = screen.getByText("@Bob");
    expect(pill.className).toContain("qc-mention");
  });

  it("renders a SystemActivity row", () => {
    renderList([base({ id: "s", type: "SystemActivity", content: "Bob joined" })]);
    expect(screen.getByTestId("system-row")).toHaveTextContent("Bob joined");
  });

  it("renders a Delete tombstone", () => {
    renderList([base({ id: "d", type: "Delete", content: "" })]);
    expect(screen.getByText("This message was deleted")).toBeInTheDocument();
  });

  it("shows an (edited) label", () => {
    renderList([base({ id: "e", content: "fixed", editedAt: new Date().toISOString() })]);
    expect(screen.getByText("(edited)")).toBeInTheDocument();
  });

  it("shows a READ tick on an own message once all members have read it", () => {
    const ts = new Date("2026-05-08T12:00:00Z").toISOString();
    renderList([base({ id: "mine", senderId: me, content: "mine", createdAt: ts })], {
      "u-bob": new Date("2026-05-08T12:01:00Z").toISOString(),
    });
    expect(screen.getByTestId("tick").getAttribute("data-state")).toBe("read");
  });

  it("stays at SENT when members haven't read or been delivered", () => {
    const ts = new Date("2026-05-08T12:00:00Z").toISOString();
    renderList([base({ id: "mine", senderId: me, content: "mine", createdAt: ts })], {
      "u-bob": new Date("2026-05-08T11:00:00Z").toISOString(), // read before send → not counted
    });
    expect(screen.getByTestId("tick").getAttribute("data-state")).toBe("sent");
  });

  it("renders own messages right (data-own) and others left with an avatar (S14a)", () => {
    renderList([
      base({ id: "other", senderId: "u-bob", content: "from bob" }),
      base({ id: "mine", senderId: me, content: "from me", createdAt: "2026-05-08T12:01:00Z" }),
    ]);
    const list = screen.getByTestId("message-list");
    const own = list.querySelector('[data-message-id="mine"]') as HTMLElement;
    const other = list.querySelector('[data-message-id="other"]') as HTMLElement;
    expect(own.getAttribute("data-own")).toBe("true");
    expect(other.getAttribute("data-own")).toBe("false");
    // Other rows carry an avatar gutter; own rows do not.
    expect(other.querySelector(".qc-row__gutter")).not.toBeNull();
    expect(own.querySelector(".qc-row__gutter")).toBeNull();
  });

  it("centers system messages (no bubble)", () => {
    renderList([base({ id: "s", type: "SystemActivity", content: "Bob joined" })]);
    expect(screen.getByTestId("system-row")).toBeInTheDocument();
    expect(document.querySelector(".qc-bubble")).toBeNull();
  });

  it("orders a descending input ascending at the render seam (Bug 1)", () => {
    renderList([
      base({ id: "newer", content: "second", createdAt: "2026-05-08T12:05:00Z" }),
      base({ id: "older", content: "first", createdAt: "2026-05-08T12:00:00Z" }),
    ]);
    const rendered = screen.getByTestId("message-list").textContent ?? "";
    expect(rendered.indexOf("first")).toBeLessThan(rendered.indexOf("second"));
  });
});

describe("MessageList — unread divider", () => {
  function renderUnread(messages: MessageDto[], openedUnreadCount: number) {
    return render(
      <MessageList
        messages={messages}
        currentUserId={me}
        members={members}
        memberReadAt={{}}
        memberDeliveredAt={{}}
        openedUnreadCount={openedUnreadCount}
      />,
    );
  }

  const three = [
    base({ id: "a", content: "one", createdAt: "2026-05-08T12:00:00Z" }),
    base({ id: "b", content: "two", createdAt: "2026-05-08T12:01:00Z" }),
    base({ id: "c", content: "three", createdAt: "2026-05-08T12:02:00Z" }),
  ];

  it("renders above the first unread message", () => {
    renderUnread(three, 2); // "b" and "c" are unread → divider above "b"
    const list = screen.getByTestId("message-list");
    const divider = screen.getByTestId("unread-divider");
    const rowB = list.querySelector('[data-message-id="b"]')!;
    // The divider's wrapper <div> immediately precedes "b"'s wrapper <div>.
    expect(divider.closest("div")!.nextElementSibling).toBe(rowB.closest("div"));
    expect(divider).toHaveTextContent("2 unread messages");
    // The existing single-list invariant, asserted alongside the new feature.
    expect(screen.getAllByTestId("message-list")).toHaveLength(1);
  });

  it("does not render when everything is read", () => {
    renderUnread(three, 0);
    expect(screen.queryByTestId("unread-divider")).toBeNull();
  });

  it("stays put when a new message arrives while the channel is open", () => {
    const { rerender } = renderUnread(three, 1); // only "c" unread → divider above "c"
    expect(screen.getByTestId("unread-divider").closest("div")!.nextElementSibling).toBe(
      screen.getByTestId("message-list").querySelector('[data-message-id="c"]')!.closest("div"),
    );

    // A new message arrives (appended) — same mount, no key change, matching
    // what actually happens while ConversationView stays on this channel.
    rerender(
      <MessageList
        messages={[
          ...three,
          base({ id: "d", content: "four", createdAt: "2026-05-08T12:03:00Z" }),
        ]}
        currentUserId={me}
        members={members}
        memberReadAt={{}}
        memberDeliveredAt={{}}
        openedUnreadCount={1}
      />,
    );

    // Still above "c" — did NOT chase the new message "d" to the bottom.
    const list = screen.getByTestId("message-list");
    expect(screen.getAllByTestId("unread-divider")).toHaveLength(1);
    expect(screen.getByTestId("unread-divider").closest("div")!.nextElementSibling).toBe(
      list.querySelector('[data-message-id="c"]')!.closest("div"),
    );
  });

  it("recalculates after a switch away and back (remount, not rerender)", () => {
    const first = renderUnread(three, 1); // divider above "c"
    expect(
      screen.getByTestId("unread-divider").closest("div")!.nextElementSibling,
    ).toBe(screen.getByTestId("message-list").querySelector('[data-message-id="c"]')!.closest("div"));
    first.unmount();

    // Simulate leaving and returning: a fresh mount (ConversationView remounts
    // MessageList via its channel-keyed `key`), with a channel now fully read.
    renderUnread(three, 0);
    expect(screen.queryByTestId("unread-divider")).toBeNull();
  });

  it("REGRESSION: the label always agrees with the rendered position, even when fewer unread-eligible messages are loaded than openedUnreadCount claims", () => {
    // The exact reported bug: openedUnreadCount=7 (fresh + correct, from the
    // channels list) but only 6 non-self messages are actually loaded at
    // freeze time (a stale messages-query cache page not yet caught up by
    // its background refetch — see MessageList's comment on the freeze).
    // Before the fix, the label rendered the raw `openedUnreadCount` (7)
    // while the position — resolved against the shorter array — only had 6
    // messages below it. Whatever the label says, it must match reality.
    const six = Array.from({ length: 6 }, (_, i) =>
      base({ id: `m${i}`, content: `msg ${i}`, createdAt: `2026-05-08T12:0${i}:00Z` }),
    );
    renderUnread(six, 7);

    const list = screen.getByTestId("message-list");
    const divider = screen.getByTestId("unread-divider");
    // The divider's wrapper div also holds the boundary message's own row as
    // the divider's next sibling (see the JSX: date-divider?, unread-divider?,
    // MessageRow, all inside one `<div key={message.id}>`).
    const boundaryRow = divider.nextElementSibling as HTMLElement;
    const allRows = Array.from(list.querySelectorAll("[data-message-id]"));
    const boundaryIdx = allRows.indexOf(boundaryRow);
    expect(boundaryIdx).toBeGreaterThanOrEqual(0);
    const belowCount = allRows.length - boundaryIdx; // inclusive of the boundary row

    const labelMatch = /^(\d+) unread message/.exec(divider.textContent ?? "");
    expect(labelMatch).not.toBeNull();
    const labelledCount = Number(labelMatch![1]);
    // The actual bug assertion: label and rendered position must agree.
    expect(labelledCount).toBe(belowCount);
    // Pinned to the honest number (6, what was actually found) — not the
    // claimed 7 the old code would have shown.
    expect(divider).toHaveTextContent("6 unread messages");
    expect(belowCount).toBe(6);
  });

  it("sending clears the divider", () => {
    const { rerender } = renderUnread(three, 1); // divider above "c"
    expect(screen.getByTestId("unread-divider")).toBeInTheDocument();

    // The current user sends a new message — appended, senderId === me.
    rerender(
      <MessageList
        messages={[...three, base({ id: "mine", senderId: me, content: "sent", createdAt: "2026-05-08T12:03:00Z" })]}
        currentUserId={me}
        members={members}
        memberReadAt={{}}
        memberDeliveredAt={{}}
        openedUnreadCount={1}
      />,
    );

    expect(screen.queryByTestId("unread-divider")).toBeNull();
  });

  it("an incoming message (from someone else) does not clear the divider", () => {
    const { rerender } = renderUnread(three, 1); // divider above "c"
    expect(screen.getByTestId("unread-divider")).toBeInTheDocument();

    rerender(
      <MessageList
        messages={[...three, base({ id: "d", senderId: "u-bob", content: "four", createdAt: "2026-05-08T12:03:00Z" })]}
        currentUserId={me}
        members={members}
        memberReadAt={{}}
        memberDeliveredAt={{}}
        openedUnreadCount={1}
      />,
    );

    expect(screen.getByTestId("unread-divider")).toBeInTheDocument();
  });
});

describe("MessageList — deferred divider resolution (messagesFetching)", () => {
  const three = [
    base({ id: "a", content: "one", createdAt: "2026-05-08T12:00:00Z" }),
    base({ id: "b", content: "two", createdAt: "2026-05-08T12:01:00Z" }),
    base({ id: "c", content: "three", createdAt: "2026-05-08T12:02:00Z" }),
  ];
  // 7 messages, all from someone else, oldest (m0) to newest (m6).
  const seven = Array.from({ length: 7 }, (_, i) =>
    base({ id: `m${i}`, senderId: "u-bob", content: `msg ${i}`, createdAt: `2026-05-08T12:0${i}:00Z` }),
  );
  const stale = seven.slice(1); // missing m0, the oldest unread message

  function renderDeferred(
    messages: MessageDto[],
    openedUnreadCount: number,
    messagesFetching: boolean,
  ) {
    return render(
      <MessageList
        messages={messages}
        currentUserId={me}
        members={members}
        memberReadAt={{}}
        memberDeliveredAt={{}}
        openedUnreadCount={openedUnreadCount}
        messagesFetching={messagesFetching}
      />,
    );
  }

  it("resolves synchronously when messagesFetching is omitted — no visible change on a first-time open", () => {
    // The common path (no stale cache): messagesFetching defaults to false,
    // so resolution must still happen within the same render/mount as
    // before this change, not on some later tick.
    renderDeferred(three, 1, false);
    expect(screen.getByTestId("unread-divider")).toBeInTheDocument();
  });

  it("REGRESSION: defers resolution while messagesFetching is true, then resolves against the CORRECT, complete array once it settles", () => {
    // The exact bug the deferred design fixes: `stale` is missing the oldest
    // unread message (m0) — a stale cached page not yet caught up by its
    // background refetch. While messagesFetching is true, nothing must
    // resolve yet (resolving against `stale` now would freeze on "m1" —
    // wrong, and permanent, since the design never re-resolves).
    const { rerender } = renderDeferred(stale, 7, true);
    expect(screen.queryByTestId("unread-divider")).toBeNull();

    // The refetch settles: messagesFetching flips false, `messages` is now
    // the full, correct 7-message array.
    rerender(
      <MessageList
        messages={seven}
        currentUserId={me}
        members={members}
        memberReadAt={{}}
        memberDeliveredAt={{}}
        openedUnreadCount={7}
        messagesFetching={false}
      />,
    );

    const divider = screen.getByTestId("unread-divider");
    const list = screen.getByTestId("message-list");
    // Resolved against the COMPLETE array: boundary is "m0", not "m1" (which
    // is where resolving against the incomplete `stale` array would have
    // permanently pinned it).
    expect(divider.nextElementSibling).toBe(list.querySelector('[data-message-id="m0"]'));
    expect(divider).toHaveTextContent("7 unread messages");
  });

  it("skips resolving entirely if the user sends before messagesFetching ever settles", () => {
    const { rerender } = renderDeferred(stale, 7, true);
    expect(screen.queryByTestId("unread-divider")).toBeNull();

    // A send lands WHILE still waiting on the refetch — appended, senderId
    // === me, messagesFetching still true.
    rerender(
      <MessageList
        messages={[...stale, base({ id: "mine", senderId: me, content: "sent", createdAt: "2026-05-08T12:10:00Z" })]}
        currentUserId={me}
        members={members}
        memberReadAt={{}}
        memberDeliveredAt={{}}
        openedUnreadCount={7}
        messagesFetching={true}
      />,
    );
    expect(screen.queryByTestId("unread-divider")).toBeNull();

    // The refetch finally settles — must NOT resurrect a divider: the user
    // already read everything above by sending, before there was ever
    // anything to show.
    rerender(
      <MessageList
        messages={[...seven, base({ id: "mine", senderId: me, content: "sent", createdAt: "2026-05-08T12:10:00Z" })]}
        currentUserId={me}
        members={members}
        memberReadAt={{}}
        memberDeliveredAt={{}}
        openedUnreadCount={7}
        messagesFetching={false}
      />,
    );
    expect(screen.queryByTestId("unread-divider")).toBeNull();
  });
});

describe("decideScroll (Bug 2)", () => {
  const snap = (len: number, firstId: string, lastId: string) => ({ len, firstId, lastId });

  it("scrolls to bottom on channel open (no previous snapshot)", () => {
    expect(decideScroll(null, snap(3, "a", "c"), { nearBottom: false, lastFromSelf: false })).toBe(
      "bottom",
    );
  });

  it("preserves position when older history is prepended", () => {
    const prev = snap(2, "c", "d");
    const next = snap(4, "a", "d"); // grew + first id changed
    expect(decideScroll(prev, next, { nearBottom: false, lastFromSelf: false })).toBe("preserve");
  });

  it("scrolls for a near-bottom incoming, but not when scrolled up", () => {
    const prev = snap(2, "a", "b");
    const next = snap(3, "a", "c");
    expect(decideScroll(prev, next, { nearBottom: true, lastFromSelf: false })).toBe("bottom");
    expect(decideScroll(prev, next, { nearBottom: false, lastFromSelf: false })).toBe("none");
  });

  it("always scrolls for the viewer's own send even when scrolled up", () => {
    const prev = snap(2, "a", "b");
    const next = snap(3, "a", "mine");
    expect(decideScroll(prev, next, { nearBottom: false, lastFromSelf: true })).toBe("bottom");
  });

  it("does nothing when the list didn't grow", () => {
    const s = snap(3, "a", "c");
    expect(decideScroll(s, s, { nearBottom: false, lastFromSelf: false })).toBe("none");
  });
});

describe("re-pin on late content resize (Item 3)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("re-scrolls to the bottom when content grows while the viewer is near bottom", () => {
    // Capture the ResizeObserver callback MessageList registers.
    let roCb: (() => void) | null = null;
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(cb: () => void) {
          roCb = cb;
        }
        observe() {}
        disconnect() {}
      },
    );
    const scrollSpy = vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => {});

    renderList([base({ id: "a", content: "hi" })]);
    // Ignore the initial mount scroll; assert the RESIZE re-pin specifically.
    scrollSpy.mockClear();
    expect(typeof roCb).toBe("function");

    // Simulate media/layout growing the content after paint (viewer starts
    // near the bottom by default).
    roCb!();
    expect(scrollSpy).toHaveBeenCalled();
  });
});
