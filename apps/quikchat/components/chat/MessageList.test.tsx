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
