// @vitest-environment jsdom
/**
 * Desktop deep links. `quikchat://new-chat` used to be a documented TODO and a
 * silent no-op — the composer trigger lives in ChatWorkspace local state and
 * nothing outside it could reach it. It now goes through a registered opener,
 * the same mechanism `quikchat://open/<id>` already used.
 */
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ openChannel: vi.fn(), openNewChat: vi.fn() }));
vi.mock("@/components/notifications/NotificationProvider", () => ({
  useNotifications: () => ({ unreadCount: 0, openChannel: h.openChannel, openNewChat: h.openNewChat }),
}));

import { DesktopBridge } from "./DesktopBridge";

/** Captures the handler DesktopBridge subscribes with, so tests can fire URLs. */
function installElectron() {
  let handler: ((url: string) => void) | null = null;
  (window as unknown as { electron: unknown }).electron = {
    isElectron: true,
    platform: "win32",
    unread: { set: vi.fn().mockResolvedValue(undefined) },
    deepLinks: {
      onUrl: (cb: (url: string) => void) => {
        handler = cb;
        return () => undefined;
      },
    },
  };
  return { fire: (url: string) => handler?.(url) };
}

beforeEach(() => {
  h.openChannel.mockReset();
  h.openNewChat.mockReset();
  delete (window as unknown as { electron?: unknown }).electron;
});

describe("DesktopBridge deep links", () => {
  it("quikchat://new-chat opens the composer", () => {
    const el = installElectron();
    render(<DesktopBridge />);

    el.fire("quikchat://new-chat");

    expect(h.openNewChat).toHaveBeenCalledTimes(1);
    expect(h.openChannel).not.toHaveBeenCalled();
  });

  it("quikchat://open/<id> still routes to the channel", () => {
    const el = installElectron();
    render(<DesktopBridge />);

    el.fire("quikchat://open/chan-1");

    expect(h.openChannel).toHaveBeenCalledWith("chan-1");
    expect(h.openNewChat).not.toHaveBeenCalled();
  });

  it("ignores unknown verbs and malformed urls", () => {
    const el = installElectron();
    render(<DesktopBridge />);

    el.fire("quikchat://not-a-verb/x");
    el.fire("::::");

    expect(h.openNewChat).not.toHaveBeenCalled();
    expect(h.openChannel).not.toHaveBeenCalled();
  });
});
