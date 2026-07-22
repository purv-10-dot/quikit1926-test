import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  fireOsNotification,
  notificationsSupported,
  permissionState,
  requestPermission,
  shouldFireOsNotification,
} from "./web-notifications";

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
});
