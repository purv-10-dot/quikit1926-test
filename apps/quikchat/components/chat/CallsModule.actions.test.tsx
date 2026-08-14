// @vitest-environment jsdom
/**
 * The four call-log detail buttons. Three had no `onClick` at all; the fourth
 * ("Org chart") had no destination in this codebase and was removed rather than
 * given an invented one.
 *
 * These assert the control DOES something — which opener it calls and with what
 * — not that it renders.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  fetchCallHistory: vi.fn(),
  createChannel: vi.fn(),
  sendMessage: vi.fn(),
  openChannel: vi.fn(),
  startCallWith: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  fetchCallHistory: h.fetchCallHistory,
  createChannel: h.createChannel,
  sendMessage: h.sendMessage,
}));
vi.mock("@/components/notifications/NotificationProvider", () => ({
  useNotifications: () => ({ openChannel: h.openChannel }),
}));
vi.mock("@/components/profile/ProfileProvider", () => ({
  useProfile: () => ({ startCallWith: h.startCallWith }),
}));

import { CallsModule } from "./CallsModule";

const CALL = {
  id: "c-1",
  name: "Bo",
  avatarUrl: null,
  direction: "outgoing" as const,
  startedAt: new Date("2026-03-02T10:00:00Z").toISOString(),
  durationSeconds: 300,
  channelId: "chan-1",
  otherUserId: "u-bo",
};

function renderModule() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <CallsModule />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  Object.values(h).forEach((fn) => fn.mockReset());
  h.fetchCallHistory.mockResolvedValue([CALL]);
});

describe("CallsModule — detail actions", () => {
  it("Chat opens the call's conversation", async () => {
    renderModule();
    fireEvent.click(await screen.findByRole("button", { name: /Bo/ }));

    fireEvent.click(screen.getByRole("button", { name: "Chat" }));

    await waitFor(() => expect(h.openChannel).toHaveBeenCalledWith("chan-1"));
    // The call already had a channel, so no DM needed creating.
    expect(h.createChannel).not.toHaveBeenCalled();
  });

  it("Call and Video call start calls of the RIGHT type", async () => {
    // The distinction the widened `registerStartCall` signature exists for:
    // before it, both buttons could only ever have produced one call type.
    renderModule();
    fireEvent.click(await screen.findByRole("button", { name: /Bo/ }));

    fireEvent.click(screen.getByRole("button", { name: "Call" }));
    expect(h.startCallWith).toHaveBeenCalledWith("u-bo", "audio");

    fireEvent.click(screen.getByRole("button", { name: "Video call" }));
    expect(h.startCallWith).toHaveBeenCalledWith("u-bo", "video");
  });

  it("no longer renders an Org chart button", async () => {
    // Removed, not wired: QuikChat has no org-chart destination to point at.
    renderModule();
    fireEvent.click(await screen.findByRole("button", { name: /Bo/ }));

    expect(screen.queryByRole("button", { name: "Org chart" })).toBeNull();
  });
});
