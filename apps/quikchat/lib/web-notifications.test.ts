import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  desktopBridgeAvailable,
  fireOsNotification,
  notificationsSupported,
  permissionState,
  requestPermission,
  shouldFireOsNotification,
} from "./web-notifications";

type ShowOpts = {
  title: string;
  body?: string;
  icon?: string;
  channelId?: string;
  url?: string;
};
type ElectronCarrier = { electron?: unknown };

/** Stand in for the Electron preload's `window.electron`. Returns the show spy. */
function installElectronBridge() {
  const show = vi.fn(async (_opts: ShowOpts) => true);
  (window as unknown as ElectronCarrier).electron = {
    isElectron: true,
    platform: "win32",
    unread: { set: vi.fn(async () => undefined) },
    deepLinks: { onUrl: vi.fn(() => () => undefined) },
    notifications: { show, requestPermission: vi.fn(async () => "granted") },
  };
  return show;
}

function removeElectronBridge() {
  delete (window as unknown as ElectronCarrier).electron;
}

// A controllable mock of the browser Notification API.
class MockNotification {
  static permission: NotificationPermission = "default";
  static requestPermission = vi.fn(async () => MockNotification.permission);
  onclick: (() => void) | null = null;
  constructor(
    public title: string,
    public options?: NotificationOptions,
  ) {
    MockNotification.instances.push(this);
  }
  static instances: MockNotification[] = [];
}

function setVisibility(state: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => state,
  });
}

