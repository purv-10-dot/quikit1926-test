import { afterEach, describe, expect, it, vi } from "vitest";
import {
  publishLocalNotification,
  subscribeLocalNotification,
} from "@/lib/notifications/local-bus";
import type { NotificationEvent } from "@/lib/notifications/realtime";

/**
 * The in-process bus is the realtime transport when Redis is absent (the normal
 * case under `next dev`). It must deliver events to a subscriber synchronously,
 * isolate channels, and stop delivering after unsubscribe so SSE reconnects
 * don't leak listeners.
 */
describe("local notification bus", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const event = (id: string): NotificationEvent => ({
    id,
    title: "Task assigned to you",
    body: "Follow up with Acme.",
    category: "task",
    link: "/tasks",
    createdAt: "2026-06-19T10:00:00.000Z",
  });

  it("delivers a published event to a subscriber on the same channel", () => {
    const channel = "quikcrm:notifications:t1:u1";
    const handler = vi.fn();
    const unsubscribe = subscribeLocalNotification(channel, handler);

    publishLocalNotification(channel, event("n1"));

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ id: "n1" }));
    unsubscribe();
  });

  it("does not leak across channels (per-user isolation)", () => {
    const handler = vi.fn();
    const unsubscribe = subscribeLocalNotification(
      "quikcrm:notifications:t1:u1",
      handler,
    );

    publishLocalNotification("quikcrm:notifications:t1:u2", event("other"));

    expect(handler).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("stops delivering after unsubscribe", () => {
    const channel = "quikcrm:notifications:t1:u3";
    const handler = vi.fn();
    const unsubscribe = subscribeLocalNotification(channel, handler);

    publishLocalNotification(channel, event("before"));
    unsubscribe();
    publishLocalNotification(channel, event("after"));

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ id: "before" }));
  });

  it("publishing with no subscribers is a no-op (never throws)", () => {
    expect(() =>
      publishLocalNotification("quikcrm:notifications:t9:u9", event("lonely")),
    ).not.toThrow();
  });
});