beforeEach(() => {
  MockNotification.instances = [];
  MockNotification.permission = "default";
  MockNotification.requestPermission = vi.fn(async () => MockNotification.permission);
  (globalThis as unknown as { Notification: unknown }).Notification = MockNotification;
  setVisibility("visible");
  // Default every test to a plain browser tab; the Electron cases opt in.
  removeElectronBridge();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("permissionState / support", () => {
  it("reflects Notification.permission", () => {
    expect(notificationsSupported()).toBe(true);
    MockNotification.permission = "granted";
    expect(permissionState()).toBe("granted");
  });
});

describe("requestPermission", () => {
  it("delegates to Notification.requestPermission", async () => {
    MockNotification.permission = "granted";
    const result = await requestPermission();
    expect(MockNotification.requestPermission).toHaveBeenCalled();
    expect(result).toBe("granted");
  });
});

describe("shouldFireOsNotification", () => {
  it("fires only when desktop + unfocused + granted", () => {
    MockNotification.permission = "granted";
    setVisibility("hidden");
    expect(shouldFireOsNotification(true)).toBe(true);
  });
  it("does not fire when focused", () => {
    MockNotification.permission = "granted";
    setVisibility("visible");
    expect(shouldFireOsNotification(true)).toBe(false);
  });
  it("does not fire when desktop flag is false", () => {
    MockNotification.permission = "granted";
    setVisibility("hidden");
    expect(shouldFireOsNotification(false)).toBe(false);
  });
  it("does not fire when permission is not granted", () => {
    MockNotification.permission = "denied";
    setVisibility("hidden");
    expect(shouldFireOsNotification(true)).toBe(false);
    MockNotification.permission = "default";
    expect(shouldFireOsNotification(true)).toBe(false);
  });

  // The Electron bridge fires from the main process, gated by the OS — not by
  // this renderer's Notification.permission. If the permission read were the
  // only gate, a shell reporting anything but "granted" would silently lose all
  // native notifications while every downstream piece still looked correct.
  it("treats the Electron bridge as sufficient on its own, ignoring renderer permission", () => {
    setVisibility("hidden");
    installElectronBridge();
    expect(desktopBridgeAvailable()).toBe(true);
    MockNotification.permission = "default";
    expect(shouldFireOsNotification(true)).toBe(true);
    MockNotification.permission = "denied";
    expect(shouldFireOsNotification(true)).toBe(true);
  });

  it("still requires desktop + unfocused even with the bridge present", () => {
    installElectronBridge();
    MockNotification.permission = "granted";
    setVisibility("visible");
    expect(shouldFireOsNotification(true)).toBe(false); // focused
    setVisibility("hidden");
    expect(shouldFireOsNotification(false)).toBe(false); // server said no desktop
  });
});

describe("fireOsNotification", () => {
  it("constructs a Notification when granted and wires onClick", () => {
    MockNotification.permission = "granted";
    const onClick = vi.fn();
    const note = fireOsNotification({
      title: "QuikChat — #design",
      body: "hi",
      tag: "c1",
      onClick,
    });
    expect(note).not.toBeNull();
    expect(MockNotification.instances).toHaveLength(1);
    expect(MockNotification.instances[0]!.title).toBe("QuikChat — #design");
    expect(MockNotification.instances[0]!.options?.tag).toBe("c1");
    // Clicking invokes the handler.
    MockNotification.instances[0]!.onclick?.();
    expect(onClick).toHaveBeenCalled();
  });

  it("returns null and constructs nothing when not granted", () => {
    MockNotification.permission = "default";
    expect(fireOsNotification({ title: "x" })).toBeNull();
    expect(MockNotification.instances).toHaveLength(0);
  });

  describe("inside the Electron shell", () => {
    it("delegates to the bridge and constructs NO browser Notification", () => {
      MockNotification.permission = "granted";
      const show = installElectronBridge();

      const note = fireOsNotification({
        title: "QuikChat — #design",
        body: "hi",
        tag: "c1",
        icon: "/icon.png",
        channelId: "c1",
        onClick: vi.fn(),
      });

      expect(show).toHaveBeenCalledTimes(1);
      expect(show.mock.calls[0]![0]).toEqual({
        title: "QuikChat — #design",
        body: "hi",
        icon: "/icon.png",
        channelId: "c1",
      });
      // Double-alert regression: exactly one native notification per event.
      expect(MockNotification.instances).toHaveLength(0);
      expect(note).toBeNull();
    });

    it("never puts a function in the IPC payload (onClick is not forwarded)", () => {
      MockNotification.permission = "granted";
      const show = installElectronBridge();
      const onClick = vi.fn();

      fireOsNotification({ title: "t", channelId: "c1", onClick });

      const payload = show.mock.calls[0]![0] as Record<string, unknown>;
      expect(payload).not.toHaveProperty("onClick");
      expect(Object.values(payload).every((v) => typeof v !== "function")).toBe(true);
      // The click loop is closed by the main process's `deeplink` IPC instead.
      expect(onClick).not.toHaveBeenCalled();
    });

    it("sends channelId as undefined — never a stringified null — when absent", () => {
      MockNotification.permission = "granted";
      const show = installElectronBridge();

      fireOsNotification({ title: "t", tag: "msg-42", channelId: null });

      const payload = show.mock.calls[0]![0] as Record<string, unknown>;
      expect(payload.channelId).toBeUndefined();
      expect(payload.channelId).not.toBe("null");
      // `tag`'s message-id fallback must not leak in as a channel id.
      expect(Object.values(payload)).not.toContain("msg-42");
    });

    it("uses the bridge even when the renderer's browser permission is not granted", () => {
      MockNotification.permission = "denied";
      const show = installElectronBridge();

      expect(fireOsNotification({ title: "t", channelId: "c1" })).toBeNull();
      expect(show).toHaveBeenCalledTimes(1);
      expect(MockNotification.instances).toHaveLength(0);
    });

    it("swallows a rejected invoke without throwing", async () => {
      MockNotification.permission = "granted";
      const show = installElectronBridge();
      show.mockRejectedValueOnce(new Error("no handler registered"));

      expect(() => fireOsNotification({ title: "t", channelId: "c1" })).not.toThrow();
      await Promise.resolve();
    });
  });
});
